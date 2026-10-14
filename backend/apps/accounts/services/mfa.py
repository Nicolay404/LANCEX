"""Doble factor (TOTP + códigos de respaldo) de la cuenta propia y segundo paso del login.

- El secreto pendiente de activación vive en la sesión, no en la base, hasta confirmarlo con un código.
- Login con 2FA: `/auth/login/` valida la contraseña y deja un "login pendiente" en la sesión
  (5 min, sin autenticar). `/auth/login/mfa/` lo completa con un código TOTP o de respaldo.
- Los códigos fallidos suman al bloqueo de la cuenta (5 fallos -> 15 min), igual que la contraseña.
- Nunca se registran códigos, secretos ni contraseñas en logs o auditoría.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.contrib.auth import login as django_login
from django.db import IntegrityError, transaction

from apps.accounts.models import MfaRecoveryCode, User, UserMfa
from apps.accounts.sessions import revoke_all_sessions
from apps.audit.services import record
from apps.core.capabilities import AccountStatus
from apps.core.errors import AuthenticationRequired, Conflict, Forbidden, RateLimited, ValidationFailed
from apps.core.time import time_source

from . import lockout, totp

security_logger = logging.getLogger("lancex.security")

MODEL_BACKEND = "django.contrib.auth.backends.ModelBackend"
PENDING_KEY = "lancex_mfa_pending"
SETUP_KEY = "lancex_mfa_setup"
PENDING_TTL = timedelta(minutes=5)


def _http(request):
    return getattr(request, "_request", request)


def is_enabled(user: User) -> bool:
    return UserMfa.objects.filter(user_id=user.pk).exists()


def status(user: User) -> dict:
    mfa = UserMfa.objects.filter(user_id=user.pk).only("enabled_at").first()
    remaining = MfaRecoveryCode.objects.filter(user_id=user.pk, used_at__isnull=True).count() if mfa else 0
    return {
        "enabled": mfa is not None,
        "enabled_at": mfa.enabled_at if mfa else None,
        "recovery_codes_remaining": remaining,
    }


def _step_up(user: User, password: str) -> None:
    if not user.check_password(password):
        security_logger.warning("Step-up fallido", extra={"event": "step_up_failed", "user_id": str(user.pk)})
        raise Forbidden(code="STEP_UP_FAILED", message="La contraseña no es correcta.")


# --- Activación y gestión -------------------------------------------------------------------


def start_setup(request, user: User, *, password: str) -> dict:
    """Paso 1: genera un secreto (solo en la sesión) y su URI para el QR."""
    _step_up(user, password)
    if is_enabled(user):
        raise Conflict(code="MFA_ALREADY_ENABLED", message="El doble factor ya está activo.")
    secret = totp.new_secret()
    _http(request).session[SETUP_KEY] = secret
    return {"secret": secret, "otpauth_uri": totp.provisioning_uri(secret, user.email)}


def enable(request, user: User, *, code: str) -> list[str]:
    """Paso 2: confirma con un código de la app. Devuelve los códigos de respaldo (una sola vez)."""
    session = _http(request).session
    secret = session.get(SETUP_KEY)
    if not secret:
        raise Conflict(code="MFA_SETUP_REQUIRED", message="Primero inicia la configuración del doble factor.")
    step = totp.matching_step(secret, code, time_source.db_now())
    if step is None:
        raise ValidationFailed(details={"fields": {"code": ["El código no es correcto."]}})

    codes = totp.new_recovery_codes()
    try:
        with transaction.atomic():
            UserMfa.objects.create(user_id=user.pk, secret=secret, last_step=step)
            _replace_recovery_codes(user, codes)
            record("security_mfa_enabled", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)
    except IntegrityError:  # otra pestaña lo activó a la vez
        raise Conflict(code="MFA_ALREADY_ENABLED", message="El doble factor ya está activo.") from None
    session.pop(SETUP_KEY, None)
    revoke_all_sessions(user.pk, except_session_key=session.session_key)
    return codes


def disable(user: User, *, password: str, code: str) -> None:
    _step_up(user, password)
    with transaction.atomic():
        if not UserMfa.objects.select_for_update().filter(user_id=user.pk).exists():
            raise Conflict(code="MFA_NOT_ENABLED", message="El doble factor no está activo.")
        if _consume_second_factor(user, code) is None:
            raise Forbidden(code="STEP_UP_FAILED", message="El código no es correcto.")
        MfaRecoveryCode.objects.filter(user_id=user.pk).delete()
        UserMfa.objects.filter(user_id=user.pk).delete()
        record("security_mfa_disabled", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)


def regenerate_recovery_codes(user: User, *, password: str, code: str) -> list[str]:
    _step_up(user, password)
    codes = totp.new_recovery_codes()
    with transaction.atomic():
        if not UserMfa.objects.select_for_update().filter(user_id=user.pk).exists():
            raise Conflict(code="MFA_NOT_ENABLED", message="El doble factor no está activo.")
        if _consume_second_factor(user, code) is None:
            raise Forbidden(code="STEP_UP_FAILED", message="El código no es correcto.")
        _replace_recovery_codes(user, codes)
        record("security_mfa_recovery_codes_regenerated", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)
    return codes


def _replace_recovery_codes(user: User, codes: list[str]) -> None:
    MfaRecoveryCode.objects.filter(user_id=user.pk).delete()
    MfaRecoveryCode.objects.bulk_create(
        MfaRecoveryCode(user_id=user.pk, code_hash=totp.hash_secret_value(totp.normalize_recovery_code(c)))
        for c in codes
    )


def _consume_second_factor(user: User, code: str) -> str | None:
    """Verifica y CONSUME un código TOTP o de respaldo. Llamar dentro de una transacción.

    Devuelve "totp", "recovery" o None. El TOTP aceptado avanza `last_step` (no se puede repetir);
    el código de respaldo queda marcado como usado.
    """
    mfa = UserMfa.objects.select_for_update().filter(user_id=user.pk).first()
    if mfa is None or not code:
        return None
    now = time_source.db_now()
    step = totp.matching_step(mfa.secret, code, now, after=mfa.last_step)
    if step is not None:
        UserMfa.objects.filter(user_id=user.pk).update(last_step=step)
        return "totp"
    code_hash = totp.hash_secret_value(totp.normalize_recovery_code(code))
    if MfaRecoveryCode.objects.filter(user_id=user.pk, code_hash=code_hash, used_at__isnull=True).update(used_at=now):
        return "recovery"
    return None


# --- Login en dos pasos -------------------------------------------------------------------


def begin_login(request, user: User) -> None:
    """La contraseña fue correcta: deja el login pendiente del segundo factor (sin autenticar)."""
    expires = time_source.db_now() + PENDING_TTL
    _http(request).session[PENDING_KEY] = {"uid": str(user.pk), "exp": expires.isoformat()}


def clear_pending(request) -> None:
    _http(request).session.pop(PENDING_KEY, None)


def complete_login(request, *, code: str) -> User:
    http = _http(request)
    session = http.session
    pending = session.get(PENDING_KEY)
    if not pending or datetime.fromisoformat(pending["exp"]) <= time_source.db_now():
        session.pop(PENDING_KEY, None)
        raise AuthenticationRequired(code="MFA_SESSION_EXPIRED", message="Vuelve a iniciar sesión.")

    user = User.objects.filter(pk=pending["uid"]).first()
    if user is None or not user.is_active or user.status != AccountStatus.ACTIVE:
        session.pop(PENDING_KEY, None)
        raise AuthenticationRequired(code="MFA_SESSION_EXPIRED", message="Vuelve a iniciar sesión.")
    if lockout.is_locked(user.email):
        session.pop(PENDING_KEY, None)
        security_logger.warning("Login bloqueado temporalmente", extra={"event": "login_locked"})
        raise RateLimited(details={"retry_after_s": lockout.LOCK_SECONDS})

    with transaction.atomic():
        method = _consume_second_factor(user, code)
        if method == "recovery":
            record("security_mfa_recovery_code_used", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)
    if method is None:
        locked = lockout.register_failure(user.email)
        if locked:
            session.pop(PENDING_KEY, None)
        security_logger.warning(
            "Segundo factor incorrecto",
            extra={"event": "login_locked" if locked else "mfa_failed", "user_id": str(user.pk)},
        )
        raise AuthenticationRequired(code="INVALID_MFA_CODE", message="El código no es correcto.")

    session.pop(PENDING_KEY, None)
    lockout.reset(user.email)
    django_login(http, user, backend=MODEL_BACKEND)  # rota la clave de sesión (T12)
    return user
