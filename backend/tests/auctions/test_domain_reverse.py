"""LX-51 / LX-52: subasta inversa B2B, dominio puro (REGLAS §7)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from apps.auctions.domain import registry
from apps.auctions.domain.mechanisms.reverse import Reverse
from apps.auctions.domain.money import parse_non_negative_amount, parse_unit_price, reverse_total
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidIntent, BidRecord
from apps.core.errors import LancexError

D = Decimal
T0 = datetime(2026, 10, 25, 14, 0, tzinfo=UTC)
NOW = T0 + timedelta(minutes=5)
rev = Reverse()


def cfg(**kw):
    base = {
        "mechanism": "reverse",
        "closing_policy": "fixed",
        "reference_budget": D("12000.00"),
        "min_decrement": D("50.00"),
        "quantity": D("100.000"),
        "buyer_organization_id": "buyer",
        "starts_at": T0,
        "ends_at": T0 + timedelta(hours=2),
    }
    return AuctionConfig(**{**base, **kw})


def state(price=None, leader_org=None, bids=0, **kw):
    return AuctionState(
        id="a",
        owner_user_id="owner",
        status="active",
        config=cfg(**kw),
        current_price=price,
        leader_user_id="u-lead" if leader_org else None,
        leader_organization_id=leader_org,
        bid_count=bids,
    )


def intent(total, org="sup-a", user="u1"):
    return BidIntent(bidder_user_id=user, amount=D(total), organization_id=org)


def code_of(fn, *args):
    with pytest.raises(LancexError) as exc:
        fn(*args)
    return exc.value.code


class TestTotal:
    @pytest.mark.parametrize(
        ("unit", "qty", "ship", "expected"),
        [
            ("119.5000", "100.000", "25.00", "11975.00"),
            ("0.3333", "3.000", "0.00", "1.00"),  # 0.9999 -> 1.00
            ("1.0005", "1.000", "0.00", "1.00"),  # 1.0005 -> 1.00 (HALF_UP sobre el 3er decimal: 1.0005 -> 1.00)
            ("2.0050", "1.000", "0.00", "2.01"),  # 2.005 -> 2.01 (ROUND_HALF_UP, no bancario)
            ("10.1234", "2.500", "1.11", "26.42"),
        ],
    )
    def test_formula_with_round_half_up(self, unit, qty, ship, expected):
        assert reverse_total(D(unit), D(qty), D(ship)) == D(expected)

    def test_unit_price_up_to_four_decimals(self):
        assert parse_unit_price("12.3456") == D("12.3456")
        with pytest.raises(LancexError) as exc:
            parse_unit_price("12.34567")
        assert exc.value.code == "INVALID_AMOUNT_PRECISION"
        with pytest.raises(LancexError):
            parse_unit_price("0")

    def test_shipping_can_be_zero_but_not_negative(self):
        assert parse_non_negative_amount("0", field="shipping_cost") == D("0.00")
        with pytest.raises(LancexError):
            parse_non_negative_amount("-1.00", field="shipping_cost")


class TestConfig:
    def test_valid(self):
        registry.validate_config(cfg())
        registry.validate_config(
            cfg(
                closing_policy="soft_close",
                soft_close_window_s=120,
                soft_close_extension_s=120,
                soft_close_max_total_s=3600,
            )
        )

    def test_candle_and_proxy_not_allowed(self):
        assert code_of(registry.validate_config, cfg(closing_policy="candle")) == "MECHANISM_COMBINATION_NOT_ALLOWED"
        assert code_of(registry.validate_config, cfg(proxy_enabled=True)) == "MECHANISM_COMBINATION_NOT_ALLOWED"

    @pytest.mark.parametrize(
        ("changes", "field"),
        [
            ({"reference_budget": None}, "reference_budget"),
            ({"min_decrement": D("0.00")}, "min_decrement"),
            ({"starting_price": D("10.00")}, "starting_price"),
            ({"reserve_price": D("10.00")}, "reserve_price"),
        ],
    )
    def test_errors(self, changes, field):
        with pytest.raises(LancexError) as exc:
            registry.validate_config(cfg(**changes))
        assert field in exc.value.details["fields"]


class TestOffers:
    def test_first_offer_up_to_reference_budget(self):
        rev.apply_bid(state(), intent("12000.00"), NOW)
        with pytest.raises(LancexError) as exc:
            rev.apply_bid(state(), intent("12000.01"), NOW)
        assert exc.value.code == "OFFER_ABOVE_MAXIMUM"
        assert exc.value.details == {"maximum_allowed": "12000.00"}

    def test_next_offer_must_beat_best_by_min_decrement(self):
        s = state(price=D("11000.00"), leader_org="sup-b", bids=1)
        assert rev.maximum_allowed(s) == D("10950.00")
        outcome = rev.apply_bid(s, intent("10950.00"), NOW)
        assert outcome.leader_organization_id == "sup-a" and outcome.current_price == D("10950.00")
        assert code_of(rev.apply_bid, s, intent("10950.01"), NOW) == "OFFER_ABOVE_MAXIMUM"

    def test_leading_organization_cannot_outbid_itself(self):
        s = state(price=D("11000.00"), leader_org="sup-a", bids=1)
        assert code_of(rev.apply_bid, s, intent("9000.00", org="sup-a", user="otro-miembro"), NOW) == "ALREADY_LEADING"

    def test_buyer_organization_cannot_offer(self):
        assert code_of(rev.apply_bid, state(), intent("100.00", org="buyer"), NOW) == "BID_ON_OWN_AUCTION"


class TestWinner:
    def test_lowest_total_wins_and_keeps_organization(self):
        bids = [
            BidRecord(1, "u1", D("11000.00"), organization_id="sup-a"),
            BidRecord(2, "u2", D("10900.00"), organization_id="sup-b"),
        ]
        result = rev.select_winner(state(), bids)
        assert (result.winner_user_id, result.winner_organization_id, result.final_price) == (
            "u2",
            "sup-b",
            D("10900.00"),
        )

    def test_no_offers_is_deserted(self):
        assert rev.select_winner(state(), []).outcome == "unsold"
