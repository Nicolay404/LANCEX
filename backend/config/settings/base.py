"""Settings comunes de LANCEX.

Decisiones de referencia: ADR-0003 (sin migraciones de Django), ADR-0004 (sesión + CSRF,
DatabaseCache, throttling), ADR-0002 (logs en Firestore) y ADR-0006 (DenyAll por defecto).
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env", overwrite=False)

# --- Núcleo ---------------------------------------------------------------------------
# Cada entorno decide si es obligatoria (dev la exige; test usa una propia).
SECRET_KEY = env("DJANGO_SECRET_KEY", default="")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS", default=["http://localhost:5173"])

APP_ENV = env("APP_ENV", default="local")
DEV_NAME = env("DEV_NAME", default="") or "unknown"

INSTALLED_APPS = [
    # contenttypes y auth solo aportan el framework de autenticación; sus tablas no se usan.
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "drf_spectacular",
    "apps.core",
    "apps.accounts",
    "apps.organizations",
    "apps.catalog",
    "apps.auctions",
    "apps.audit",
    "apps.notifications",
]

# ADR-0003: ninguna app tiene migraciones de Django.
MIGRATION_MODULES = {app.rsplit(".", 1)[-1]: None for app in INSTALLED_APPS}

MIDDLEWARE = [
    "apps.core.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
TEMPLATES: list = []  # API JSON pura: sin plantillas ni Django Admin (ADR-0004).

# --- Base de datos (ADR-0003, ADR-0004) -------------------------------------------------
DB_SCHEMA = env("DB_SCHEMA", default="lancex")


def build_database(url: str, *, sslmode: str) -> dict:
    """Configura PostgreSQL con search_path propio y conexiones persistentes."""
    db = environ.Env.db_url_config(url)
    db["OPTIONS"] = {
        "options": f"-c search_path={DB_SCHEMA},public",
        "sslmode": sslmode,
        "connect_timeout": 10,  # sin esto, un host caído bloquea minutos (TCP del SO)
    }
    db["CONN_MAX_AGE"] = 60
    db["CONN_HEALTH_CHECKS"] = True
    db["ATOMIC_REQUESTS"] = False  # las transacciones las abren los servicios.
    return db


DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Identidad y sesión (ADR-0004, ADR-0006) -------------------------------------------
AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = ["django.contrib.auth.backends.ModelBackend"]
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 10},
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# SessionStore propio sobre lancex.django_session con columna user_id (revocación por usuario).
SESSION_ENGINE = "apps.accounts.sessions"
SESSION_COOKIE_AGE = 43200  # 12 h absolutas
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_SAVE_EVERY_REQUEST = False
SESSION_EXPIRE_AT_BROWSER_CLOSE = False

CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False  # el frontend lee csrftoken para enviarlo en X-CSRFToken.
CSRF_FAILURE_VIEW = "apps.core.views.csrf_failure"

# --- Cabeceras de seguridad (SEGURIDAD-Y-AUTORIZACION §3.11) ---------------------------
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin"

# --- Caché compartida entre los tres backends (throttling y bloqueo de login) ----------
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",  # tabla creada por SQL en el esquema lancex
    }
}

# --- Internacionalización ---------------------------------------------------------------
LANGUAGE_CODE = "es"
TIME_ZONE = "UTC"  # instantes en UTC; la hora de negocio la da PostgreSQL (TimeSource).
USE_I18N = True
USE_TZ = True

# --- Django REST Framework (ADR-0006) --------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.core.authentication.CsrfSessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.core.permissions.DenyAll"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "DEFAULT_PAGINATION_CLASS": "apps.core.pagination.StandardPagination",
    "PAGE_SIZE": 20,
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "120/min",
        "user": "120/min",
        "login": "5/min",
        "register": "3/min",
        "bids": "30/min",
        "reports": "10/day",
    },
    "UNAUTHENTICATED_USER": "django.contrib.auth.models.AnonymousUser",
}

SPECTACULAR_SETTINGS = {
    "TITLE": "LANCEX API",
    "DESCRIPTION": "Contrato v1 de LANCEX (documentacion/04-api/CONTRATO-API-INICIAL.md).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SERVE_PERMISSIONS": ["apps.core.permissions.Public"],
    "SCHEMA_PATH_PREFIX": r"/api/v1",
}

# El esquema OpenAPI enumera todas las rutas (también las de staff): solo se sirve en local.
LANCEX_SERVE_SCHEMA = env.bool("LANCEX_SERVE_SCHEMA", default=DEBUG)

# Carga del principal (usuario + membresías) para calcular capacidades. Se inyecta por
# ruta para que apps.core no dependa de apps de dominio.
LANCEX_PRINCIPAL_LOADER = "apps.accounts.principal.load_principal"

# --- Logging (ADR-0002) -----------------------------------------------------------------
FIRESTORE_LOGS = {
    "ENABLED": env.bool("FIRESTORE_LOGS_ENABLED", default=False),
    "PROJECT_ID": env("FIREBASE_PROJECT_ID", default=""),
    "CREDENTIALS_PATH": env("GOOGLE_APPLICATION_CREDENTIALS", default=""),
    "COLLECTION": env("FIRESTORE_LOG_COLLECTION", default="logs_tecnicos"),
    "MIN_LEVEL": env("FIRESTORE_LOG_MIN_LEVEL", default="WARNING"),
    "TTL_DAYS": env.int("FIRESTORE_LOG_TTL_DAYS", default=30),
    "BATCH_SIZE": 20,
    "FLUSH_INTERVAL_S": 2.0,
}

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "request_context": {"()": "apps.core.logging.filters.RequestContextFilter"},
        "sensitive_data": {"()": "apps.core.logging.filters.SensitiveDataFilter"},
    },
    "formatters": {
        "console": {
            "format": "%(asctime)s %(levelname)s %(name)s [%(request_id)s] %(message)s",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
            "filters": ["request_context", "sensitive_data"],
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"level": "INFO", "propagate": True},
        "django.db.backends": {"level": "WARNING", "propagate": True},
        "lancex": {"level": "INFO", "propagate": True},
        # Clientes HTTP/gRPC de Firebase: muy verbosos en DEBUG.
        "urllib3": {"level": "WARNING", "propagate": True},
        "google": {"level": "WARNING", "propagate": True},
        "grpc": {"level": "WARNING", "propagate": True},
    },
}
