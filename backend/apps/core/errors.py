"""Jerarquía de errores de LANCEX en Python puro (sin Django).

El dominio y los servicios lanzan estas excepciones con un `code` estable del contrato
(CONTRATO-API-INICIAL.md §Errores). La capa API las traduce a HTTP en
`apps.core.exceptions.api_exception_handler`. La categoría (validación, permiso, conflicto...)
es semántica; el estado HTTP se deriva de ella en un único lugar.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class LancexError(Exception):
    """Error de negocio o de aplicación con código estable para el cliente."""

    status_code: int = 400
    default_code: str = "VALIDATION_ERROR"
    default_message: str = "La petición no es válida."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: Mapping[str, Any] | None = None,
    ) -> None:
        self.code = code or self.default_code
        self.message = message or self.default_message
        self.details: dict[str, Any] = dict(details or {})
        super().__init__(self.message)


class ValidationFailed(LancexError):
    status_code = 400
    default_code = "VALIDATION_ERROR"
    default_message = "La petición no es válida."


class UnknownFieldError(ValidationFailed):
    default_code = "UNKNOWN_FIELD"
    default_message = "La petición incluye campos no permitidos."

    def __init__(self, fields: list[str]) -> None:
        super().__init__(details={"fields": fields})


class AuthenticationRequired(LancexError):
    status_code = 401
    default_code = "AUTH_REQUIRED"
    default_message = "Debes iniciar sesión."


class Forbidden(LancexError):
    status_code = 403
    default_code = "FORBIDDEN"
    default_message = "No tienes permiso para realizar esta acción."


class NotFound(LancexError):
    status_code = 404
    default_code = "NOT_FOUND"
    default_message = "El recurso no existe."


class Conflict(LancexError):
    """Regla de negocio o de estado violada (409)."""

    status_code = 409
    default_code = "CONFLICT"
    default_message = "La acción no es posible en el estado actual."


class RateLimited(LancexError):
    status_code = 429
    default_code = "RATE_LIMITED"
    default_message = "Demasiadas peticiones. Intenta de nuevo más tarde."
