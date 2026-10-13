"""Cierre por vela con commit-reveal verificable (REGLAS-DE-SUBASTAS.md §5). Python puro.

Al publicar (el servicio genera `seed` con `secrets`):

    commitment      = sha256(seed).hexdigest()                                   # público
    offset_ms       = int(hmac_sha256(seed, auction_id.bytes)[:8]) % (window_s * 1000)
    candle_close_at = window_start + offset_ms                                   # secreto hasta el cierre

Durante la subasta se aceptan pujas hasta `ends_at`; al cerrar solo cuentan las aceptadas en o
antes de `candle_close_at` (cierre retroactivo). Tras el cierre se revelan `seed` y el instante,
y cualquiera puede recalcularlos (`scripts/verify_candle.py`).
"""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import datetime, timedelta

from apps.auctions.domain import errors
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidRecord

DEFAULT_WINDOW_S = 600
WINDOW_BOUNDS_S = (300, 3600)
SEED_BYTES = 32


def commitment_of(seed: bytes) -> str:
    return hashlib.sha256(seed).hexdigest()


def window_start_of(ends_at: datetime, window_s: int) -> datetime:
    return ends_at - timedelta(seconds=window_s)


def close_instant(seed: bytes, auction_id: uuid.UUID, window_start: datetime, window_s: int) -> datetime:
    digest = hmac.new(seed, auction_id.bytes, hashlib.sha256).digest()
    offset_ms = int.from_bytes(digest[:8], "big") % (window_s * 1000)
    return window_start + timedelta(milliseconds=offset_ms)


def verify(
    seed: bytes, commitment: str, auction_id: uuid.UUID, window_start: datetime, window_s: int, close_at: datetime
) -> bool:
    """True si la semilla revelada coincide con el compromiso y produce el mismo instante."""
    return (
        hmac.compare_digest(commitment_of(seed), commitment)
        and close_instant(seed, auction_id, window_start, window_s) == close_at
    )


class Candle:
    code = "candle"

    @staticmethod
    def with_defaults(values: dict) -> dict:
        if values.get("candle_window_s") is None:
            values["candle_window_s"] = DEFAULT_WINDOW_S
        return values

    def validate_config(self, cfg: AuctionConfig) -> None:
        low, high = WINDOW_BOUNDS_S
        window = cfg.candle_window_s
        if window is None or not low <= window <= high:
            raise errors.config_error("candle_window_s", f"Debe estar entre {low} y {high} segundos.")
        if cfg.starts_at and cfg.ends_at and (cfg.ends_at - cfg.starts_at) < timedelta(seconds=window):
            raise errors.config_error("candle_window_s", "La ventana de vela no puede ser mayor que la subasta.")

    def effective_end(self, state: AuctionState) -> datetime | None:
        return state.ends_at  # se aceptan pujas hasta ends_at; el corte real es retroactivo

    def on_bid_accepted(self, state: AuctionState, accepted_at: datetime) -> AuctionState:
        return state

    def bid_counts_for_result(self, state: AuctionState, bid: BidRecord) -> bool:
        close_at = state.config.candle_close_at
        if close_at is None or bid.accepted_at is None:
            return bid.counted
        return bid.accepted_at <= close_at
