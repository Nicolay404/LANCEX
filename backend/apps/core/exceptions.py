"""Traducción de excepciones a la respuesta de error uniforme del contrato.

Formato único: `{"code", "message", "details", "request_id"}`. Nunca se devuelven trazas,
SQL ni mensajes internos (T21): un error no controlado se registra y responde INTERNAL_ERROR.
"""

from __future__ import annotations

import logging
from typing import Any

from django.core.exceptions import PermissionDenied as DjangoPermissionDenied
from django.http import Http404, JsonResponse
from rest_framework import exceptions as drf
from rest_framework.response import Response

from .context import current_request_id
from .errors import LancexError

logger = logging.getLogger("lancex.api")
security_logger = logging.getLogger("lancex.security")


def error_payload(code: str, message: str, details: dict[str, Any] | None = None) -> dict:
    return {
        "code": code,
        "message": message,
        "details": details or {},
        "request_id": current_request_id(),
    }


def json_error(status: int, code: str, message: str, details: dict | None = None) -> JsonResponse:
    return JsonResponse(error_payload(code, message, details), status=status)


def _field_errors(detail: Any) -> Any:
    """Normaliza los errores de DRF a listas de mensajes por campo, sin objetos internos."""
    if isinstance(detail, dict):
        return {str(k): _field_errors(v) for k, v in detail.items()}
    if isinstance(detail, list):
        return [_field_errors(v) for v in detail]
    return str(detail)


def _translate(exc: Exception) -> tuple[int, str, str, dict]:
    if isinstance(exc, LancexError):
        return exc.status_code, exc.code, exc.message, exc.details
    if isinstance(exc, drf.ValidationError):
        detail = exc.detail if isinstance(exc.detail, dict) else {"non_field_errors": exc.detail}
        return 400, "VALIDATION_ERROR", "La petición no es válida.", {"fields": _field_errors(detail)}
    if isinstance(exc, drf.ParseError):
        return 400, "VALIDATION_ERROR", "El cuerpo de la petición no es JSON válido.", {}
    if isinstance(exc, drf.NotAuthenticated | drf.AuthenticationFailed):
        return 401, "AUTH_REQUIRED", "Debes iniciar sesión.", {}
    if isinstance(exc, drf.PermissionDenied | DjangoPermissionDenied):
        if str(getattr(exc, "detail", "")).startswith("CSRF Failed"):
            security_logger.warning("CSRF rechazado", extra={"event": "csrf_failed"})
            return 403, "CSRF_FAILED", "Falta o no coincide el token CSRF.", {}
        return 403, "FORBIDDEN", "No tienes permiso para realizar esta acción.", {}
    if isinstance(exc, drf.NotFound | Http404):
        return 404, "NOT_FOUND", "El recurso no existe.", {}
    if isinstance(exc, drf.MethodNotAllowed):
        return 405, "METHOD_NOT_ALLOWED", "Método no permitido.", {}
    if isinstance(exc, drf.NotAcceptable):
        return 406, "NOT_ACCEPTABLE", "Formato de respuesta no soportado.", {}
    if isinstance(exc, drf.UnsupportedMediaType):
        return 415, "UNSUPPORTED_MEDIA_TYPE", "Usa Content-Type: application/json.", {}
    if isinstance(exc, drf.Throttled):
        security_logger.warning("Límite de peticiones alcanzado", extra={"event": "rate_limited"})
        retry = int(exc.wait) if exc.wait is not None else None
        return 429, "RATE_LIMITED", "Demasiadas peticiones.", {"retry_after_s": retry}
    raise exc  # no es un error conocido: lo gestiona el bloque de error interno


def api_exception_handler(exc: Exception, context: dict) -> Response:
    """EXCEPTION_HANDLER de DRF."""
    try:
        status, code, message, details = _translate(exc)
    except Exception:
        logger.exception("Error no controlado", extra={"event": "unhandled_exception"})
        status, code, message, details = 500, "INTERNAL_ERROR", "Error interno del servidor.", {}

    response = Response(error_payload(code, message, details), status=status)
    if status == 429 and details.get("retry_after_s") is not None:
        response["Retry-After"] = str(details["retry_after_s"])
    return response
