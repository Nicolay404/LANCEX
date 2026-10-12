"""Contratos Strategy del motor (ADR-0005, decisión 1). Python puro."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal
from typing import Protocol

from apps.auctions.domain.state import AuctionConfig, AuctionState, BidIntent, BidOutcome, BidRecord, Result


class Mechanism(Protocol):
    code: str

    def validate_config(self, cfg: AuctionConfig) -> None:
        """Lanza ValidationFailed si los parámetros no cumplen REGLAS."""

    def minimum_next_bid(self, state: AuctionState) -> Decimal | None: ...

    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> None: ...

    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome: ...

    def select_winner(self, state: AuctionState, bids: Sequence[BidRecord]) -> Result: ...


class ClosingPolicy(Protocol):
    code: str

    def effective_end(self, state: AuctionState) -> datetime | None: ...

    def on_bid_accepted(self, state: AuctionState, accepted_at: datetime) -> AuctionState: ...

    def bid_counts_for_result(self, state: AuctionState, bid: BidRecord) -> bool: ...
