"""LX-31 / LX-32: proxy bidding (REGLAS §3) y soft close (REGLAS §4), dominio puro."""

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from apps.auctions.domain import registry
from apps.auctions.domain.closing.soft_close import SoftClose
from apps.auctions.domain.mechanisms.ascending import Ascending
from apps.auctions.domain.proxy import ProxyBidding
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidIntent, BidRecord
from apps.core.errors import LancexError

D = Decimal
T0 = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
NOW = T0 + timedelta(minutes=10)
proxy = ProxyBidding(Ascending())


def state(price=None, leader=None, leader_max=None, bids=0, **cfg_kw):
    cfg = AuctionConfig(
        mechanism="ascending",
        closing_policy="fixed",
        proxy_enabled=True,
        starting_price=D("100.00"),
        min_increment=D("5.00"),
        starts_at=T0,
        ends_at=T0 + timedelta(hours=1),
        **cfg_kw,
    )
    return AuctionState(
        id="a",
        owner_user_id="owner",
        status="active",
        config=cfg,
        current_price=price,
        leader_user_id=leader,
        bid_count=bids,
        leader_proxy_max=leader_max,
    )


def as_tuples(outcome):
    return [(b.bidder_user_id, b.amount, b.source) for b in outcome.bids]


class TestProxyAlgorithm:
    def test_first_proxy_starts_at_starting_price_and_never_reveals_max(self):
        out = proxy.apply_bid(state(), BidIntent("ana", D("500.00"), is_proxy=True), NOW)
        assert as_tuples(out) == [("ana", D("100.00"), "proxy")]
        assert out.current_price == D("100.00") and out.leader_user_id == "ana"

    def test_manual_against_higher_proxy_leader_responds_automatically(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("200.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("150.00")), NOW)
        assert as_tuples(out) == [("beto", D("150.00"), "manual"), ("ana", D("155.00"), "proxy")]
        assert out.leader_user_id == "ana" and out.current_price == D("155.00")

    def test_limit_is_never_exceeded(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("152.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("150.00")), NOW)
        assert out.current_price == D("152.00")  # min(M_L, Cc + inc), nunca 155
        assert max(b.amount for b in out.bids if b.bidder_user_id == "ana") <= D("152.00")

    def test_manual_above_proxy_wins_and_exhausts_leader(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("200.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("250.00")), NOW)
        assert as_tuples(out) == [("ana", D("200.00"), "proxy"), ("beto", D("250.00"), "manual")]
        assert out.leader_user_id == "beto" and out.exhausted_proxy_user_ids == ("ana",)

    def test_proxy_against_proxy_higher_challenger_wins_one_increment_above(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("200.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("300.00"), is_proxy=True), NOW)
        assert as_tuples(out) == [("ana", D("200.00"), "proxy"), ("beto", D("205.00"), "proxy")]
        assert out.leader_user_id == "beto" and out.exhausted_proxy_user_ids == ("ana",)

    def test_proxy_against_proxy_challenger_slightly_above_pays_its_max(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("200.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("203.00"), is_proxy=True), NOW)
        assert out.current_price == D("203.00") and out.leader_user_id == "beto"

    def test_equal_limits_first_one_wins(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("200.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("200.00"), is_proxy=True), NOW)
        assert as_tuples(out) == [("beto", D("200.00"), "proxy"), ("ana", D("200.00"), "proxy")]
        assert out.leader_user_id == "ana" and out.exhausted_proxy_user_ids == ("beto",)
        # el libro resultante también da ganadora a ana (última puja del libro)
        book = [BidRecord(1, "ana", D("100.00")), BidRecord(2, "beto", D("200.00")), BidRecord(3, "ana", D("200.00"))]
        assert proxy.select_winner(s, book).winner_user_id == "ana"

    def test_lower_challenger_limit_is_exhausted(self):
        s = state(price=D("100.00"), leader="ana", leader_max=D("300.00"), bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("180.00"), is_proxy=True), NOW)
        assert out.leader_user_id == "ana" and out.current_price == D("185.00")
        assert out.exhausted_proxy_user_ids == ("beto",)

    def test_leader_without_proxy_is_simply_outbid(self):
        s = state(price=D("100.00"), leader="ana", bids=1)
        out = proxy.apply_bid(s, BidIntent("beto", D("300.00"), is_proxy=True), NOW)
        assert as_tuples(out) == [("beto", D("105.00"), "proxy")]


class TestProxyLimits:
    def test_leader_raises_without_generating_bids(self):
        s = state(price=D("150.00"), leader="ana", leader_max=D("200.00"), bids=2)
        assert proxy.validate_new_limit(s, "ana", D("400.00"), D("200.00")) is True

    @pytest.mark.parametrize("new_max", ["200.00", "150.00"])
    def test_limit_can_only_go_up(self, new_max):
        s = state(price=D("150.00"), leader="ana", leader_max=D("200.00"), bids=2)
        with pytest.raises(LancexError) as exc:
            proxy.validate_new_limit(s, "ana", D(new_max), D("200.00"))
        assert exc.value.code == "PROXY_LIMIT_DECREASE_NOT_ALLOWED"

    def test_new_limit_must_reach_the_minimum_next_bid(self):
        s = state(price=D("150.00"), leader="ana", bids=2)
        with pytest.raises(LancexError) as exc:
            proxy.validate_new_limit(s, "beto", D("154.99"), None)
        assert exc.value.code == "BID_BELOW_MINIMUM"

    def test_owner_cannot_set_a_limit(self):
        with pytest.raises(LancexError) as exc:
            proxy.validate_new_limit(state(), "owner", D("500.00"), None)
        assert exc.value.code == "BID_ON_OWN_AUCTION"

    def test_proxy_only_with_ascending(self):
        with pytest.raises(LancexError) as exc:
            registry.check_combination("sealed", "fixed", True)
        assert exc.value.code == "MECHANISM_COMBINATION_NOT_ALLOWED"


class TestSoftClose:
    policy = SoftClose()
    end = T0 + timedelta(hours=1)

    def s(self, ends_at=None):
        return state(
            original_ends_at=self.end,
            soft_close_window_s=120,
            soft_close_extension_s=120,
            soft_close_max_total_s=300,
        ).with_ends_at(ends_at or self.end)

    def test_bid_inside_window_extends(self):
        accepted = self.end - timedelta(seconds=30)
        assert self.policy.on_bid_accepted(self.s(), accepted).ends_at == accepted + timedelta(seconds=120)

    def test_bid_outside_window_does_not_extend(self):
        accepted = self.end - timedelta(seconds=121)
        assert self.policy.on_bid_accepted(self.s(), accepted).ends_at == self.end

    def test_extensions_never_exceed_max_total(self):
        current_end = self.end + timedelta(seconds=280)
        accepted = current_end - timedelta(seconds=10)
        result = self.policy.on_bid_accepted(self.s(current_end), accepted)
        assert result.ends_at == self.end + timedelta(seconds=300)  # tope: original + max_total

    def test_never_shortens(self):
        current_end = self.end + timedelta(seconds=300)
        result = self.policy.on_bid_accepted(self.s(current_end), current_end - timedelta(seconds=5))
        assert result.ends_at == current_end

    @pytest.mark.parametrize(
        ("field", "value"),
        [("soft_close_window_s", 29), ("soft_close_extension_s", 601), ("soft_close_max_total_s", 0)],
    )
    def test_parameter_bounds(self, field, value):
        values = SoftClose.with_defaults({field: value})
        cfg = AuctionConfig(mechanism="ascending", closing_policy="soft_close", **values)
        with pytest.raises(LancexError):
            self.policy.validate_config(cfg)

    def test_defaults(self):
        assert SoftClose.with_defaults({}) == {
            "soft_close_window_s": 120,
            "soft_close_extension_s": 120,
            "soft_close_max_total_s": 3600,
        }
