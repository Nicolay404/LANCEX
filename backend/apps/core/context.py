"""Contexto de la petición en curso (request_id, usuario, ruta) para logs y errores.

Se usa `contextvars` para que cada hilo/tarea tenga su propio valor sin pasar el request
por todas las capas.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar
from dataclasses import dataclass, replace


@dataclass(frozen=True, slots=True)
class RequestContext:
    request_id: str | None = None
    user_id: str | None = None
    method: str | None = None
    path: str | None = None  # plantilla de la ruta, p. ej. /api/v1/auctions/{auction_id}/bids/


_EMPTY = RequestContext()
_current: ContextVar[RequestContext] = ContextVar("lancex_request_context", default=_EMPTY)


def new_request_id() -> str:
    return uuid.uuid4().hex


def get_context() -> RequestContext:
    return _current.get()


def set_context(ctx: RequestContext):
    return _current.set(ctx)


def update_context(**changes: str | None) -> None:
    _current.set(replace(_current.get(), **changes))


def reset_context(token) -> None:
    _current.reset(token)


def current_request_id() -> str | None:
    return _current.get().request_id
