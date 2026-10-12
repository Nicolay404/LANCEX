"""SessionStore propio: guarda user_id para poder revocar sesiones (T12)."""

import uuid

from django.contrib.auth import SESSION_KEY

from apps.accounts.models import UserSession
from apps.accounts.sessions import SessionStore


def new_store() -> SessionStore:
    """Sesión nueva en memoria: clave dada y caché vacía para no consultar la base."""
    store = SessionStore(session_key="a" * 32)
    store._session_cache = {}
    return store


def test_session_row_records_the_authenticated_user():
    user_id = uuid.uuid4()
    obj = new_store().create_model_instance({SESSION_KEY: str(user_id)})
    assert isinstance(obj, UserSession)
    assert obj.user_id == user_id


def test_anonymous_or_malformed_session_has_no_user():
    assert new_store().create_model_instance({}).user_id is None
    assert new_store().create_model_instance({SESSION_KEY: "no-es-uuid"}).user_id is None


def test_model_maps_to_sql_managed_table():
    assert UserSession._meta.db_table == "django_session"
    assert UserSession._meta.managed is False
