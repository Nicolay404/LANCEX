"""Identidad (MODELO-DE-DATOS-INICIAL.md §app_user). Tabla gestionada por SQL: managed = False."""

import uuid

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.sessions.base_session import AbstractBaseSession
from django.db import models
from django.db.models.functions import Now

from apps.core.capabilities import AccountStatus, PlatformRole
from apps.core.models import choices_of


class UserManager(BaseUserManager):
    """Sin `create_superuser`: no existe createsuperuser en LANCEX (ADR-0003, ROLES §6)."""

    def get_by_natural_key(self, email):
        return self.get(email__iexact=email)

    def create_user(self, email: str, password: str, display_name: str, **extra):
        user = self.model(email=email.strip().lower(), display_name=display_name, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    display_name = models.CharField(max_length=60)
    is_active = models.BooleanField(default=True)
    platform_role = models.CharField(max_length=20, choices=choices_of(PlatformRole), default=PlatformRole.USER)
    status = models.CharField(max_length=20, choices=choices_of(AccountStatus), default=AccountStatus.ACTIVE)
    status_reason = models.CharField(max_length=300, null=True, blank=True)
    status_changed_at = models.DateTimeField(null=True, blank=True)
    status_changed_by = models.UUIDField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=Now())
    bio = models.CharField(max_length=300, null=True, blank=True)  # perfil público opcional
    location_city = models.CharField(max_length=80, null=True, blank=True)
    # `password` y `last_login` vienen de AbstractBaseUser.

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]

    objects = UserManager()

    class Meta:
        managed = False
        db_table = "app_user"

    def __str__(self) -> str:
        return self.display_name


class UserMfa(models.Model):
    """`lancex.user_mfa`: 2FA activo (sin fila = sin 2FA). PRIVADO: el secreto nunca sale de aquí."""

    user = models.OneToOneField(User, primary_key=True, on_delete=models.DO_NOTHING, db_column="user_id")
    secret = models.CharField(max_length=32)
    last_step = models.BigIntegerField(null=True, blank=True)
    enabled_at = models.DateTimeField(db_default=Now())

    class Meta:
        managed = False
        db_table = "user_mfa"

    def __str__(self) -> str:
        return f"2FA de {self.user_id}"  # nunca el secreto


class MfaRecoveryCode(models.Model):
    """`lancex.mfa_recovery_code`: códigos de respaldo de un solo uso (solo SHA-256)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    code_hash = models.CharField(max_length=64, unique=True)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        managed = False
        db_table = "mfa_recovery_code"

    def __str__(self) -> str:
        return f"Código de respaldo {self.pk}"  # nunca el hash


class PasswordResetToken(models.Model):
    """`lancex.password_reset_token`: enlace de un solo uso emitido por un admin (solo SHA-256)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user_id = models.UUIDField()
    token_hash = models.CharField(max_length=64, unique=True)
    created_by_user_id = models.UUIDField()
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(db_default=Now())

    class Meta:
        managed = False
        db_table = "password_reset_token"

    def __str__(self) -> str:
        return f"Restablecimiento {self.pk}"  # nunca el hash


class UserSession(AbstractBaseSession):
    """`lancex.django_session` con `user_id` para revocar sesiones por usuario (ver sessions.py)."""

    user_id = models.UUIDField(null=True, blank=True, db_index=True)

    class Meta:
        managed = False
        db_table = "django_session"

    @classmethod
    def get_session_store_class(cls):
        from .sessions import SessionStore

        return SessionStore
