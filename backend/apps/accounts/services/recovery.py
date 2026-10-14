"""Recuperación de acceso sin proveedor de correo (decisión del equipo, 2026-10-14).

- Un admin genera un enlace de restablecimiento de un solo uso (30 min) y se lo entrega al usuario
  por un canal propio. Solo se guarda el SHA-256 del token; el token en claro se muestra una vez.
- El usuario fija una contraseña nueva con ese token: se cierran todas sus sesiones. Si tiene 2FA,
  lo sigue necesitando para entrar (el reseteo no salta el segundo factor).
- Si perdió el teléfono y los códigos de respaldo, un admin le quita el 2FA.
Ambas acciones de admin exigen su contraseña (step-up), un motivo y nunca aplican sobre sí mismo.
"""

from __future__ import annotations

import logging
import secrets
from datetime import timedelta

from django.db import transaction

from apps.accounts.models import MfaRecoveryCode, PasswordResetToken, User, UserMfa
from apps.accounts.sessions import revoke_all_sessions
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from apps.core.time import time_source

from . import lockout, totp
from .validation import check_password_strength

security_logger = logging.getLogger("lancex.security")

RESET_TTL = timedelta(minutes=30)
RESET_PATH = "/restablecer-contrasena"


def _admin_target(actor: User, user_id, *, password: str, reason: str) -> tuple[User, str]:
    """Revalida (no confía en la vista): admin activo, step-up, motivo y objetivo ajeno existente."""
    if actor.platform_role != PlatformRole.ADMIN or actor.status != AccountStatus.ACTIVE:
        raise Forbidden()
    if not actor.check_password(password):
        security_logger.warning("Step-up fallido", extra={"event": "step_up_failed", "user_id": str(actor.pk)})
        raise Forbidden(code="STEP_UP_FAILED", message="La contraseña no es correcta.")
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise ValidationFailed(details={"fields": {"reason": ["El motivo es obligatorio."]}})
    if str(actor.pk) == str(user_id):
        raise Forbidden(message="No puedes aplicarte esta acción a ti mismo.")
    target = User.objects.filter(pk=user_id).first()
    if target is None:
        raise NotFound()
    return target, reason


def issue_password_reset(actor: User, user_id, *, password: str, reason: str) -> dict:
    target, reason = _admin_target(actor, user_id, password=password, reason=reason)
    token = secrets.token_urlsafe(32)
    now = time_source.db_now()
    expires_at = now + RESET_TTL
    with transaction.atomic():
        # Un enlace vigente por usuario: los anteriores dejan de valer.
        PasswordResetToken.objects.filter(user_id=target.pk, used_at__isnull=True, expires_at__gt=now).update(
            expires_at=now
        )
        PasswordResetToken.objects.create(
            user_id=target.pk,
            token_hash=totp.hash_secret_value(token),
            created_by_user_id=actor.pk,
            expires_at=expires_at,
        )
        record(
            "security_password_reset_issued",
            actor_user_id=actor.pk,
            entity_type="user",
            entity_id=target.pk,
            data={"reason": reason, "expires_at": expires_at.isoformat()},
        )
    return {"token": token, "expires_at": expires_at, "reset_path": f"{RESET_PATH}?token={token}"}


def confirm_password_reset(*, token: str, new_password: str) -> None:
    invalid = ValidationFailed(details={"fields": {"token": ["El enlace no es válido o ya expiró."]}})
    now = time_source.db_now()
    with transaction.atomic():
        row = PasswordResetToken.objects.select_for_update().filter(token_hash=totp.hash_secret_value(token)).first()
        if row is None or row.used_at is not None or row.expires_at <= now:
            security_logger.warning("Token de restablecimiento inválido", extra={"event": "password_reset_invalid"})
            raise invalid
        user = User.objects.select_for_update().get(pk=row.user_id)
        if user.status != AccountStatus.ACTIVE:
            raise Forbidden(code="ACCOUNT_SUSPENDED", message="Tu cuenta está suspendida.")
        check_password_strength(new_password, user, field="new_password")  # si falla, el token sigue vigente
        user.set_password(new_password)
        user.save(update_fields=["password"])
        PasswordResetToken.objects.filter(pk=row.pk).update(used_at=now)
        record("security_password_reset_completed", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)
    revoke_all_sessions(user.pk)
    lockout.reset(user.email)


def reset_mfa(actor: User, user_id, *, password: str, reason: str) -> None:
    target, reason = _admin_target(actor, user_id, password=password, reason=reason)
    with transaction.atomic():
        if not UserMfa.objects.filter(user_id=target.pk).delete()[0]:
            raise Conflict(code="MFA_NOT_ENABLED", message="El usuario no tiene doble factor activo.")
        MfaRecoveryCode.objects.filter(user_id=target.pk).delete()
        record(
            "security_mfa_reset_by_admin",
            actor_user_id=actor.pk,
            entity_type="user",
            entity_id=target.pk,
            data={"reason": reason},
        )
    revoke_all_sessions(target.pk)
