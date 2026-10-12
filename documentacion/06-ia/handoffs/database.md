# Handoff: Base de datos

## Pendiente inicial

- LX-01: crear el proyecto Supabase, invitar a los 3, `supabase init` y `supabase link`.
- LX-02: migración base con TODO `MODELO-DE-DATOS-INICIAL.md`: esquema `lancex`, rol `lancex_app` (sin DDL, `search_path`), tablas, `CHECK`, índices, grants, RLS sin políticas, trigger append-only de `audit_event`, tablas `django_session` (con `user_id`), `django_cache`, `report` y `job_heartbeat`, columnas `platform_role` y `status` en `app_user`, índice único parcial de subasta abierta por publicación.
- Compartir la contraseña de `lancex_app` por el canal privado acordado.
- LX-03: `scripts/db/bootstrap_local.sql` (roles `anon`, `authenticated`, `lancex_app`) y `apply_local` (sh y ps1).
- LX-13: `seed_demo`.
- Eres la única persona que ejecuta `supabase db push`; registra la salida de `supabase migration list` en tu bitácora.

## Handoffs activos

- Fecha/hora: 2026-10-11T19:42:04-05:00
- Issue/PR: LX-04 / LX-17 (rama `architect-lancex`, sin PR aún)
- Para rol: Base de datos
- Estado: listo para consumir
- Contexto: el backend ya tiene modelos `managed = False` que la migración base (LX-02) debe satisfacer exactamente.
- Archivos, tablas o endpoints afectados: `lancex.app_user` (id uuid, email, password, display_name, is_active, platform_role, status, status_reason, status_changed_at, status_changed_by uuid, last_login, created_at DEFAULT now()); `lancex.django_session` (session_key, session_data, expire_date, **user_id uuid NULL con índice**); `lancex.django_cache` (estructura de `createcachetable`); `lancex.organization` y `lancex.organization_membership` según `MODELO-DE-DATOS-INICIAL.md`.
- Acción requerida: incluirlas en LX-02 con esos nombres de columna; `ALTER ROLE lancex_app SET search_path = lancex, public;`; en `scripts/db/apply_local` crear la base `lancex_test` en el puerto 54329 (lo espera `TEST_DATABASE_URL`).
- Cómo validar: con el Postgres local preparado, `cd backend && LANCEX_REQUIRE_DB=1 python -m pytest` (hoy 2 pruebas de BD se omiten por falta de Postgres local); la prueba de deriva llegará con LX-06.

## Plantilla

- Fecha/hora:
- Issue/PR:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto:
- Archivos, tablas o endpoints afectados:
- Acción requerida:
- Cómo validar:

