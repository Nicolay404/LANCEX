"""Settings de desarrollo local: Django en la laptop contra el Supabase compartido (ADR-0004)."""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import LOGGING, SECRET_KEY, build_database, env

if not SECRET_KEY:
    raise ImproperlyConfigured("Define DJANGO_SECRET_KEY en backend/.env (ver .env.example).")

DEBUG = env.bool("DJANGO_DEBUG", default=True)

# Pooler de Supabase en modo sesión, usuario lancex_app (nunca postgres).
DATABASES = {
    "default": build_database(
        env("DATABASE_URL"),
        sslmode=env("DB_SSLMODE", default="require"),
    )
}

LOGGING["root"]["level"] = "DEBUG" if DEBUG else "INFO"
