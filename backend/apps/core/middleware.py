"""Middleware de correlación: un request_id por petición (ADR-0002).

- Siempre se genera en el servidor (no se acepta el del cliente: evita inyección en logs).
- Se devuelve en la cabecera `X-Request-ID`, en los errores de la API y en los logs.
- Al terminar una escritura (POST/PUT/PATCH/DELETE) se emite `request_completed`.
"""

from __future__ import annotations

import logging
import re
import time

from .context import RequestContext, new_request_id, reset_context, set_context, update_context

logger = logging.getLogger("lancex.request")

WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_CONVERTER = re.compile(r"<(?:\w+:)?(\w+)>")


def route_template(request) -> str | None:
    """Ruta con plantilla (`/api/v1/auctions/{auction_id}/`) para agrupar sin exponer IDs."""
    match = getattr(request, "resolver_match", None)
    if match is None or not match.route:
        return None
    return "/" + _CONVERTER.sub(r"{\1}", match.route).lstrip("^").rstrip("$")


class RequestIdMiddleware:
    header = "X-Request-ID"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = new_request_id()
        request.request_id = request_id
        token = set_context(RequestContext(request_id=request_id, method=request.method))
        started = time.perf_counter()
        try:
            response = self.get_response(request)
            response[self.header] = request_id
            if request.method in WRITE_METHODS:
                self._log_completed(request, response, started)
            return response
        finally:
            reset_context(token)

    def process_view(self, request, view_func, view_args, view_kwargs):
        user = getattr(request, "user", None)
        user_id = str(user.pk) if user is not None and user.is_authenticated else None
        update_context(path=route_template(request), user_id=user_id)

    @staticmethod
    def _log_completed(request, response, started: float) -> None:
        logger.info(
            "Petición de escritura completada",
            extra={
                "event": "request_completed",
                "status": response.status_code,
                "duration_ms": round((time.perf_counter() - started) * 1000),
            },
        )
