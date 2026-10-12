# Referencias técnicas oficiales

Consultar la documentación de la versión fijada en los archivos de dependencias. Un cambio de criterio importante se registra en una ADR.

## Supabase / PostgreSQL

- Migraciones con Supabase CLI: https://supabase.com/docs/guides/deployment/database-migrations
- Referencia de la CLI: https://supabase.com/docs/reference/cli/introduction
- Conexión a PostgreSQL (directa vs pooler): https://supabase.com/docs/guides/database/connecting-to-postgres
- Seguridad de datos: https://supabase.com/docs/guides/database/secure-data
- Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Storage (URLs firmadas): https://supabase.com/docs/guides/storage
- PostgreSQL `SELECT ... FOR UPDATE` / `SKIP LOCKED`: https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE

## Firebase / Firestore

- Firestore: https://firebase.google.com/docs/firestore
- Admin SDK para Python: https://firebase.google.com/docs/admin/setup
- Reglas de seguridad: https://firebase.google.com/docs/firestore/security/get-started
- Políticas TTL: https://firebase.google.com/docs/firestore/ttl
- Cuotas y límites: https://firebase.google.com/docs/firestore/quotas

## Django y DRF

- Opción `managed` de modelos: https://docs.djangoproject.com/en/5.2/ref/models/options/#managed
- `MIGRATION_MODULES`: https://docs.djangoproject.com/en/5.2/ref/settings/#migration-modules
- Modelo de usuario personalizado: https://docs.djangoproject.com/en/5.2/topics/auth/customizing/
- Protección CSRF: https://docs.djangoproject.com/en/5.2/ref/csrf/
- Transacciones y `on_commit`: https://docs.djangoproject.com/en/5.2/topics/db/transactions/
- Django REST Framework: https://www.django-rest-framework.org/
- drf-spectacular: https://drf-spectacular.readthedocs.io/
- pytest-django (bases de datos de prueba): https://pytest-django.readthedocs.io/en/latest/database.html
- `logging.handlers.QueueHandler`: https://docs.python.org/3/library/logging.handlers.html#queuehandler

## Frontend

- Vite (proxy del servidor de desarrollo): https://vite.dev/config/server-options
- TanStack Query: https://tanstack.com/query/latest
- openapi-typescript: https://openapi-ts.dev/
- Vitest: https://vitest.dev/guide/
- Playwright: https://playwright.dev/docs/intro

## GitHub

- Protección de ramas: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- Servicios de contenedor en Actions (PostgreSQL): https://docs.github.com/en/actions/use-cases-and-examples/using-containerized-services/creating-postgresql-service-containers

## Arquitectura

- Modelo C4: https://c4model.com/
- ISO/IEC 25010 (modelo de calidad): https://iso25000.com/index.php/en/iso-25000-standards/iso-25010

> Las referencias son de consulta, no garantía de compatibilidad entre versiones.
