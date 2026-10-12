"""Registro de mecanismos y políticas + matriz de compatibilidad (ADR-0005). Python puro.

Agregar una modalidad = una clase nueva + una línea aquí + pruebas (escenario QA-06).
"""

from __future__ import annotations

from datetime import datetime

from apps.auctions.domain import errors
from apps.auctions.domain.closing.fixed import Fixed
from apps.auctions.domain.mechanisms.ascending import Ascending
from apps.auctions.domain.mechanisms.base import ClosingPolicy, Mechanism
from apps.auctions.domain.state import MAX_DURATION, MIN_DURATION, AuctionConfig, AuctionState

# Matriz de ADR-0005: mecanismo -> políticas permitidas, y si admite proxy.
COMPATIBILITY: dict[str, tuple[frozenset[str], bool]] = {
    "ascending": (frozenset({"fixed", "soft_close", "candle"}), True),
    "reverse": (frozenset({"fixed", "soft_close"}), False),
    "sealed": (frozenset({"fixed"}), False),
}

# Implementados hasta ahora (Fase 2). Los demás se agregan en su fase (PLAN-DE-DESARROLLO.md).
MECHANISMS: dict[str, Mechanism] = {"ascending": Ascending()}
CLOSING_POLICIES: dict[str, ClosingPolicy] = {"fixed": Fixed()}
PROXY_AVAILABLE = False  # Fase 3 (LX-31)


def check_combination(mechanism: str, closing_policy: str, proxy_enabled: bool) -> None:
    allowed = COMPATIBILITY.get(mechanism)
    if allowed is None:
        raise errors.config_error("mechanism", "Mecanismo desconocido.")
    policies, proxy_ok = allowed
    if closing_policy not in policies or (proxy_enabled and not proxy_ok):
        raise errors.combination_not_allowed(mechanism, closing_policy, proxy_enabled)


def check_available(mechanism: str, closing_policy: str, proxy_enabled: bool) -> None:
    """Combinación válida según la matriz pero aún no implementada en esta fase."""
    if mechanism not in MECHANISMS:
        raise errors.config_error("mechanism", "Esta modalidad todavía no está disponible.")
    if closing_policy not in CLOSING_POLICIES:
        raise errors.config_error("closing_policy", "Esta política de cierre todavía no está disponible.")
    if proxy_enabled and not PROXY_AVAILABLE:
        raise errors.config_error("proxy_enabled", "El proxy bidding todavía no está disponible.")


def mechanism_for(state: AuctionState) -> Mechanism:
    return MECHANISMS[state.config.mechanism]


def closing_policy_for(state: AuctionState) -> ClosingPolicy:
    return CLOSING_POLICIES[state.config.closing_policy]


def validate_schedule(starts_at: datetime | None, ends_at: datetime | None) -> None:
    if starts_at is None:
        raise errors.config_error("starts_at", "Es obligatorio.")
    if ends_at is None:
        raise errors.config_error("ends_at", "Es obligatorio.")
    duration = ends_at - starts_at
    if duration < MIN_DURATION:
        raise errors.config_error("ends_at", "La subasta debe durar al menos 2 minutos.")
    if duration > MAX_DURATION:
        raise errors.config_error("ends_at", "La subasta no puede durar más de 30 días.")


def validate_config(cfg: AuctionConfig) -> None:
    """Validación completa al crear, editar el borrador y publicar."""
    check_combination(cfg.mechanism, cfg.closing_policy, cfg.proxy_enabled)
    check_available(cfg.mechanism, cfg.closing_policy, cfg.proxy_enabled)
    MECHANISMS[cfg.mechanism].validate_config(cfg)
    validate_schedule(cfg.starts_at, cfg.ends_at)
