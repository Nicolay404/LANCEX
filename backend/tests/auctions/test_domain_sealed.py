"""LX-40: sobre cerrado de primer precio, dominio puro (REGLAS §6)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from apps.auctions.domain import registry
from apps.auctions.domain.mechanisms.sealed import SealedFirstPrice
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidIntent, BidRecord
from apps.core.errors import LancexError

D = Decimal
T0 = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
sealed = SealedFirstPrice()


def cfg(**kw):
    base = {
        "mechanism": "sealed",
        "closing_policy": "fixed",
        "starting_price": D("50.00"),
        "starts_at": T0,
        "ends_at": T0 + timedelta(hours=1),
    }
    return AuctionConfig(**{**base, **kw})


def state(**kw):
    return AuctionState(id="a", owner_user_id="owner", status="active", config=cfg(**kw))


def code_of(fn, *args):
    with pytest.raises(LancexError) as exc:
        fn(*args)
    return exc.value.code


def test_valid_config_and_only_fixed_close():
    registry.validate_config(cfg())
    assert code_of(registry.validate_config, cfg(closing_policy="soft_close")) == "MECHANISM_COMBINATION_NOT_ALLOWED"
    assert code_of(registry.validate_config, cfg(proxy_enabled=True)) == "MECHANISM_COMBINATION_NOT_ALLOWED"


@pytest.mark.parametrize(
    ("changes", "field"),
    [
        ({"starting_price": D("0.99")}, "starting_price"),
        ({"min_increment": D("1.00")}, "min_increment"),
        ({"reserve_price": D("49.99")}, "reserve_price"),
    ],
)
def test_config_errors(changes, field):
    with pytest.raises(LancexError) as exc:
        registry.validate_config(cfg(**changes))
    assert field in exc.value.details["fields"]


def test_offer_rules():
    s = state()
    sealed.validate_offer(s, "ana", D("50.00"))
    assert code_of(sealed.validate_offer, s, "ana", D("49.99")) == "BID_BELOW_MINIMUM"
    assert code_of(sealed.validate_offer, s, "owner", D("500.00")) == "BID_ON_OWN_AUCTION"


def test_manual_bids_are_not_allowed_on_sealed():
    assert code_of(sealed.apply_bid, state(), BidIntent("ana", D("100.00")), T0) == "MECHANISM_MISMATCH"


class TestReveal:
    def test_highest_current_offer_wins_at_its_own_price(self):
        offers = [BidRecord(1, "ana", D("80.00")), BidRecord(2, "beto", D("95.50")), BidRecord(3, "caro", D("60.00"))]
        result = sealed.select_winner(state(), offers)
        assert (result.outcome, result.winner_user_id, result.final_price) == ("awarded", "beto", D("95.50"))

    def test_tie_goes_to_the_earlier_current_version(self):
        # beto editó su oferta (seq 4) hasta igualar a ana (seq 2): gana ana.
        offers = [BidRecord(2, "ana", D("90.00")), BidRecord(4, "beto", D("90.00"))]
        assert sealed.select_winner(state(), offers).winner_user_id == "ana"

    def test_reserve_and_no_offers(self):
        assert sealed.select_winner(state(), []).outcome == "unsold"
        offers = [BidRecord(1, "ana", D("99.99"))]
        assert sealed.select_winner(state(reserve_price=D("100.00")), offers).outcome == "unsold"

    def test_ranking_order(self):
        offers = [BidRecord(3, "c", D("70.00")), BidRecord(1, "a", D("90.00")), BidRecord(2, "b", D("90.00"))]
        assert [o.bidder_user_id for o in sealed.ranking(offers)] == ["a", "b", "c"]
