"""Importes en USD (REGLAS-DE-SUBASTAS.md §1). Python puro.

- Siempre `Decimal`, nunca float.
- 2 decimales; con más se rechaza (`INVALID_AMOUNT_PRECISION`), no se redondea en silencio.
- Rango 0.01 ≤ importe ≤ 999 999 999.99.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from apps.core.errors import ValidationFailed

CENT = Decimal("0.01")
MIN_AMOUNT = Decimal("0.01")
MAX_AMOUNT = Decimal("999999999.99")


def parse_amount(raw, *, field: str = "amount") -> Decimal:
    """Convierte la entrada del cliente (string o número) en un importe válido."""
    if isinstance(raw, bool) or raw is None or isinstance(raw, float):
        # float pierde precisión: el contrato exige importes como string decimal.
        raise _invalid(field, 'Envía el importe como texto decimal, por ejemplo "125.00".')
    try:
        value = Decimal(str(raw).strip())
    except InvalidOperation:
        raise _invalid(field, "Importe no válido.") from None
    if not value.is_finite():
        raise _invalid(field, "Importe no válido.")
    if value != value.quantize(CENT):
        raise ValidationFailed(
            code="INVALID_AMOUNT_PRECISION",
            message="El importe admite como máximo 2 decimales.",
            details={"fields": {field: ["Máximo 2 decimales."]}},
        )
    if not MIN_AMOUNT <= value <= MAX_AMOUNT:
        raise _invalid(field, f"El importe debe estar entre {MIN_AMOUNT} y {MAX_AMOUNT}.")
    return value.quantize(CENT)


def round_money(value: Decimal) -> Decimal:
    """Redondeo de totales calculados por el servidor (ROUND_HALF_UP, 2 decimales)."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def to_str(value: Decimal | None) -> str | None:
    return None if value is None else f"{value.quantize(CENT)}"


def _invalid(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})
