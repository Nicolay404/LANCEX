"""QA-01 y QA-08: pujas y cierres concurrentes contra PostgreSQL real (hilos con conexiones propias).

Usan transacciones reales (`transaction=True`): cada hilo confirma sus cambios como lo haría cada
uno de los tres backends locales contra la base compartida.
"""

import itertools
import threading
import uuid
from decimal import Decimal

import pytest
from django.db import connection

from apps.auctions.models import Auction, Bid
from apps.auctions.services import bidding, closing
from apps.audit.models import AuditEvent
from apps.core.errors import LancexError

from .helpers import active_auction, expire, make_user

pytestmark = pytest.mark.django_db(transaction=True)


def run_in_threads(fns):
    barrier = threading.Barrier(len(fns))
    results: list = [None] * len(fns)

    def worker(i, fn):
        try:
            barrier.wait()
            results[i] = fn()
        except Exception as exc:  # noqa: BLE001 - se inspecciona en la prueba
            results[i] = exc
        finally:
            connection.close()

    threads = [threading.Thread(target=worker, args=(i, fn)) for i, fn in enumerate(fns)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=60)
    return results


def test_twenty_parallel_bids_keep_the_book_consistent():
    """QA-01: 20 pujas simultáneas -> seq contiguo, precio = mayor aceptada, sin duplicados."""
    auction = active_auction()
    bidders = [make_user() for _ in range(20)]
    amounts = [Decimal("100.00") + Decimal(i * 10) for i in range(20)]

    def place(user, amount):
        return lambda: bidding.place_bid(user, auction.pk, amount=amount, idempotency_key=uuid.uuid4())

    results = run_in_threads([place(u, a) for u, a in zip(bidders, amounts, strict=True)])

    accepted = [r for r in results if not isinstance(r, Exception)]
    rejected = [r for r in results if isinstance(r, Exception)]
    assert accepted, "al menos una puja debe aceptarse"
    assert all(isinstance(r, LancexError) and r.code in {"BID_BELOW_MINIMUM"} for r in rejected), rejected

    book = list(Bid.objects.filter(auction_id=auction.pk).order_by("seq"))
    auction.refresh_from_db()
    assert [b.seq for b in book] == list(range(1, len(book) + 1))
    assert len(book) == len(accepted) == auction.bid_count
    assert all(later.amount >= earlier.amount + Decimal("5.00") for earlier, later in itertools.pairwise(book))
    assert auction.current_price == book[-1].amount
    assert str(auction.leader_user_id) == str(book[-1].bidder_user_id)


def test_same_idempotency_key_in_parallel_creates_one_bid():
    """QA-08: doble clic / reintento simultáneo -> una sola puja."""
    auction = active_auction()
    user = make_user()
    key = uuid.uuid4()
    results = run_in_threads(
        [lambda: bidding.place_bid(user, auction.pk, amount=Decimal("100.00"), idempotency_key=key)] * 5
    )
    assert not [r for r in results if isinstance(r, Exception)], results
    assert sum(not r.replayed for r in results) == 1
    assert Bid.objects.filter(auction_id=auction.pk).count() == 1


def test_three_backends_closing_at_once_produce_one_result():
    """ADR-0005: tres `close_due_auctions` simultáneos -> un solo `auction_closed`."""
    auction = active_auction()
    bidding.place_bid(make_user(), auction.pk, amount=Decimal("100.00"), idempotency_key=uuid.uuid4())
    expire(auction)

    results = run_in_threads([lambda: closing.close_auction(auction.pk, skip_locked=True)] * 3)
    assert sum(r.closed for r in results) == 1
    assert Auction.objects.get(pk=auction.pk).status == "closed"
    assert AuditEvent.objects.filter(auction_id=auction.pk, action="auction_closed").count() == 1


def test_parallel_sealed_offers_from_one_user_keep_one_current_version():
    """LX-41: ediciones simultáneas -> una sola oferta vigente y contador público en 1."""
    from apps.auctions.models import SealedOffer
    from apps.auctions.services import sealed

    auction = active_auction(mechanism="sealed", min_increment=None, starting_price="50.00")
    user = make_user()
    amounts = [Decimal("60.00") + Decimal(i) for i in range(5)]
    results = run_in_threads(
        [(lambda a=a: sealed.submit_offer(user, auction.pk, amount=a, idempotency_key=uuid.uuid4())) for a in amounts]
    )
    assert not [r for r in results if isinstance(r, Exception)], results
    assert SealedOffer.objects.filter(auction_id=auction.pk, bidder_user_id=user.pk, is_current=True).count() == 1
    assert SealedOffer.objects.filter(auction_id=auction.pk).count() == 5
    auction.refresh_from_db()
    assert auction.active_offer_count == 1
