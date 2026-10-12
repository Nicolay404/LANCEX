"""Configuración global de pytest.

Los modelos son `managed = False` y LANCEX no usa migraciones de Django (ADR-0003), así que
pytest-django NO crea la base de pruebas: se usa el PostgreSQL local ya preparado con los SQL
de `supabase/migrations/` (scripts/db/apply_local). Ver GESTION-DEL-ESQUEMA.md.

- Las pruebas unitarias (sin `django_db`) no tocan ninguna base.
- Si el PostgreSQL local no está disponible, las pruebas de base se OMITEN con el motivo; en CI
  se define LANCEX_REQUIRE_DB=1 para que fallen en lugar de omitirse.
"""

import os

import pytest

LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres"}


@pytest.fixture(scope="session")
def django_db_setup(django_db_blocker):
    from django.conf import settings
    from django.db import connection

    host = settings.DATABASES["default"].get("HOST") or "localhost"
    if host not in LOCAL_DB_HOSTS:
        pytest.exit(f"Base de pruebas no local ({host}). Nunca se prueba contra Supabase.", returncode=2)

    with django_db_blocker.unblock():
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT to_regnamespace(%s) IS NOT NULL", [settings.DB_SCHEMA])
                schema_ready = cursor.fetchone()[0]
        except Exception as exc:  # noqa: BLE001
            _unavailable(f"PostgreSQL local no disponible ({type(exc).__name__}). Levanta el contenedor de pruebas.")
        else:
            if not schema_ready:
                _unavailable(f"El esquema '{settings.DB_SCHEMA}' no existe. Ejecuta scripts/db/apply_local.")
        finally:
            connection.close()


def _unavailable(reason: str) -> None:
    if os.environ.get("LANCEX_REQUIRE_DB") == "1":
        pytest.fail(reason, pytrace=False)
    pytest.skip(reason)
