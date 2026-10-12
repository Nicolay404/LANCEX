"""Casos de uso de cuentas: registro, login, logout, perfil y contraseña (LX-11).

Revalidan todo (no confían en la vista), auditan dentro de la transacción y registran los
eventos de seguridad como WARNING sin datos sensibles (nunca email ni contraseña).
"""

from __future__ import annotations

import logging

from django.contrib.auth import authenticate, update_session_auth_hash
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.db import IntegrityError, transaction

from apps.accounts.models import User
from apps.accounts.sessions import revoke_all_sessions
from apps.audit.services import record
from apps.core.capabilities import AccountStatus, MembershipStatus, PlatformRole
from apps.core.errors import AuthenticationRequired, Conflict, Forbidden, RateLimited
from apps.organizations.models import OrganizationMembership

from . import lockout
from .validation import check_password_strength, clean_display_name, normalize_email

security_logger = logging.getLogger("lancex.security")

MODEL_BACKEND = "django.contrib.auth.backends.ModelBackend"


def _http(request):
    """Acepta Request de DRF o HttpRequest de Django."""
    return getattr(request, "_request", request)


def register(request, *, email: str, password: str, display_name: str) -> User:
    email = normalize_email(email)
    display_name = clean_display_name(display_name)
    if User.objects.filter(email__iexact=email).exists():
        raise Conflict(code="EMAIL_ALREADY_REGISTERED", message="Ya existe una cuenta con ese email.")
    check_password_strength(password, User(email=email, display_name=display_name))

    with transaction.atomic():
        try:
            with transaction.atomic():  # savepoint: solo la inserción puede chocar con el índice único
                user = User.objects.create_user(email=email, password=password, display_name=display_name)
        except IntegrityError:
            raise Conflict(code="EMAIL_ALREADY_REGISTERED", message="Ya existe una cuenta con ese email.") from None
        record("user_registered", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)

    django_login(_http(request), user, backend=MODEL_BACKEND)
    return user


def login(request, *, email: str, password: str) -> User:
    email = normalize_email(email)
    if lockout.is_locked(email):
        security_logger.warning("Login bloqueado temporalmente", extra={"event": "login_locked"})
        raise RateLimited(details={"retry_after_s": lockout.LOCK_SECONDS})

    user = authenticate(_http(request), username=email, password=password)
    if user is None:
        locked = lockout.register_failure(email)
        security_logger.warning("Login fallido", extra={"event": "login_locked" if locked else "login_failed"})
        raise AuthenticationRequired(code="INVALID_CREDENTIALS", message="Email o contraseña incorrectos.")

    if user.status != AccountStatus.ACTIVE:
        security_logger.warning(
            "Intento de login de cuenta suspendida", extra={"event": "suspended_login_attempt", "user_id": str(user.pk)}
        )
        raise Forbidden(code="ACCOUNT_SUSPENDED", message="Tu cuenta está suspendida.")

    lockout.reset(email)
    django_login(_http(request), user, backend=MODEL_BACKEND)  # rota la clave de sesión (T12)
    return user


def logout(request) -> None:
    django_logout(_http(request))  # borra la fila de sesión en el servidor


def update_profile(user: User, *, display_name: str) -> User:
    user.display_name = clean_display_name(display_name)
    user.save(update_fields=["display_name"])
    return user


def change_password(request, user: User, *, current_password: str, new_password: str) -> None:
    """Exige la contraseña actual (step-up) y cierra las demás sesiones (REGLAS §13)."""
    if not user.check_password(current_password):
        security_logger.warning("Step-up fallido", extra={"event": "step_up_failed", "user_id": str(user.pk)})
        raise Forbidden(code="STEP_UP_FAILED", message="La contraseña actual no es correcta.")
    check_password_strength(new_password, user, field="new_password")

    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password"])
        record("security_password_changed", actor_user_id=user.pk, entity_type="user", entity_id=user.pk)

    http = _http(request)
    update_session_auth_hash(http, user)  # la sesión actual sigue válida con una clave nueva
    revoke_all_sessions(user.pk, except_session_key=http.session.session_key)


def organizations_of(user: User) -> list[OrganizationMembership]:
    """Membresías activas con su organización (staff nunca tiene)."""
    if user.platform_role != PlatformRole.USER:
        return []
    return list(
        OrganizationMembership.objects.filter(user_id=user.pk, status=MembershipStatus.ACTIVE)
        .select_related("organization")
        .order_by("organization__legal_name")
    )
