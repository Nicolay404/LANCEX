"""Subasta inversa B2B (REGLAS-DE-SUBASTAS.md §7). Python puro.

Proveedores admitidos compiten a la baja por el TOTAL que calcula el servidor:

    total = ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)

Validez: total ≤ reference_budget; si hay ofertas, total ≤ mejor_total − min_decrement
(`OFFER_ABOVE_MAXIMUM`, con `maximum_allowed`); la organización no es la líder actual
(`ALREADY_LEADING`). La admisión (`NOT_ADMITTED`) y los conflictos de interés los resuelve el
servicio, que conoce las inscripciones y membresías.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from decimal import Decimal

from apps.auctions.domain import errors
from apps.auctions.domain.money import reverse_total
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
from apps.core.errors import Conflict

MIN_DECREMENT = Decimal("0.01")


def offer_above_maximum(maximum: Decimal) -> Conflict:
    return Conflict(
        code="OFFER_ABOVE_MAXIMUM",
        message="El total supera el máximo permitido.",
        details={"maximum_allowed": f"{maximum:.2f}"},
    )


class Reverse:
    code = "reverse"

    def validate_config(self, cfg: AuctionConfig) -> None:
        if cfg.reference_budget is None or cfg.reference_budget < Decimal("0.01"):
            raise errors.config_error("reference_budget", "Es obligatorio y mayor que 0.")
        if cfg.min_decrement is None or cfg.min_decrement < MIN_DECREMENT:
            raise errors.config_error("min_decrement", f"Debe ser al menos {MIN_DECREMENT}.")
        for field in ("starting_price", "min_increment", "reserve_price"):
            if getattr(cfg, field) is not None:
                raise errors.config_error(field, "No aplica a la subasta inversa.")

    def maximum_allowed(self, state: AuctionState) -> Decimal:
        if state.bid_count == 0 or state.current_price is None:
            return state.config.reference_budget
        return state.current_price - state.config.min_decrement

    def minimum_next_bid(self, state: AuctionState) -> None:
        return None  # en la inversa se compite a la baja: ver `maximum_allowed`

    def total_for(self, state: AuctionState, unit_price: Decimal, shipping_cost: Decimal) -> Decimal:
        return reverse_total(unit_price, state.config.quantity, shipping_cost)

    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> None:
        if intent.organization_id is None:
            raise errors.config_error("organization_id", "Indica la organización proveedora.")
        if intent.organization_id == state.config.buyer_organization_id:
            raise errors.bid_on_own_auction()
        if state.leader_organization_id is not None and intent.organization_id == state.leader_organization_id:
            raise errors.already_leading()
        maximum = self.maximum_allowed(state)
        if intent.amount > maximum:
            raise offer_above_maximum(maximum)
        if intent.amount < Decimal("0.01"):
            raise errors.config_error("unit_price", "El total debe ser mayor que 0.")

    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome:
        self.validate_bid(state, intent, now)
        bid = NewBid(
            bidder_user_id=intent.bidder_user_id,
            amount=intent.amount,
            source="manual",
            organization_id=intent.organization_id,
            unit_price=intent.unit_price,
            shipping_cost=intent.shipping_cost,
        )
        return BidOutcome(
            bids=(bid,),
            current_price=intent.amount,
            leader_user_id=intent.bidder_user_id,
            leader_organization_id=intent.organization_id,
        )

    def select_winner(self, state: AuctionState, bids: Sequence[BidRecord]) -> Result:
        valid = [b for b in bids if b.counted]
        if not valid:
            return Result(outcome=Outcome.UNSOLD)  # desierta
        # Gana el menor total; el libro solo baja, así que es la oferta válida de mayor seq.
        best = min(valid, key=lambda b: (b.amount, -b.seq))
        return Result(
            outcome=Outcome.AWARDED,
            winner_user_id=best.bidder_user_id,
            final_price=best.amount,
            winner_organization_id=best.organization_id,
        )
