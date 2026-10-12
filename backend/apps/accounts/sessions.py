"""Motor de sesión de LANCEX: `SESSION_ENGINE = "apps.accounts.sessions"` (ADR-0004, T12).

Igual que el backend `db` de Django, pero sobre `lancex.django_session` con la columna extra
`user_id`, para poder revocar todas las sesiones de un usuario al suspenderlo, cambiarle el
rol o cambiar su contraseña.
"""

from __future__ import annotations

import uuid

from django.contrib.auth import SESSION_KEY
from django.contrib.sessions.backends.db import SessionStore as DBSessionStore

from .models import UserSession


class SessionStore(DBSessionStore):
    @classmethod
    def get_model_class(cls):
        return UserSession

    def create_model_instance(self, data):
        obj = super().create_model_instance(data)
        try:
            obj.user_id = uuid.UUID(str(data[SESSION_KEY])) if data.get(SESSION_KEY) else None
        except ValueError:
            obj.user_id = None
        return obj


def revoke_all_sessions(user_id, *, except_session_key: str | None = None) -> int:
    """Borra las sesiones del usuario (todas o todas menos la actual). Devuelve cuántas."""
    sessions = UserSession.objects.filter(user_id=user_id)
    if except_session_key:
        sessions = sessions.exclude(session_key=except_session_key)
    deleted, _ = sessions.delete()
    return deleted
