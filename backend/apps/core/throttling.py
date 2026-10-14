"""Throttling de DRF sin viajes a la base para los límites de cada petición.

Con `DatabaseCache`, cada throttle hace ~6 consultas a `django_cache` (SELECT, COUNT, BEGIN, SELECT,
UPDATE, COMMIT). Contra Supabase eso son segundos por petición (handoff de Frontend, 2026-10-13).

- `anon`, `user` y `bids` se cuentan en la caché `throttle` (memoria del proceso): el límite queda
  por backend, suficiente para frenar abusos y ráfagas de cada cliente.
- `login`, `register` y `reports` siguen en la caché compartida (`default`, tabla `django_cache`):
  son poco frecuentes y deben valer en los tres backends; el bloqueo de login (`lockout`) también.
"""

from __future__ import annotations

from django.core.cache import caches
from rest_framework import throttling


class _ProcessCacheMixin:
    @property
    def cache(self):
        return caches["throttle"]


class AnonRateThrottle(_ProcessCacheMixin, throttling.AnonRateThrottle):
    pass


class UserRateThrottle(_ProcessCacheMixin, throttling.UserRateThrottle):
    pass


class BidRateThrottle(_ProcessCacheMixin, throttling.ScopedRateThrottle):
    """30 pujas/min por usuario (ADR-0004). Solo escrituras: el historial no se limita aquí."""

    scope_attr = "bid_throttle_scope"

    def allow_request(self, request, view):
        if request.method not in ("POST", "PUT", "DELETE"):
            return True
        return super().allow_request(request, view)
