"""Contratos de entrada estrictos (ADR-0006 §2, amenazas T03 y T04).

Los serializadores de entrada aceptan solo sus campos editables. Cualquier otra clave del
cuerpo (`platform_role`, `winner_user_id`, `status`, un campo de solo lectura...) no se
ignora en silencio: se rechaza con `400 UNKNOWN_FIELD` y se registra como evento de seguridad.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

from .errors import UnknownFieldError

security_logger = logging.getLogger("lancex.security")

_MAX_REPORTED_FIELDS = 20
_MAX_FIELD_NAME_LENGTH = 64


class StrictInputMixin:
    """Mezclar ANTES de `serializers.Serializer` / `ModelSerializer`:

    class BidInput(StrictInputMixin, serializers.Serializer): ...
    """

    def writable_field_names(self) -> set[str]:
        return {name for name, field in self.fields.items() if not field.read_only}

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown = sorted(str(key) for key in data if key not in self.writable_field_names())
            if unknown:
                reported = [name[:_MAX_FIELD_NAME_LENGTH] for name in unknown[:_MAX_REPORTED_FIELDS]]
                security_logger.warning(
                    "Campos desconocidos rechazados",
                    extra={
                        "event": "unknown_field_rejected",
                        "serializer": type(self).__name__,
                        "fields": reported,
                    },
                )
                raise UnknownFieldError(reported)
        return super().to_internal_value(data)
