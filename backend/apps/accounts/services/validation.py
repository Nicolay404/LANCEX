"""Validaciones de cuenta (REGLAS-DE-SUBASTAS.md §13)."""

from __future__ import annotations

import re

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from apps.core.errors import ValidationFailed

DISPLAY_NAME_MIN = 3
DISPLAY_NAME_MAX = 60
_URL_LIKE = re.compile(
    r"(://|www\.|\b[\w-]+\.(com|net|org|ec|io|co|app|dev|info|xyz|me|ly|site|online|shop)\b)",
    re.IGNORECASE,
)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def clean_display_name(value: str) -> str:
    name = " ".join(value.split())
    if not DISPLAY_NAME_MIN <= len(name) <= DISPLAY_NAME_MAX:
        raise _field_error("display_name", f"Debe tener entre {DISPLAY_NAME_MIN} y {DISPLAY_NAME_MAX} caracteres.")
    if _URL_LIKE.search(name):
        raise _field_error("display_name", "No puede contener direcciones web.")
    return name


def check_password_strength(password: str, user, field: str = "password") -> None:
    try:
        validate_password(password, user)
    except DjangoValidationError as exc:
        raise ValidationFailed(details={"fields": {field: list(exc.messages)}}) from None


def _field_error(field: str, message: str) -> ValidationFailed:
    return ValidationFailed(details={"fields": {field: [message]}})
