"""Cierre fijo: la subasta termina en `ends_at`. Python puro."""

from __future__ import annotations

from datetime import datetime

from apps.auctions.domain.state import AuctionState, BidRecord


class Fixed:
    code = "fixed"

    def effective_end(self, state: AuctionState) -> datetime | None:
        return state.ends_at

    def on_bid_accepted(self, state: AuctionState, accepted_at: datetime) -> AuctionState:
        return state

    def bid_counts_for_result(self, state: AuctionState, bid: BidRecord) -> bool:
        return bid.counted
