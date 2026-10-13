"""Sobre cerrado de primer precio (REGLAS-DE-SUBASTAS.md §6). Python puro.

- Una oferta vigente por participante; editar crea una versión nueva (pierde prioridad).
- Nadie ve importes ajenos antes del cierre; solo el número de participantes con oferta vigente.
- Cierre: gana la oferta vigente más alta; empate -> `seq` menor de la versión vigente. Precio = su oferta.
"""

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
    Outcome,
    Result,
)
from apps.core.errors import Conflict

MIN_STARTING_PRICE = Decimal("1.00")


def mechanism_mismatch() -> Conflict:
    return Conflict(
        code="MECHANISM_MISMATCH",
        message="Esta subasta es de sobre cerrado: usa la oferta sellada.",
        details={"mechanism": "sealed"},
    )


class SealedFirstPrice:
    code = "sealed"

    def validate_config(self, cfg: AuctionConfig) -> None:
        if cfg.starting_price is None or cfg.starting_price < MIN_STARTING_PRICE:
            raise errors.config_error("starting_price", f"Debe ser al menos {MIN_STARTING_PRICE}.")
        if cfg.min_increment is not None:
            raise errors.config_error("min_increment", "No aplica al sobre cerrado.")
        if cfg.reserve_price is not None and cfg.reserve_price < cfg.starting_price:
            raise errors.config_error("reserve_price", "No puede ser menor que la oferta mínima.")

    def minimum_next_bid(self, state: AuctionState) -> Decimal:
        return state.config.starting_price  # oferta mínima: dato público de las reglas

    def validate_offer(self, state: AuctionState, bidder_user_id: str, amount: Decimal) -> None:
        if bidder_user_id == state.owner_user_id:
            raise errors.bid_on_own_auction()
        if amount < state.config.starting_price:
            raise errors.bid_below_minimum(state.config.starting_price)

    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> None:
        raise mechanism_mismatch()

    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome:
        raise mechanism_mismatch()

    def select_winner(self, state: AuctionState, offers: Sequence[BidRecord]) -> Result:
        """`offers`: solo las versiones vigentes (no retiradas)."""
        valid = [o for o in offers if o.counted]
        if not valid:
            return Result(outcome=Outcome.UNSOLD)
        best = max(valid, key=lambda o: (o.amount, -o.seq))  # empate: seq menor (llegó antes)
        reserve = state.config.reserve_price
        if reserve is not None and best.amount < reserve:
            return Result(outcome=Outcome.UNSOLD)
        return Result(outcome=Outcome.AWARDED, winner_user_id=best.bidder_user_id, final_price=best.amount)

    @staticmethod
    def ranking(offers: Sequence[BidRecord]) -> list[BidRecord]:
        """Orden de revelación: importe descendente, empate por seq ascendente."""
        return sorted((o for o in offers if o.counted), key=lambda o: (-o.amount, o.seq))
