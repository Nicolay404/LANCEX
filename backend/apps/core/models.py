"""Utilidades compartidas por los modelos (todos `managed = False`, ADR-0003)."""

from enum import StrEnum

from django.db import models


def choices_of(enum: type[StrEnum]) -> list[tuple[str, str]]:
    """Choices de Django a partir de un StrEnum puro (única fuente de los valores válidos)."""
    return [(member.value, member.value) for member in enum]


class ClockTimestamp(models.Func):
    """`clock_timestamp()` de PostgreSQL: instante real, también dentro de una transacción.

    Se usa como `db_default` de horas de negocio para que nunca vengan del reloj de la laptop.
    """

    function = "clock_timestamp"
    template = "%(function)s()"
    output_field = models.DateTimeField()
