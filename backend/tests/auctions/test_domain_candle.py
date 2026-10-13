"""LX-60: cierre por vela con commit-reveal, dominio puro (REGLAS §5)."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from apps.auctions.domain import registry
from apps.auctions.domain.closing.candle import (
    Candle,
    close_instant,
    commitment_of,
    verify,
    window_start_of,
)
from apps.auctions.domain.mechanisms.ascending import Ascending
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidRecord
from apps.core.errors import LancexError

T0 = datetime(2026, 10, 20, 15, 0, tzinfo=UTC)
END = T0 + timedelta(hours=1)
SEED = bytes(range(32))
AUCTION_ID = uuid.UUID("12345678-1234-5678-1234-567812345678")


def cfg(**kw):
    base = {
        "mechanism": "ascending",
        "closing_policy": "candle",
        "starting_price": Decimal("100.00"),
        "min_increment": Decimal("5.00"),
        "starts_at": T0,
        "ends_at": END,
        "candle_window_s": 600,
    }
    return AuctionConfig(**{**base, **kw})


class TestCommitReveal:
    def test_close_instant_is_deterministic_and_inside_the_window(self):
        start = window_start_of(END, 600)
        first = close_instant(SEED, AUCTION_ID, start, 600)
        assert first == close_instant(SEED, AUCTION_ID, start, 600)
        assert start <= first < END

    def test_different_seeds_or_auctions_give_different_instants(self):
        start = window_start_of(END, 600)
        base = close_instant(SEED, AUCTION_ID, start, 600)
        assert close_instant(bytes(32), AUCTION_ID, start, 600) != base
        assert close_instant(SEED, uuid.uuid4(), start, 600) != base

    def test_verification(self):
        start = window_start_of(END, 600)
        close_at = close_instant(SEED, AUCTION_ID, start, 600)
        commitment = commitment_of(SEED)
        assert len(commitment) == 64
        assert verify(SEED, commitment, AUCTION_ID, start, 600, close_at)
        assert not verify(bytes(32), commitment, AUCTION_ID, start, 600, close_at)  # semilla falsa
        assert not verify(SEED, commitment, AUCTION_ID, start, 600, close_at + timedelta(milliseconds=1))


class TestConfig:
    def test_valid_and_only_with_ascending(self):
        registry.validate_config(cfg())
        registry.validate_config(cfg(proxy_enabled=True))
        with pytest.raises(LancexError) as exc:
            registry.validate_config(cfg(mechanism="sealed", min_increment=None))
        assert exc.value.code == "MECHANISM_COMBINATION_NOT_ALLOWED"

    @pytest.mark.parametrize("window", [299, 3601, None])
    def test_window_bounds(self, window):
        with pytest.raises(LancexError):
            Candle().validate_config(cfg(candle_window_s=window))

    def test_window_cannot_exceed_the_auction(self):
        with pytest.raises(LancexError):
            registry.validate_config(cfg(ends_at=T0 + timedelta(minutes=5), candle_window_s=600))

    def test_window_only_with_candle(self):
        with pytest.raises(LancexError):
            registry.validate_config(cfg(closing_policy="fixed"))


class TestRetroactiveCut:
    def test_only_bids_up_to_the_secret_instant_count(self):
        close_at = END - timedelta(minutes=4)
        state = AuctionState(
            id=str(AUCTION_ID), owner_user_id="owner", status="active", config=cfg(candle_close_at=close_at)
        )
        policy = Candle()
        bids = [
            BidRecord(1, "ana", Decimal("100.00"), accepted_at=close_at - timedelta(minutes=1)),
            BidRecord(2, "beto", Decimal("105.00"), accepted_at=close_at),  # justo en el instante: cuenta
            BidRecord(3, "caro", Decimal("200.00"), accepted_at=close_at + timedelta(milliseconds=1)),
        ]
        valid = [b for b in bids if policy.bid_counts_for_result(state, b)]
        assert [b.seq for b in valid] == [1, 2]
        result = Ascending().select_winner(state, valid)
        assert (result.winner_user_id, result.final_price) == ("beto", Decimal("105.00"))

    def test_bids_are_accepted_until_ends_at(self):
        state = AuctionState(id="a", owner_user_id="o", status="active", config=cfg())
        assert Candle().effective_end(state) == END
