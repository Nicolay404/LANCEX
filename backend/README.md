# Backend LANCEX

**Stack:** Python 3.12 + Django 5.2 LTS + Django REST Framework + drf-spectacular + psycopg 3. Base de datos PostgreSQL en Supabase (esquema `lancex`, rol `lancex_app`). Logs técnicos en Firestore.

> **Sin migraciones de Django.** Los modelos usan `managed = False` y el esquema vive en `supabase/migrations/` (ADR-0003). No ejecutar `makemigrations` ni `migrate`.

## Responsabilidad

- Validar identidad, permisos y todas las reglas del dominio.
- Ser la única vía de escritura para pujas, límites proxy, ofertas selladas, inscripciones y estados de subasta.
- Serializar pujas concurrentes por subasta con transacciones y bloqueo de fila.
- Registrar la auditoría de negocio en PostgreSQL y los logs técnicos en Firestore.
- Publicar el contrato OpenAPI y errores estructurados.

## Estructura

```text
backend/
├── manage.py
├── conftest.py               # django_db_setup sobrescrito (base local preparada con SQL)
├── config/settings/{base,dev,test}.py
└── apps/
    ├── core/                 # TimeSource, request_id, errores API, logging Firestore
    ├── accounts/             # User (managed=False), auth por sesión
    ├── organizations/
    ├── catalog/              # categorías, publicaciones, imágenes, procurement_request
    ├── auctions/
    │   ├── domain/           # Python puro: mechanisms/, closing/, proxy.py, state.py
    │   ├── services/
    │   ├── api/
    │   └── management/commands/close_due_auctions.py
    ├── audit/
    └── notifications/        # notificaciones + watchlist
```

Detalle y reglas de dependencia: ADR-0005.

## Settings clave

```python
AUTH_USER_MODEL = "accounts.User"
MIGRATION_MODULES = {app.rsplit(".", 1)[-1]: None for app in INSTALLED_APPS}
DATABASES["default"]["OPTIONS"] = {"options": "-c search_path=lancex,public"}
DATABASES["default"]["CONN_MAX_AGE"] = 60
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_TRUSTED_ORIGINS = env.list("CSRF_TRUSTED_ORIGINS")
REST_FRAMEWORK = {"DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"], ...}
```

## Datos

- `Decimal` en Python y `numeric` en PostgreSQL para importes.
- Hora de negocio con `TimeSource.db_now()` (PostgreSQL).
- Pruebas siempre sobre PostgreSQL local, nunca SQLite ni el proyecto compartido.

## Calidad

Pruebas de reglas, permisos, integración, concurrencia, idempotencia, cierres y no fuga de datos. Los eventos y logs se emiten con `transaction.on_commit`, nunca antes de confirmar la transacción.

Arranque: `documentacion/07-operacion/CONFIGURACION-LOCAL.md`.
