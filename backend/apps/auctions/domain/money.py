"""Importes en USD (REGLAS-DE-SUBASTAS.md §1). Python puro.

- Siempre `Decimal`, nunca float.
- 2 decimales; con más se rechaza (`INVALID_AMOUNT_PRECISION`), no se redondea en silencio.
- Rango 0.01 ≤ importe ≤ 999 999 999.99.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from apps.core.errors import ValidationFailed

CENT = Decimal("0.01")
UNIT = Decimal("0.0001")
MAX_UNIT_PRICE = Decimal("9999999999.9999")
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


def _to_decimal(raw, field: str) -> Decimal:
    if isinstance(raw, bool) or raw is None or isinstance(raw, float):
        raise _invalid(field, 'Envía el importe como texto decimal, por ejemplo "125.00".')
    try:
        value = Decimal(str(raw).strip())
    except InvalidOperation:
        raise _invalid(field, "Importe no válido.") from None
    if not value.is_finite():
        raise _invalid(field, "Importe no válido.")
    return value


def parse_unit_price(raw, *, field: str = "unit_price") -> Decimal:
    """Precio unitario de la inversa: hasta 4 decimales, > 0 (REGLAS §1 y §7)."""
    value = _to_decimal(raw, field)
    if value != value.quantize(UNIT):
        raise ValidationFailed(
            code="INVALID_AMOUNT_PRECISION",
            message="El precio unitario admite como máximo 4 decimales.",
            details={"fields": {field: ["Máximo 4 decimales."]}},
        )
    if not Decimal("0") < value <= MAX_UNIT_PRICE:
        raise _invalid(field, "El precio unitario debe ser mayor que 0.")
    return value.quantize(UNIT)


def parse_non_negative_amount(raw, *, field: str) -> Decimal:
    """Importe de 2 decimales que puede ser 0 (por ejemplo, costo de envío)."""
    value = _to_decimal(raw, field)
    if value != value.quantize(CENT):
        raise ValidationFailed(
            code="INVALID_AMOUNT_PRECISION",
            message="El importe admite como máximo 2 decimales.",
            details={"fields": {field: ["Máximo 2 decimales."]}},
        )
    if not Decimal("0") <= value <= MAX_AMOUNT:
        raise _invalid(field, f"El importe debe estar entre 0 y {MAX_AMOUNT}.")
    return value.quantize(CENT)


def reverse_total(unit_price: Decimal, quantity: Decimal, shipping_cost: Decimal) -> Decimal:
    """`total = ROUND_HALF_UP(unit_price × quantity + shipping_cost, 2)` (REGLAS §7)."""
    return round_money(unit_price * quantity + shipping_cost)


def round_money(value: Decimal) -> Decimal:
    """Redondeo de totales calculados por el servidor (ROUND_HALF_UP, 2 decimales)."""
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def to_str(value: Decimal | None) -> str | None:
    return None if value is None else f"{value.quantize(CENT)}"


def _invalid(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})
