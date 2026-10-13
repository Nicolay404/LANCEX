"""LX-60 / LX-61: cierre por vela contra PostgreSQL (QA-02 y QA-07 para la vela)."""

import subprocess
import sys
from decimal import Decimal
from pathlib import Path

import pytest
from rest_framework.throttling import ScopedRateThrottle

from apps.auctions.models import Auction, Bid
from apps.auctions.services import bidding, closing
from apps.audit.models import AuditEvent

from .helpers import active_auction, bid, client_for, expire, make_user

pytestmark = pytest.mark.django_db

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def _relaxed(monkeypatch):
    monkeypatch.setattr(bidding, "MIN_SECONDS_BETWEEN_BIDS", 0)
    monkeypatch.setitem(ScopedRateThrottle.THROTTLE_RATES, "bids", "1000/min")


def candle_auction(**overrides):
    return active_auction(closing_policy="candle", candle_window_s=600, **overrides)


def everything(auction, client) -> str:
    paths = ("", "live/", "bids/", "result/")
    bodies = [client.get(f"/api/v1/auctions/{auction.pk}/{p}").content.decode() for p in paths]
    bodies.append(client.get("/api/v1/auctions/?page_size=50").content.decode())
    return "\n".join(bodies)


def test_secret_never_leaks_before_close_and_commitment_is_public():
    auction = candle_auction(proxy_enabled=True)
    seed_hex = bytes(auction.candle_seed).hex()
    close_iso = auction.candle_close_at.isoformat()
    assert len(auction.candle_commitment) == 64
    bid(client_for(make_user()), auction, "100.00")

    for viewer in (client_for(), client_for(auction.owner_user), client_for(make_user("admin"))):
        body = everything(auction, viewer)
        assert seed_hex not in body
        assert close_iso[:19] not in body  # ni siquiera a nivel de segundos
    detail = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
    assert detail["candle"]["commitment"] == auction.candle_commitment
    assert detail["candle"]["close_at"] is None
    assert seed_hex not in str(Auction.objects.get(pk=auction.pk).rules_snapshot)
    for event in AuditEvent.objects.filter(auction_id=auction.pk):
        assert seed_hex not in str(event.data)

    early = client_for().get(f"/api/v1/auctions/{auction.pk}/candle-proof/")
    assert early.status_code == 409 and early.json()["code"] == "NOT_REVEALED_YET"


def test_close_reveals_and_an_independent_script_verifies():
    auction = candle_auction()
    bid(client_for(make_user()), auction, "100.00")
    expire(auction)  # mueve ends_at, pero la ventana se ancla en original_ends_at (fijado al publicar)
    closing.close_auction(auction.pk)

    proof = client_for().get(f"/api/v1/auctions/{auction.pk}/candle-proof/").json()
    assert proof["commitment"] == auction.candle_commitment
    assert AuditEvent.objects.filter(auction_id=auction.pk, action="candle_revealed").count() == 1

    result = subprocess.run(  # noqa: S603 - script del propio repositorio
        [
            sys.executable,
            str(ROOT / "scripts" / "verify_candle.py"),
            "--auction-id",
            proof["auction_id"],
            "--commitment",
            proof["commitment"],
            "--seed-hex",
            proof["seed_hex"],
            "--window-start",
            proof["window_start"].replace("Z", "+00:00"),
            "--window-s",
            str(proof["window_s"]),
            "--close-at",
            proof["close_at"].replace("Z", "+00:00"),
        ],
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "SI" in result.stdout


def test_retroactive_cut_marks_late_bids_and_picks_the_winner_inside_the_cut():
    auction = candle_auction()
    early_bidder, late_bidder = make_user(), make_user()
    bid(client_for(early_bidder), auction, "100.00")
    bid(client_for(late_bidder), auction, "150.00")
    first, second = Bid.objects.filter(auction_id=auction.pk).order_by("seq")
    # El instante secreto cae entre ambas pujas (la segunda llegó "después de que se apagó la vela").
    cut = first.accepted_at + (second.accepted_at - first.accepted_at) / 2
    Auction.objects.filter(pk=auction.pk).update(candle_close_at=cut)
    expire(auction)
    closing.close_auction(auction.pk)

    auction.refresh_from_db()
    assert str(auction.winner_user_id) == str(early_bidder.pk)
    assert auction.final_price == Decimal("100.00")
    assert list(Bid.objects.filter(auction_id=auction.pk).order_by("seq").values_list("counted", flat=True)) == [
        True,
        False,
    ]
    public = client_for().get(f"/api/v1/auctions/{auction.pk}/").json()
    assert public["current_price"] == "100.00"  # precio oficial, no la última puja
    history = client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
    assert [(h["seq"], h["counted"]) for h in history] == [(2, False), (1, True)]


def test_counted_is_hidden_while_the_auction_is_open():
    auction = candle_auction()
    bid(client_for(make_user()), auction, "100.00")
    history = client_for().get(f"/api/v1/auctions/{auction.pk}/bids/").json()["results"]
    assert history[0]["counted"] is None


def test_candle_proof_rejects_other_modalities():
    auction = active_auction()
    response = client_for().get(f"/api/v1/auctions/{auction.pk}/candle-proof/")
    assert response.json()["code"] == "MECHANISM_MISMATCH"
