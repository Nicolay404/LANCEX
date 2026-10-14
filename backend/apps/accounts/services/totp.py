"""TOTP (RFC 6238) y códigos de respaldo, en Python puro (sin Django ni dependencias nuevas).

Compatible con Google Authenticator, Microsoft Authenticator, Authy, etc.: HMAC-SHA1, 6 dígitos,
pasos de 30 s. Se acepta el paso actual y uno a cada lado (reloj del teléfono desfasado), y
nunca un paso igual o anterior al último aceptado (anti-repetición).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
import struct
from datetime import datetime
from urllib.parse import quote

ISSUER = "LANCEX"
PERIOD_S = 30
DIGITS = 6
SECRET_BYTES = 20  # 160 bits -> 32 caracteres base32 sin relleno
DRIFT_STEPS = 1

RECOVERY_CODES = 10
_RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O ni 1/I: se copian a mano
_RECOVERY_LENGTH = 16  # 80 bits: un SHA-256 simple basta para guardarlos


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(SECRET_BYTES)).decode("ascii")


def step_of(instant: datetime) -> int:
    return int(instant.timestamp()) // PERIOD_S


def code_at(secret: str, step: int) -> str:
    key = base64.b32decode(secret)
    digest = hmac.new(key, struct.pack(">Q", step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = (struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF) % 10**DIGITS
    return f"{number:0{DIGITS}d}"


def matching_step(secret: str, code: str, now: datetime, *, after: int | None = None) -> int | None:
    """Paso con el que coincide `code` (dentro de la deriva permitida), o None."""
    code = (code or "").strip().replace(" ", "")
    if len(code) != DIGITS or not code.isdigit():
        return None
    current = step_of(now)
    for step in range(current - DRIFT_STEPS, current + DRIFT_STEPS + 1):
        if after is not None and step <= after:
            continue
        if hmac.compare_digest(code_at(secret, step), code):
            return step
    return None


def provisioning_uri(secret: str, account: str) -> str:
    """URI `otpauth://` que el frontend muestra como QR."""
    label = quote(f"{ISSUER}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={ISSUER}&algorithm=SHA1&digits={DIGITS}&period={PERIOD_S}"


def new_recovery_codes() -> list[str]:
    codes = []
    for _ in range(RECOVERY_CODES):
        raw = "".join(secrets.choice(_RECOVERY_ALPHABET) for _ in range(_RECOVERY_LENGTH))
        codes.append("-".join(raw[i : i + 4] for i in range(0, _RECOVERY_LENGTH, 4)))
    return codes


def normalize_recovery_code(code: str) -> str:
    return (code or "").upper().replace("-", "").replace(" ", "")


def hash_secret_value(value: str) -> str:
    """SHA-256 hex de un código de respaldo normalizado o de un token de restablecimiento."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
