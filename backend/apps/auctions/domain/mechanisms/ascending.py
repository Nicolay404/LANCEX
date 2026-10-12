"""Subasta ascendente (REGLAS-DE-SUBASTAS.md §2). Python puro."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from apps.auctions.domain import errors
from apps.auctions.domain.state import (
    AuctionConfig,
    AuctionState,
    BidIntent,
    BidOutcome,
    BidRecord,
    NewBid,
    Outcome,
    Result,
)

MIN_STARTING_PRICE = Decimal("1.00")
MIN_INCREMENT = Decimal("0.01")


class Ascending:
    code = "ascending"

    def validate_config(self, cfg: AuctionConfig) -> None:
        if cfg.starting_price is None or cfg.starting_price < MIN_STARTING_PRICE:
            raise errors.config_error("starting_price", f"Debe ser al menos {MIN_STARTING_PRICE}.")
        if cfg.min_increment is None or cfg.min_increment < MIN_INCREMENT:
            raise errors.config_error("min_increment", f"Debe ser al menos {MIN_INCREMENT}.")
        if cfg.reserve_price is not None and cfg.reserve_price < cfg.starting_price:
            raise errors.config_error("reserve_price", "No puede ser menor que el precio inicial.")

    def minimum_next_bid(self, state: AuctionState) -> Decimal:
        if state.bid_count == 0 or state.current_price is None:
            return state.config.starting_price
        return state.current_price + state.config.min_increment

    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> None:
        if intent.bidder_user_id == state.owner_user_id:
            raise errors.bid_on_own_auction()
        if state.leader_user_id is not None and intent.bidder_user_id == state.leader_user_id:
            raise errors.already_leading()
        minimum = self.minimum_next_bid(state)
        if intent.amount < minimum:
            raise errors.bid_below_minimum(minimum)

    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome:
        self.validate_bid(state, intent, now)
        bid = NewBid(bidder_user_id=intent.bidder_user_id, amount=intent.amount, source="manual")
        return BidOutcome(bids=(bid,), current_price=intent.amount, leader_user_id=intent.bidder_user_id)

    def select_winner(self, state: AuctionState, bids: Sequence[BidRecord]) -> Result:
        counted = [b for b in bids if b.counted]
        if not counted:
            return Result(outcome=Outcome.UNSOLD)
        # El libro ascendente nunca baja: gana la última puja válida (mayor importe y, en empate, mayor seq).
        # El único empate posible es el del proxy (Cc = M_L): la respuesta automática del líder se registra
        # después, pero su límite llegó antes, y REGLAS §3 le da la victoria.
        best = max(counted, key=lambda b: (b.amount, b.seq))
        reserve = state.config.reserve_price
        if reserve is not None and best.amount < reserve:
            return Result(outcome=Outcome.UNSOLD)
        return Result(outcome=Outcome.AWARDED, winner_user_id=best.bidder_user_id, final_price=best.amount)
