"""Adaptador ORM -> estado de dominio, y cálculo del estado efectivo con la hora de PostgreSQL."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from apps.auctions.domain import registry
from apps.auctions.domain.state import AuctionConfig, AuctionState, effective_status, is_result_pending
from apps.auctions.models import Auction


def config_of(a: Auction) -> AuctionConfig:
    return AuctionConfig(
        mechanism=a.mechanism,
        closing_policy=a.closing_policy,
        proxy_enabled=a.proxy_enabled,
        starting_price=a.starting_price,
        min_increment=a.min_increment,
        reserve_price=a.reserve_price,
        starts_at=a.starts_at,
        ends_at=a.ends_at,
    )


def to_state(a: Auction) -> AuctionState:
    return AuctionState(
        id=str(a.pk),
        owner_user_id=str(a.owner_user_id),
        status=a.status,
        config=config_of(a),
        current_price=a.current_price,
        leader_user_id=str(a.leader_user_id) if a.leader_user_id else None,
        bid_count=a.bid_count,
    )


@dataclass(frozen=True, slots=True)
class Effective:
    state: AuctionState
    status: str
    result_pending: bool
    effective_end: datetime | None


def evaluate(a: Auction, now: datetime) -> Effective:
    state = to_state(a)
    if a.mechanism in registry.MECHANISMS and a.closing_policy in registry.CLOSING_POLICIES:
        end = registry.closing_policy_for(state).effective_end(state)
    else:  # modalidad de una fase posterior: se trata como cierre fijo
        end = a.ends_at
    status = effective_status(state, end, now)
    return Effective(state=state, status=status, result_pending=is_result_pending(state, status), effective_end=end)
