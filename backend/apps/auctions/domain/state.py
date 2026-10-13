"""Estado de una subasta y máquina de estados con estado efectivo (ADR-0005, decisión 2). Python puro.

El estado persistido solo cambia por acciones (publicar, cancelar, cerrar). `scheduled → active`
y `active → closed` no esperan a ningún job: se calculan con la hora de PostgreSQL en cada lectura.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta
from decimal import Decimal
from enum import StrEnum


class Status(StrEnum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class Outcome(StrEnum):
    AWARDED = "awarded"
    UNSOLD = "unsold"


TERMINAL = frozenset({Status.CLOSED, Status.CANCELLED})
OPEN = frozenset({Status.DRAFT, Status.SCHEDULED, Status.ACTIVE})

MIN_DURATION = timedelta(minutes=2)  # REGLAS §1 (demos)
MAX_DURATION = timedelta(days=30)


@dataclass(frozen=True, slots=True)
class AuctionConfig:
    """Parámetros de reglas que se congelan al publicar (`rules_snapshot`)."""

    mechanism: str
    closing_policy: str
    proxy_enabled: bool = False
    starting_price: Decimal | None = None
    min_increment: Decimal | None = None
    reserve_price: Decimal | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    original_ends_at: datetime | None = None  # fijado al publicar; límite del soft close
    soft_close_window_s: int | None = None
    soft_close_extension_s: int | None = None
    soft_close_max_total_s: int | None = None
    # Inversa B2B
    reference_budget: Decimal | None = None
    min_decrement: Decimal | None = None
    quantity: Decimal | None = None
    buyer_organization_id: str | None = None


@dataclass(frozen=True, slots=True)
class AuctionState:
    """Instantánea de la subasta que necesitan las políticas (sin ORM)."""

    id: str
    owner_user_id: str
    status: str
    config: AuctionConfig
    current_price: Decimal | None = None
    leader_user_id: str | None = None
    leader_organization_id: str | None = None
    bid_count: int = 0
    # Máximo proxy vivo del líder (PRIVADO: solo lo usa el dominio dentro de la transacción).
    leader_proxy_max: Decimal | None = None
    extra: dict = field(default_factory=dict)

    @property
    def starts_at(self) -> datetime | None:
        return self.config.starts_at

    @property
    def ends_at(self) -> datetime | None:
        return self.config.ends_at

    def with_changes(self, **changes) -> AuctionState:
        return replace(self, **changes)

    def with_ends_at(self, ends_at: datetime) -> AuctionState:
        return replace(self, config=replace(self.config, ends_at=ends_at))


@dataclass(frozen=True, slots=True)
class BidIntent:
    """Retador: puja manual de `amount`, o límite proxy nuevo/subido (`is_proxy`, `amount` = máximo)."""

    bidder_user_id: str
    amount: Decimal
    is_proxy: bool = False
    organization_id: str | None = None  # proveedor en la inversa
    unit_price: Decimal | None = None
    shipping_cost: Decimal | None = None


@dataclass(frozen=True, slots=True)
class NewBid:
    """Puja a insertar en el libro (`bid`). `seq` lo asigna el servicio."""

    bidder_user_id: str
    amount: Decimal
    source: str = "manual"
    organization_id: str | None = None
    unit_price: Decimal | None = None
    shipping_cost: Decimal | None = None


@dataclass(frozen=True, slots=True)
class BidOutcome:
    bids: tuple[NewBid, ...]
    current_price: Decimal
    leader_user_id: str
    leader_organization_id: str | None = None
    # Usuarios cuyo límite proxy queda agotado tras esta operación.
    exhausted_proxy_user_ids: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class BidRecord:
    seq: int
    bidder_user_id: str
    amount: Decimal
    counted: bool = True
    organization_id: str | None = None


@dataclass(frozen=True, slots=True)
class Result:
    outcome: str
    winner_user_id: str | None = None
    final_price: Decimal | None = None
    winner_organization_id: str | None = None


def effective_status(state: AuctionState, effective_end: datetime | None, now: datetime) -> str:
    """Estado visible según la hora de PostgreSQL (ADR-0005)."""
    if state.status in (Status.DRAFT, Status.CANCELLED, Status.CLOSED):
        return state.status
    if state.starts_at is None or effective_end is None:
        return state.status
    if now < state.starts_at:
        return Status.SCHEDULED
    if now < effective_end:
        return Status.ACTIVE
    return Status.CLOSED  # aunque el cierre aún no se haya materializado


def is_result_pending(state: AuctionState, effective: str) -> bool:
    return effective == Status.CLOSED and state.status != Status.CLOSED
