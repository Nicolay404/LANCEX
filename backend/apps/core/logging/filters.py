"""Filtros de logging: contexto de petición y eliminación de datos sensibles (ADR-0002, T22)."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from typing import Any

from apps.core.context import get_context

REDACTED = "[REDACTED]"

# Claves que nunca salen a un log (comparación sin mayúsculas; también como subcadena).
SENSITIVE_KEY_PARTS = (
    "password",
    "passwd",
    "secret",
    "token",
    "cookie",
    "authorization",
    "csrf",
    "session",
    "api_key",
    "apikey",
    "service_role",
    "credential",
    "max_amount",
    "proxy_max",
    "reserve_price",
    "sealed_amount",
    "offer_amount",
    "candle_seed",
    "seed",
    "email",
    "body",
    "payload",
)

_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")

# Atributos estándar de LogRecord: no son "extra" y no se tocan.
_STANDARD_ATTRS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", (), None)).keys()) | {
    "message",
    "asctime",
    "taskName",
}


def is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(part in lowered for part in SENSITIVE_KEY_PARTS)


def mask_emails(text: str) -> str:
    return _EMAIL.sub(REDACTED, text)


def scrub(value: Any, depth: int = 0) -> Any:
    """Copia de `value` sin claves sensibles ni correos (estructuras anidadas incluidas)."""
    if depth > 5:
        return REDACTED
    if isinstance(value, Mapping):
        return {str(k): (REDACTED if is_sensitive_key(str(k)) else scrub(v, depth + 1)) for k, v in value.items()}
    if isinstance(value, list | tuple | set):
        return [scrub(v, depth + 1) for v in value]
    if isinstance(value, str):
        return mask_emails(value)
    return value


class SensitiveDataFilter(logging.Filter):
    """Elimina del registro los `extra` sensibles y enmascara correos en el mensaje.

    Nunca descarta el registro: solo lo limpia.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        for key in [k for k in vars(record) if k not in _STANDARD_ATTRS]:
            if is_sensitive_key(key):
                delattr(record, key)
            else:
                setattr(record, key, scrub(getattr(record, key)))

        message = record.getMessage()
        cleaned = mask_emails(message)
        if cleaned != message or record.args:
            record.msg, record.args = cleaned, ()
        return True


class RequestContextFilter(logging.Filter):
    """Añade request_id, user_id, método y ruta de la petición en curso a cada registro."""

    def filter(self, record: logging.LogRecord) -> bool:
        ctx = get_context()
        for attr in ("request_id", "user_id", "method", "path"):
            if getattr(record, attr, None) is None:
                setattr(record, attr, getattr(ctx, attr) or ("-" if attr == "request_id" else None))
        return True
