"""LX-40 / LX-41 / LX-43: sobre cerrado contra PostgreSQL.

Lo más importante: ningún importe ajeno sale antes del cierre (QA-02 para ofertas selladas),
ni por la API, ni por auditoría, ni por canales laterales (`version`, contadores).
"""

import uuid

import pytest
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction, SealedOffer
from apps.auctions.services import closing
from apps.audit.models import AuditEvent

from .helpers import active_auction, bid, client_for, expire, make_user

pytestmark = pytest.mark.django_db

SECRET = "987.65"


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")


def sealed_auction(**overrides):
    return active_auction(mechanism="sealed", min_increment=None, starting_price="50.00", **overrides)


def offer(client, auction, amount, key=None):
    return client.put(
        f"/api/v1/auctions/{auction.pk}/sealed-offer/",
        {"amount": amount},
        format="json",
        HTTP_IDEMPOTENCY_KEY=key or str(uuid.uuid4()),
    )


def code(response):
    return response.json()["code"]


def everything_public(auction, client):
    paths = ("", "live/", "bids/", "result/", "sealed-offer/")
    bodies = [client.get(f"/api/v1/auctions/{auction.pk}/{p}").content.decode() for p in paths]
    bodies.append(client.get("/api/v1/auctions/?mechanism=sealed&page_size=50").content.decode())
    return "\n".join(bodies)


class TestSubmission:
    def test_submit_edit_and_withdraw_own_offer(self):
        auction = sealed_auction()
        ana = client_for(make_user())
        first = offer(ana, auction, "80.00")
        assert first.status_code == 201
        assert first.json() == {**first.json(), "amount": "80.00", "active_offer_count": 1}

        edited = offer(ana, auction, "90.00")
        assert edited.json()["amount"] == "90.00" and edited.json()["active_offer_count"] == 1
        assert SealedOffer.objects.filter(auction_id=auction.pk, is_current=True).count() == 1
        assert SealedOffer.objects.filter(auction_id=auction.pk).count() == 2  # la versión anterior se conserva

        assert ana.delete(f"/api/v1/auctions/{auction.pk}/sealed-offer/").status_code == 204
        assert ana.get(f"/api/v1/auctions/{auction.pk}/sealed-offer/").json()["amount"] is None
        assert ana.delete(f"/api/v1/auctions/{auction.pk}/sealed-offer/").status_code == 404
        assert Auction.objects.get(pk=auction.pk).active_offer_count == 0

    def test_idempotent_retry(self):
        auction = sealed_auction()
        ana = client_for(make_user())
        key = str(uuid.uuid4())
        assert offer(ana, auction, "80.00", key).status_code == 201
        assert offer(ana, auction, "80.00", key).status_code == 200
        assert code(offer(ana, auction, "81.00", key)) == "IDEMPOTENCY_CONFLICT"

    def test_rules(self):
        auction = sealed_auction()
        assert code(offer(client_for(make_user()), auction, "49.99")) == "BID_BELOW_MINIMUM"
        assert code(offer(client_for(auction.owner_user), auction, "500.00")) == "BID_ON_OWN_AUCTION"
        assert code(bid(client_for(make_user()), auction, "100.00")) == "MECHANISM_MISMATCH"
        expire(auction)
        assert code(offer(client_for(make_user()), auction, "80.00")) == "AUCTION_NOT_ACTIVE"

    def test_offers_on_non_sealed_are_rejected(self):
        auction = active_auction()
        assert code(offer(client_for(make_user()), auction, "200.00")) == "MECHANISM_MISMATCH"


class TestNoLeakBeforeClose:
    def test_nobody_sees_amounts_not_even_the_owner(self):
        auction = sealed_auction(reserve_price="60.00")
        ana, beto = make_user(), make_user()
        offer(client_for(ana), auction, SECRET)
        offer(client_for(beto), auction, "70.00")

        for viewer in (client_for(), client_for(beto), client_for(auction.owner_user), client_for(make_user("admin"))):
            assert SECRET not in everything_public(auction, viewer)

        public = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert public["current_price"] is None and public["bid_count"] is None
        assert public["active_offer_count"] == 2
        assert public["reserve_met"] is None  # revelaría si alguna oferta supera la reserva
        assert client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"] == []

        for event in AuditEvent.objects.filter(auction_id=auction.pk):
            assert SECRET not in str(event.data)

    def test_editing_an_offer_leaves_no_public_trace(self):
        auction = sealed_auction()
        ana = client_for(make_user())
        offer(ana, auction, "80.00")
        before = client_for().get(f"/api/v1/auctions/{auction.pk}/live/")
        offer(ana, auction, "85.00")
        after = client_for().get(f"/api/v1/auctions/{auction.pk}/live/", HTTP_IF_NONE_MATCH=before["ETag"])
        assert after.status_code == 304  # mismo ETag: nadie puede deducir que hubo una edición

    def test_result_pending_does_not_reveal_before_materializing(self):
        auction = sealed_auction()
        offer(client_for(make_user()), auction, SECRET)
        expire(auction)
        detail = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert detail["status"] == "closed" and detail["result_pending"] is True
        assert detail["current_price"] is None
        assert client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"] == []


class TestReveal:
    def test_highest_current_offer_wins_and_ranking_by_audience(self):
        auction = sealed_auction()
        ana, beto, caro = make_user(), make_user(), make_user()
        offer(client_for(ana), auction, "80.00")
        offer(client_for(beto), auction, "95.50")
        offer(client_for(caro), auction, "60.00")
        expire(auction)
        assert closing.close_auction(auction.pk).closed

        auction.refresh_from_db()
        assert (auction.outcome, str(auction.winner_user_id), str(auction.final_price)) == (
            "awarded",
            str(beto.pk),
            "95.50",
        )
        assert SealedOffer.objects.filter(auction_id=auction.pk, revealed_at__isnull=True).count() == 0
        assert AuditEvent.objects.filter(auction_id=auction.pk, action="sealed_offers_revealed").count() == 1

        public = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
        assert public["current_price"] == "95.50" and public["active_offer_count"] == 3
        assert client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"] == []

        ranking = client_for(ana).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert [(r["rank"], r["amount"], r["bidder"]) for r in ranking] == [
            (1, "95.50", "Postor 2"),
            (2, "80.00", "Tú"),
            (3, "60.00", "Postor 3"),
        ]
        assert all("bidder_identity" not in r for r in ranking)
        assert client_for(ana).get(f"/api/v1/auctions/{auction.pk}/result/").json()["viewer"]["rank"] == 2

        owner_view = client_for(auction.owner_user).get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
        assert owner_view[0]["bidder_identity"]["id"] == str(beto.pk)

    def test_edit_loses_priority_on_tie(self):
        auction = sealed_auction()
        ana, beto = make_user(), make_user()
        offer(client_for(beto), auction, "70.00")
        offer(client_for(ana), auction, "90.00")
        offer(client_for(beto), auction, "90.00")  # beto iguala editando: su versión vigente es posterior
        expire(auction)
        closing.close_auction(auction.pk)
        assert str(Auction.objects.get(pk=auction.pk).winner_user_id) == str(ana.pk)

    def test_withdrawn_offers_do_not_count_and_owner_can_cancel_after_all_withdraw(self):
        auction = sealed_auction()
        ana = client_for(make_user())
        offer(ana, auction, "80.00")
        owner = client_for(auction.owner_user)
        blocked = owner.post(f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "error"}, format="json")
        assert code(blocked) == "INVALID_STATE_TRANSITION"
        ana.delete(f"/api/v1/auctions/{auction.pk}/sealed-offer/")
        ok = owner.post(f"/api/v1/auctions/{auction.pk}/cancel/", {"reason": "error"}, format="json")
        assert ok.json()["status"] == "cancelled"

    def test_reserve_not_met_is_unsold(self):
        auction = sealed_auction(reserve_price="100.00")
        offer(client_for(make_user()), auction, "99.99")
        expire(auction)
        closing.close_auction(auction.pk)
        assert Auction.objects.get(pk=auction.pk).outcome == "unsold"
