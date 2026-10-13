"""Proxy bidding: decorador sobre `Ascending` (ADR-0005, REGLAS-DE-SUBASTAS.md §3). Python puro.

El retador C llega con capacidad `Cc` (importe manual `X` o su máximo `M_C`). El líder L tiene
capacidad `M_L` (su máximo proxy, o el precio actual si no tiene proxy):

    si Cc > M_L:
        si L tiene proxy y M_L > precio: puja automática de L por M_L
        C pasa a líder; precio := X (manual) o min(M_C, M_L + inc) (proxy)
    si Cc ≤ M_L:
        puja de C por Cc (si C es proxy, su límite queda agotado)
        L sigue líder; precio := min(M_L, Cc + inc); puja automática de L por ese precio
        (empate Cc = M_L: gana L, que llegó antes, a precio M_L)

Invariante: como máximo un límite vivo por encima del precio, el del líder.
Los máximos nunca salen del dominio: solo se ven las pujas resultantes.
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
    NewBid,
    Result,
)
from apps.core.errors import Conflict


def limit_decrease_not_allowed() -> Conflict:
    return Conflict(code="PROXY_LIMIT_DECREASE_NOT_ALLOWED", message="El máximo solo se puede subir.")


class ProxyBidding:
    def __init__(self, inner) -> None:
        self.inner = inner
        self.code = inner.code

    # --- Delegación ------------------------------------------------------------------
    def validate_config(self, cfg: AuctionConfig) -> None:
        self.inner.validate_config(cfg)

    def minimum_next_bid(self, state: AuctionState) -> Decimal:
        return self.inner.minimum_next_bid(state)

    def select_winner(self, state: AuctionState, bids: Sequence[BidRecord]) -> Result:
        return self.inner.select_winner(state, bids)

    # --- Límites -----------------------------------------------------------------------
    def validate_new_limit(self, state: AuctionState, user_id: str, new_max: Decimal, current_max: Decimal | None):
        """Fijar o subir un máximo. Devuelve True si quien lo fija es el líder (no genera pujas)."""
        if user_id == state.owner_user_id:
            raise errors.bid_on_own_auction()
        if current_max is not None and new_max <= current_max:
            raise limit_decrease_not_allowed()
        is_leader = state.leader_user_id is not None and user_id == state.leader_user_id
        if is_leader:
            if state.current_price is not None and new_max <= state.current_price:
                raise errors.bid_below_minimum(self.minimum_next_bid(state))
            return True
        minimum = self.minimum_next_bid(state)
        if new_max < minimum:
            raise errors.bid_below_minimum(minimum)
        return False

    # --- Pujas -------------------------------------------------------------------------
    def validate_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> None:
        self.inner.validate_bid(state, intent, now)  # dueño, líder, mínimo

    def apply_bid(self, state: AuctionState, intent: BidIntent, now: datetime) -> BidOutcome:
        self.validate_bid(state, intent, now)
        challenger = intent.bidder_user_id
        source = "proxy" if intent.is_proxy else "manual"
        cfg = state.config

        # Primera puja de la subasta: no hay líder contra quien competir.
        if state.leader_user_id is None or state.current_price is None:
            price = cfg.starting_price if intent.is_proxy else intent.amount
            return BidOutcome(bids=(NewBid(challenger, price, source),), current_price=price, leader_user_id=challenger)

        leader = state.leader_user_id
        current = state.current_price
        inc = cfg.min_increment
        leader_has_proxy = state.leader_proxy_max is not None
        m_leader = max(state.leader_proxy_max, current) if leader_has_proxy else current
        cc = intent.amount

        if cc > m_leader:
            bids: list[NewBid] = []
            exhausted: list[str] = []
            if leader_has_proxy:
                if m_leader > current:
                    bids.append(NewBid(leader, m_leader, "proxy"))
                exhausted.append(leader)
            price = min(cc, m_leader + inc) if intent.is_proxy else cc
            bids.append(NewBid(challenger, price, source))
            return BidOutcome(tuple(bids), price, challenger, exhausted_proxy_user_ids=tuple(exhausted))

        # cc ≤ M_L (solo posible si el líder tiene proxy): el líder responde y sigue ganando.
        price = min(m_leader, cc + inc)
        bids = (NewBid(challenger, cc, source), NewBid(leader, price, "proxy"))
        exhausted = (challenger,) if intent.is_proxy else ()
        return BidOutcome(bids, price, leader, exhausted_proxy_user_ids=exhausted)
