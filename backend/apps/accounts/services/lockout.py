"""Bloqueo de login por cuenta: 5 fallos -> 15 minutos (ADR-0004, T11).

Usa la caché `DatabaseCache` (tabla compartida) para que el bloqueo valga en los tres backends.
La clave es un hash del email: se cuentan también emails inexistentes, así el bloqueo no revela
qué cuentas existen, y el email nunca queda en claro en la caché.
"""

from __future__ import annotations

import hashlib

from django.core.cache import cache

MAX_FAILURES = 5
LOCK_SECONDS = 15 * 60


def _key(email: str) -> str:
    return "lancex:login:" + hashlib.sha256(email.encode("utf-8")).hexdigest()


def is_locked(email: str) -> bool:
    return cache.get(_key(email) + ":lock") is not None


def register_failure(email: str) -> bool:
    """Suma un fallo. Devuelve True si con este fallo la cuenta queda bloqueada."""
    key = _key(email)
    failures = (cache.get(key) or 0) + 1
    if failures >= MAX_FAILURES:
        cache.set(key + ":lock", 1, LOCK_SECONDS)
        cache.delete(key)
        return True
    cache.set(key, failures, LOCK_SECONDS)
    return False


def reset(email: str) -> None:
    key = _key(email)
    cache.delete_many([key, key + ":lock"])
