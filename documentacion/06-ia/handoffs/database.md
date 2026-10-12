# Handoff: Base de datos

## Pendiente inicial

- LX-01: crear el proyecto Supabase, invitar a los 3, `supabase init` y `supabase link`.
- LX-02: migración base con TODO `MODELO-DE-DATOS-INICIAL.md`: esquema `lancex`, rol `lancex_app` (sin DDL, `search_path`), tablas, `CHECK`, índices, grants, RLS sin políticas, trigger append-only de `audit_event`, tablas `django_session` (con `user_id`), `django_cache`, `report` y `job_heartbeat`, columnas `platform_role` y `status` en `app_user`, índice único parcial de subasta abierta por publicación.
- Compartir la contraseña de `lancex_app` por el canal privado acordado.
- LX-03: `scripts/db/bootstrap_local.sql` (roles `anon`, `authenticated`, `lancex_app`) y `apply_local` (sh y ps1).
- LX-13: `seed_demo`.
- Eres la única persona que ejecuta `supabase db push`; registra la salida de `supabase migration list` en tu bitácora.

## Handoffs activos

- Fecha/hora: 2026-10-11T21:02:57-05:00
- Issue/PR: LX-02, LX-03 (borrador hecho por ARQ a pedido del humano; rama `backend-lancex`)
- Para rol: Base de datos
- Estado: **requiere revisión** antes de aplicar
- Contexto: migración base completa y scripts del Postgres local. Probada en `postgres:17` local: se aplica sin errores y 182 pruebas pasan conectadas como `lancex_app`. RLS con política solo para `lancex_app` (ADR-0007).
- Archivos, tablas o endpoints afectados: `supabase/migrations/20261011180000_baseline_lancex.sql`, `scripts/db/{bootstrap_local.sql,local_after.sql,apply_local.sh,apply_local.ps1}`; las 20 tablas del modelo.
- Acción requerida: 1) revisar el SQL; 2) tras merge a `main`: instalar la Supabase CLI, `supabase init` (no sobrescribe `migrations/`), `supabase link --project-ref sikzfznkirzpjpqsjfsd`, `supabase db push --dry-run`, `supabase db push`, `supabase migration list` (piden la contraseña de `postgres`); 3) en el SQL Editor: `ALTER ROLE lancex_app WITH PASSWORD '...'` y compartirla por canal privado; 4) confirmar que la versión mayor de PostgreSQL del proyecto coincide con `postgres:17` del CI (si no, ajustar `ci.yml` y el comando de Docker).
- Cómo validar: en el SQL Editor `SET ROLE lancex_app; SHOW search_path; SELECT count(*) FROM lancex.app_user;`; luego, desde el backend con el `.env` completo, `python manage.py check --database default`.

- Fecha/hora: 2026-10-11T20:13:52-05:00
- Issue/PR: LX-11, LX-12 (rama `backend-lancex`)
- Para rol: Base de datos / seguridad (LX-16, LX-18)
- Estado: listo para consumir
- Contexto: modelos nuevos `managed = False`: `AuditEvent` (`audit_event`, `occurred_at DEFAULT clock_timestamp()`), `Category` (`category`, id smallint identity), `Listing` (`listing`, `created_at`/`updated_at` con DEFAULT de PostgreSQL; el backend actualiza `updated_at = clock_timestamp()`).
- Archivos, tablas o endpoints afectados: `audit_event`, `category`, `listing`; consulta `SELECT EXISTS(... FROM auction WHERE listing_id = %s AND status = ANY(...))` en `apps/auctions/services/listing_guard.py`.
- Acción requerida: LX-02 con esas columnas y grants (`audit_event` solo INSERT/SELECT; `category` SELECT para `lancex_app` además de lo que use admin). LX-16/LX-18: las pruebas `django_db` de `tests/accounts` y `tests/catalog` ya cubren IDOR (404) y límites; completar la matriz por rol.
- Cómo validar: `cd backend && LANCEX_REQUIRE_DB=1 python -m pytest` con el Postgres local preparado (hoy 15 pruebas de BD se omiten).

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

