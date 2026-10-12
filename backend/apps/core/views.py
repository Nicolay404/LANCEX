"""Vistas transversales: esquema OpenAPI y respuestas JSON para errores fuera de DRF."""

from __future__ import annotations

import logging

from drf_spectacular.views import SpectacularAPIView

from .exceptions import json_error
from .permissions import Public

security_logger = logging.getLogger("lancex.security")


class SchemaView(SpectacularAPIView):
    """`GET /api/v1/schema/`: solo se registra con LANCEX_SERVE_SCHEMA (local)."""

    permission_classes = [Public]


# --- Manejadores de Django (rutas inexistentes y errores fuera de DRF) -------------------


def csrf_failure(request, reason: str = ""):
    security_logger.warning("CSRF rechazado", extra={"event": "csrf_failed"})
    return json_error(403, "CSRF_FAILED", "Falta o no coincide el token CSRF.")


def bad_request(request, exception=None):
    return json_error(400, "VALIDATION_ERROR", "La petición no es válida.")


def permission_denied(request, exception=None):
    return json_error(403, "FORBIDDEN", "No tienes permiso para realizar esta acción.")


def page_not_found(request, exception=None):
    return json_error(404, "NOT_FOUND", "El recurso no existe.")


def server_error(request):
    return json_error(500, "INTERNAL_ERROR", "Error interno del servidor.")
