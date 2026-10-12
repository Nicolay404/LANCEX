"""Garantías del esquema SQL (ADR-0002, ADR-0003, ADR-0005) verificadas como `lancex_app`.

Se ejecutan contra el PostgreSQL local preparado con scripts/db/apply_local.
"""

import uuid

import pytest
from django.apps import apps as django_apps
from django.db import DatabaseError, connection, transaction

pytestmark = pytest.mark.django_db


def execute(sql: str, params=None):
    with connection.cursor() as cursor:
        cursor.execute(sql, params or [])
        return cursor.fetchall() if cursor.description else None


def rejected(sql: str, params=None) -> bool:
    try:
        with transaction.atomic():
            execute(sql, params)
    except DatabaseError:
        return True
    return False


def test_tests_run_as_the_application_role():
    assert execute("SELECT current_user")[0][0] == "lancex_app"
    assert execute("SHOW search_path")[0][0].startswith("lancex")


@pytest.mark.parametrize(
    "model",
    [m for m in django_apps.get_models() if m.__module__.startswith("apps.")],
    ids=lambda m: m._meta.label,
)
def test_model_matches_sql_table(model):
    """Prueba de deriva: SELECT de todas las columnas del modelo (LX-06)."""
    list(model._default_manager.all()[:1])


@pytest.mark.parametrize(
    "ddl",
    [
        "CREATE TABLE lancex.hack (id int)",
        "ALTER TABLE lancex.auction ADD COLUMN hack int",
        "DROP TABLE lancex.bid",
        "TRUNCATE lancex.audit_event",
        "CREATE SCHEMA hack",
    ],
)
def test_application_role_has_no_ddl(ddl):
    assert rejected(ddl)


def _user_id() -> str:
    from apps.accounts.models import User

    return str(
        User.objects.create_user(
            email=f"s-{uuid.uuid4().hex[:10]}@example.com", password="Prueba-Larga-123", display_name="Schema"
        ).pk
    )


def test_audit_event_is_append_only():
    from apps.audit.services import record

    with transaction.atomic():
        event = record("admin_action", actor_user_id=None, entity_type="test", data={"k": "v"})
    assert rejected("UPDATE lancex.audit_event SET action = 'x' WHERE id = %s", [event.pk])
    assert rejected("DELETE FROM lancex.audit_event WHERE id = %s", [event.pk])


@pytest.mark.django_db(transaction=True)
def test_audit_record_requires_a_transaction():
    from apps.audit.services import record

    with pytest.raises(RuntimeError):
        record("admin_action", actor_user_id=None, entity_type="test")


def test_bid_book_cannot_be_deleted_or_rewritten():
    assert rejected("DELETE FROM lancex.bid")
    assert rejected("UPDATE lancex.bid SET amount = 1")


def test_email_is_unique_case_insensitively():
    user_id = _user_id()
    email = execute("SELECT email FROM lancex.app_user WHERE id = %s", [user_id])[0][0]
    assert rejected(
        "INSERT INTO lancex.app_user (email, password, display_name) VALUES (%s, 'x', 'Otro')", [email.upper()]
    )


def test_mechanism_matrix_is_enforced_by_the_database():
    """ADR-0005: sealed solo con fixed; proxy solo en ascending."""
    from apps.catalog.models import Category

    owner = _user_id()
    slug = f"c-{uuid.uuid4().hex[:8]}"
    category = Category.objects.create(name=slug, slug=slug)
    listing = execute(
        "INSERT INTO lancex.listing (owner_user_id, category_id, title, description, item_condition, location_city)"
        " VALUES (%s, %s, 't', 'd', 'new', 'Loja') RETURNING id",
        [owner, category.pk],
    )[0][0]
    insert = (
        "INSERT INTO lancex.auction (owner_user_id, listing_id, mechanism, closing_policy, proxy_enabled)"
        " VALUES (%s, %s, %s, %s, %s)"
    )
    assert rejected(insert, [owner, listing, "sealed", "soft_close", False])
    assert rejected(insert, [owner, listing, "sealed", "fixed", True])
    assert not rejected(insert, [owner, listing, "ascending", "candle", True])


def test_supabase_client_roles_have_no_access():
    rows = execute(
        "SELECT grantee, table_name FROM information_schema.role_table_grants"
        " WHERE table_schema = 'lancex' AND grantee IN ('anon', 'authenticated', 'PUBLIC')"
    )
    assert rows == []


def test_every_table_has_row_level_security():
    rows = execute("SELECT tablename FROM pg_tables WHERE schemaname = 'lancex' AND NOT rowsecurity")
    assert rows == []
