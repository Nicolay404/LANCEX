"""LX-20: dominio puro de la subasta ascendente con cierre fijo (sin base de datos)."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from apps.auctions.domain import registry
from apps.auctions.domain.closing.fixed import Fixed
from apps.auctions.domain.mechanisms.ascending import Ascending
from apps.auctions.domain.money import parse_amount, round_money, to_str
from apps.auctions.domain.state import (
    AuctionConfig,
    AuctionState,
    BidIntent,
    BidRecord,
    effective_status,
    is_result_pending,
)
from apps.core.errors import LancexError

T0 = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
D = Decimal


def cfg(**kw):
    base = {
        "mechanism": "ascending",
        "closing_policy": "fixed",
        "starting_price": D("100.00"),
        "min_increment": D("5.00"),
        "starts_at": T0,
        "ends_at": T0 + timedelta(hours=1),
    }
    return AuctionConfig(**{**base, **kw})


def state(**kw):
    base = {"id": "a1", "owner_user_id": "owner", "status": "scheduled", "config": cfg()}
    return AuctionState(**{**base, **kw})


def code_of(fn, *args):
    with pytest.raises(LancexError) as exc:
        fn(*args)
    return exc.value.code


# --- Dinero --------------------------------------------------------------------------


class TestMoney:
    @pytest.mark.parametrize(
        ("raw", "expected"), [("125", "125.00"), ("0.01", "0.01"), (" 10.5 ", "10.50"), (7, "7.00")]
    )
    def test_valid_amounts(self, raw, expected):
        assert to_str(parse_amount(raw)) == expected

    def test_more_than_two_decimals_is_rejected_not_rounded(self):
        assert code_of(parse_amount, "10.001") == "INVALID_AMOUNT_PRECISION"

    @pytest.mark.parametrize("raw", ["0", "-1", "1000000000.00", "abc", "NaN", "Infinity", None, 1.5, True])
    def test_invalid_amounts(self, raw):
        assert code_of(parse_amount, raw) == "VALIDATION_ERROR"

    def test_round_half_up(self):
        assert round_money(D("2.345")) == D("2.35")


# --- Estado efectivo -------------------------------------------------------------------


class TestEffectiveStatus:
    end = T0 + timedelta(hours=1)

    @pytest.mark.parametrize(
        ("now", "expected"),
        [
            (T0 - timedelta(seconds=1), "scheduled"),
            (T0, "active"),
            (T0 + timedelta(minutes=59, seconds=59), "active"),
            (T0 + timedelta(hours=1), "closed"),  # el instante final ya no admite pujas
        ],
    )
    def test_published_auction_follows_the_database_clock(self, now, expected):
        assert effective_status(state(), self.end, now) == expected

    @pytest.mark.parametrize("status", ["draft", "cancelled", "closed"])
    def test_stored_terminal_or_draft_status_wins(self, status):
        assert effective_status(state(status=status), self.end, T0 + timedelta(minutes=5)) == status

    def test_result_pending_when_time_is_up_but_not_materialized(self):
        s = state(status="active")
        assert is_result_pending(s, effective_status(s, self.end, T0 + timedelta(hours=2)))
        assert not is_result_pending(state(status="closed"), "closed")


# --- Configuración y matriz ------------------------------------------------------------


class TestConfig:
    def test_valid_ascending_fixed(self):
        registry.validate_config(cfg())

    @pytest.mark.parametrize(
        ("mechanism", "policy", "proxy"),
        [("sealed", "soft_close", False), ("sealed", "fixed", True), ("reverse", "candle", False)],
    )
    def test_matrix_violations(self, mechanism, policy, proxy):
        code = code_of(registry.check_combination, mechanism, policy, proxy)
        assert code == "MECHANISM_COMBINATION_NOT_ALLOWED"

    @pytest.mark.parametrize(
        "changes",
        [
            {"closing_policy": "soft_close"},  # Fase 3
            {"proxy_enabled": True},  # Fase 3
            {"mechanism": "sealed"},  # Fase 4
        ],
    )
    def test_not_yet_available_in_this_phase(self, changes):
        assert code_of(registry.validate_config, cfg(**changes)) == "VALIDATION_ERROR"

    @pytest.mark.parametrize(
        ("changes", "field"),
        [
            ({"starting_price": D("0.99")}, "starting_price"),
            ({"min_increment": D("0.00")}, "min_increment"),
            ({"reserve_price": D("99.99")}, "reserve_price"),
            ({"ends_at": T0 + timedelta(minutes=1, seconds=59)}, "ends_at"),
            ({"ends_at": T0 + timedelta(days=30, seconds=1)}, "ends_at"),
            ({"starts_at": None}, "starts_at"),
        ],
    )
    def test_rule_parameters(self, changes, field):
        with pytest.raises(LancexError) as exc:
            registry.validate_config(cfg(**changes))
        assert field in exc.value.details["fields"]

    def test_duration_bounds_are_inclusive(self):
        registry.validate_config(cfg(ends_at=T0 + timedelta(minutes=2)))
        registry.validate_config(cfg(ends_at=T0 + timedelta(days=30)))


# --- Pujas ------------------------------------------------------------------------------


class TestAscendingBids:
    mech = Ascending()
    now = T0 + timedelta(minutes=10)

    def test_first_bid_at_exact_starting_price_is_accepted(self):
        outcome = self.mech.apply_bid(state(), BidIntent("u1", D("100.00")), self.now)
        assert outcome.current_price == D("100.00") and outcome.leader_user_id == "u1"
        assert [b.source for b in outcome.bids] == ["manual"]

    def test_one_cent_below_starting_price_is_rejected(self):
        exc_code = code_of(self.mech.apply_bid, state(), BidIntent("u1", D("99.99")), self.now)
        assert exc_code == "BID_BELOW_MINIMUM"

    def test_minimum_with_previous_bids_is_price_plus_increment(self):
        s = state(current_price=D("120.00"), leader_user_id="u1", bid_count=3)
        assert self.mech.minimum_next_bid(s) == D("125.00")
        self.mech.apply_bid(s, BidIntent("u2", D("125.00")), self.now)
        with pytest.raises(LancexError) as exc:
            self.mech.apply_bid(s, BidIntent("u2", D("124.99")), self.now)
        assert exc.value.details == {"minimum_allowed": "125.00"}

    def test_leader_cannot_outbid_himself(self):
        s = state(current_price=D("120.00"), leader_user_id="u1", bid_count=1)
        assert code_of(self.mech.apply_bid, s, BidIntent("u1", D("200.00")), self.now) == "ALREADY_LEADING"

    def test_owner_cannot_bid(self):
        assert code_of(self.mech.apply_bid, state(), BidIntent("owner", D("500.00")), self.now) == "BID_ON_OWN_AUCTION"


class TestWinner:
    mech = Ascending()

    def test_no_bids_is_unsold(self):
        assert self.mech.select_winner(state(), []).outcome == "unsold"

    def test_highest_bid_wins(self):
        bids = [BidRecord(1, "u1", D("100.00")), BidRecord(2, "u2", D("105.00")), BidRecord(3, "u1", D("130.00"))]
        result = self.mech.select_winner(state(), bids)
        assert (result.outcome, result.winner_user_id, result.final_price) == ("awarded", "u1", D("130.00"))

    def test_reserve_not_met_is_unsold(self):
        s = state(config=cfg(reserve_price=D("150.00")))
        assert self.mech.select_winner(s, [BidRecord(1, "u1", D("149.99"))]).outcome == "unsold"
        assert self.mech.select_winner(s, [BidRecord(1, "u1", D("150.00"))]).outcome == "awarded"

    def test_tie_goes_to_lower_seq(self):
        bids = [BidRecord(2, "late", D("100.00")), BidRecord(1, "early", D("100.00"))]
        assert self.mech.select_winner(state(), bids).winner_user_id == "early"

    def test_uncounted_bids_are_ignored(self):
        bids = [BidRecord(1, "u1", D("100.00")), BidRecord(2, "u2", D("200.00"), counted=False)]
        assert self.mech.select_winner(state(), bids).winner_user_id == "u1"


def test_fixed_policy_ends_at_ends_at():
    s = state()
    assert Fixed().effective_end(s) == s.ends_at
    assert Fixed().on_bid_accepted(s, T0) is s
