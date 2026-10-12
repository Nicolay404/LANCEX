"""Soft close / anti-sniping (REGLAS-DE-SUBASTAS.md §4). Python puro.

Si una puja se acepta cuando faltan menos de `window` segundos, `ends_at := accepted_at + extension`,
sin superar `original_ends_at + max_total` (terminación garantizada).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from apps.auctions.domain import errors
from apps.auctions.domain.state import AuctionConfig, AuctionState, BidRecord

DEFAULT_WINDOW_S = 120
DEFAULT_EXTENSION_S = 120
DEFAULT_MAX_TOTAL_S = 3600
BOUNDS_S = (30, 600)
MAX_TOTAL_BOUNDS_S = (30, 86_400)


class SoftClose:
    code = "soft_close"

    DEFAULTS = {
        "soft_close_window_s": DEFAULT_WINDOW_S,
        "soft_close_extension_s": DEFAULT_EXTENSION_S,
        "soft_close_max_total_s": DEFAULT_MAX_TOTAL_S,
    }

    @classmethod
    def with_defaults(cls, values: dict) -> dict:
        for key, default in cls.DEFAULTS.items():
            if values.get(key) is None:
                values[key] = default
        return values

    def validate_config(self, cfg: AuctionConfig) -> None:
        low, high = BOUNDS_S
        for field in ("soft_close_window_s", "soft_close_extension_s"):
            value = getattr(cfg, field)
            if value is None or not low <= value <= high:
                raise errors.config_error(field, f"Debe estar entre {low} y {high} segundos.")
        low, high = MAX_TOTAL_BOUNDS_S
        if cfg.soft_close_max_total_s is None or not low <= cfg.soft_close_max_total_s <= high:
            raise errors.config_error("soft_close_max_total_s", f"Debe estar entre {low} y {high} segundos.")

    def effective_end(self, state: AuctionState) -> datetime | None:
        return state.ends_at  # se extiende en el propio ends_at

    def on_bid_accepted(self, state: AuctionState, accepted_at: datetime) -> AuctionState:
        cfg = state.config
        if state.ends_at is None or cfg.soft_close_window_s is None:
            return state
        if state.ends_at - accepted_at >= timedelta(seconds=cfg.soft_close_window_s):
            return state
        original = cfg.original_ends_at or state.ends_at
        cap = original + timedelta(seconds=cfg.soft_close_max_total_s or 0)
        new_end = min(accepted_at + timedelta(seconds=cfg.soft_close_extension_s), cap)
        return state.with_ends_at(new_end) if new_end > state.ends_at else state

    def bid_counts_for_result(self, state: AuctionState, bid: BidRecord) -> bool:
        return bid.counted
