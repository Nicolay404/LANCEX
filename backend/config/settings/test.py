"""Settings de pruebas: PostgreSQL local preparado con los SQL de supabase/migrations.

Nunca apuntan al proyecto Supabase compartido (GESTION-DEL-ESQUEMA.md).
"""

from urllib.parse import urlparse

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import build_database, env

LOCAL_DB_HOSTS = {"localhost", "127.0.0.1", "::1", "postgres"}  # "postgres": servicio de CI

TEST_DATABASE_URL = env("TEST_DATABASE_URL", default="postgres://postgres:postgres@localhost:54329/lancex_test")
if urlparse(TEST_DATABASE_URL).hostname not in LOCAL_DB_HOSTS:
    raise ImproperlyConfigured("TEST_DATABASE_URL debe apuntar a un PostgreSQL local, nunca a Supabase.")

SECRET_KEY = "test-only-secret-key-not-for-real-use"  # noqa: S105
DEBUG = False
LANCEX_SERVE_SCHEMA = True

DATABASES = {"default": build_database(TEST_DATABASE_URL, sslmode="disable")}
DATABASES["default"]["OPTIONS"]["connect_timeout"] = 3  # Postgres local: si no responde, fallar rápido

# Las pruebas nunca escriben en Firestore (ADR-0002); el handler se prueba con un doble.
FIRESTORE_LOGS = {**FIRESTORE_LOGS, "ENABLED": False}

CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # solo velocidad en pruebas
