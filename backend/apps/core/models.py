"""Utilidades compartidas por los modelos (todos `managed = False`, ADR-0003)."""

from enum import StrEnum


def choices_of(enum: type[StrEnum]) -> list[tuple[str, str]]:
    """Choices de Django a partir de un StrEnum puro (única fuente de los valores válidos)."""
    return [(member.value, member.value) for member in enum]
