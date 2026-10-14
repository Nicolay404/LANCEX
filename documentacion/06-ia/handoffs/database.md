# Handoff: Base de datos

## Pendiente inicial

- LX-01: crear el proyecto Supabase, invitar a los 3, `supabase init` y `supabase link`.
- LX-02: migración base con TODO `MODELO-DE-DATOS-INICIAL.md`: esquema `lancex`, rol `lancex_app` (sin DDL, `search_path`), tablas, `CHECK`, índices, grants, RLS sin políticas, trigger append-only de `audit_event`, tablas `django_session` (con `user_id`), `django_cache`, `report` y `job_heartbeat`, columnas `platform_role` y `status` en `app_user`, índice único parcial de subasta abierta por publicación.
- Compartir la contraseña de `lancex_app` por el canal privado acordado.
- LX-03: `scripts/db/bootstrap_local.sql` (roles `anon`, `authenticated`, `lancex_app`) y `apply_local` (sh y ps1).
- LX-13: `seed_demo`.
- Eres la única persona que ejecuta `supabase db push`; registra la salida de `supabase migration list` en tu bitácora.

## Handoffs activos

- Fecha/hora: 2026-10-13T19:43:43-05:00
- Issue/PR: `EMAXCONNSESSION` (pool de Supabase agotado) — rama `feat/architect/cuenta-y-actividad`, sin commit aún
- Para rol: Frontend y Base de datos (todos los que corren el backend contra Supabase)
- Estado: requiere acción tras el merge
- Contexto: el backend dejaba conexiones abiertas 60 s por cada hilo de `runserver` (`CONN_MAX_AGE = 60`) y llenaba las 15 plazas del pooler en modo sesión, compartidas por los tres. Síntoma: 500 intermitentes con `EMAXCONNSESSION max clients reached`. Corregido: `CONN_MAX_AGE` por defecto 0 (`DB_CONN_MAX_AGE`), ADR-0004 Enmienda 2.
- Archivos, tablas o endpoints afectados: `backend/config/settings/base.py`, `backend/.env.example`.
- Acción requerida: tras el merge a `main`, `git pull` y **reiniciar** tu backend. Mientras alguien corra la versión vieja, sigue ocupando plazas de todos. No hace falta tocar el `.env`.
- Cómo validar: navegar el catálogo un par de minutos con el backend contra Supabase sin 500.

- Fecha/hora: 2026-10-13T19:09:56-05:00
- Issue/PR: rendimiento contra Supabase (handoff de Frontend del 2026-10-13)
- Para rol: Base de datos
- Estado: requiere revisión (decisión de BD, no bloquea)
- Contexto: el backend ya no consulta la base para el throttling general y agrupa consultas (ver handoff a Frontend). Lo que queda depende de la distancia: el proyecto está en `us-west-2` (~150–200 ms por consulta desde Ecuador).
- Archivos, tablas o endpoints afectados: proyecto Supabase (región). Sin cambios de esquema.
- Acción requerida: valorar (a) usar el Postgres local de Docker para el día a día (`scripts/db/apply_local.ps1` + `seed_demo`) y Supabase solo para integración/demo; (b) si se quiere menos latencia, crear el proyecto en São Paulo (`sa-east-1`): implica proyecto nuevo, volver a aplicar `supabase/migrations`, fijar la contraseña de `lancex_app`, crear el bucket `listing-images` y repartir las nuevas URL y claves. Decisión del equipo antes de la demo, no urgente.
- Cómo validar: `Measure-Command { Invoke-WebRequest http://localhost:8000/api/v1/auctions/ -UseBasicParsing }` antes y después.

- Fecha/hora: 2026-10-13T00:03:04-05:00 (2026-10-13T05:03:04Z)
- Issue/PR: LX-18 (base implementada por ARQ en la auditoría)
- Para rol: Base de datos / seguridad
- Estado: listo para consumir
- Contexto: `tests/security/test_role_sweep.py` recorre TODA la matriz y exige 401/403 por actor (visitante, usuario, moderador, admin); filas con denegación por objeto marcadas `object_level_for` y probadas con una subasta real ajena. Matriz de trazabilidad nueva: `documentacion/05-calidad/MATRIZ-DE-TRAZABILIDAD.md`.
- Archivos, tablas o endpoints afectados: `backend/tests/security/*`, `endpoint_matrix.yaml`.
- Acción requerida: completar LX-18 con los actores `buyer_member` y `supplier_member` (requieren organizaciones de prueba) y mantener la matriz al día. Sigue pendiente R1: aplicar `20261012230000_perfil_usuario.sql` en Supabase tras el merge.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/security -q`.

- Fecha/hora: 2026-10-12T23:30:01-05:00
- Issue/PR: perfil configurable (rama `backend-lancex`)
- Para rol: Base de datos
- Estado: **bloqueante tras el merge** — aplicar antes de usar el backend contra Supabase
- Contexto: nueva migración aditiva `supabase/migrations/20261012230000_perfil_usuario.sql` (`app_user.bio`, `app_user.location_city`, ambas NULL con CHECK). El modelo `User` ya las lee: hasta que se aplique en Supabase, cualquier consulta de usuarios contra Supabase fallará.
- Archivos, tablas o endpoints afectados: `lancex.app_user`.
- Acción requerida: tras el merge a `main`, `git pull` y `.\scripts\db\push_supabase.ps1` (aplica solo la migración nueva); registrar `supabase migration list` en la bitácora. Pendientes previos: bucket PRIVADO `listing-images` en Storage y compartir `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`.
- Cómo validar: en el SQL Editor `SELECT bio, location_city FROM lancex.app_user LIMIT 1;` sin error.

- Fecha/hora: 2026-10-12T20:26:42-05:00
- Issue/PR: LX-13 (seed), LX-75, LX-80 (Fase 7)
- Para rol: Base de datos / seguridad
- Estado: listo para consumir
- Contexto: `seed_demo` (solo DML, idempotente, se niega con `APP_ENV=production`, contraseña obligatoria por variable) y `bootstrap_admin` (solo el primer admin) implementados por ARQ para desbloquear al frontend. Modelos nuevos `ListingImage` y `Rating`. Base de LX-80 cubierta: abuso de staff (moderador no suspende staff, último admin, step-up) y sesiones (suspensión y cambio de rol las revocan).
- Archivos, tablas o endpoints afectados: `listing_image` (DELETE usado al borrar imagen), `rating`, `report` (resolución), `app_user` (estado/rol), `proxy_bid_limit`/`sealed_offer` (efectos de suspensión), `job_heartbeat`.
- Acción requerida: revisar el seed (puede reemplazar al tuyo de LX-13); LX-75 (desempeño y caída de Firestore); crear el bucket PRIVADO `listing-images` en Supabase Storage y compartir `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` por el canal privado. Sin cambios de esquema.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest -q` (445 passed).

- Fecha/hora: 2026-10-12T20:17:21-05:00
- Issue/PR: LX-61 (verificación de vela, QA-07)
- Para rol: Base de datos
- Estado: listo para consumir
- Contexto: `scripts/verify_candle.py` (solo biblioteca estándar) ya existe y una prueba lo ejecuta contra una subasta real cerrada. El cierre marca `counted = false` en las pujas posteriores al instante (único UPDATE permitido sobre `bid`).
- Archivos, tablas o endpoints afectados: `auction.candle_*`, `bid.counted`, `audit_event` (`candle_revealed` con semilla y compromiso tras el cierre).
- Acción requerida: LX-61 completar QA-07 (recalcular el resultado desde `bid` con el corte y compararlo con `auction`). Sin cambios de esquema.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/auctions/test_candle_flow.py -q`.

- Fecha/hora: 2026-10-12T20:13:16-05:00
- Issue/PR: LX-52 (pruebas B2B)
- Para rol: Base de datos
- Estado: listo para consumir
- Contexto: modelos nuevos `ProcurementRequest`, `AuctionParticipant`; `Auction.procurement_request` y `Bid.organization` pasan a FK (misma columna, sin cambio de esquema). La fórmula del total, la admisión congelada (`not_reviewed`) y `NOT_ADMITTED` ya tienen pruebas.
- Archivos, tablas o endpoints afectados: `organization`, `organization_membership`, `procurement_request`, `auction_participant`, `bid` (`organization_id`, `unit_price`, `shipping_cost`). El job ejecuta `UPDATE auction_participant ... not_reviewed`.
- Acción requerida: ampliar LX-52 con casos límite de redondeo y cantidades con 3 decimales. Sin cambios de esquema.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/auctions/test_reverse_flow.py tests/auctions/test_domain_reverse.py -q`.

- Fecha/hora: 2026-10-12T19:55:50-05:00
- Issue/PR: LX-41, LX-43 (sobre cerrado)
- Para rol: Base de datos / seguridad
- Estado: listo para consumir
- Contexto: ya cubierto por ARQ: empate por `seq` de la versión vigente, no fuga antes del cierre (API, auditoría, ETag), 5 ediciones simultáneas -> una sola vigente. Modelo nuevo `SealedOffer` (`managed = False`), cubierto por la prueba de deriva.
- Archivos, tablas o endpoints afectados: `sealed_offer`, `auction.active_offer_count`, `audit_event` (`sealed_offer_*` sin importes, `sealed_offers_revealed`).
- Acción requerida: LX-43 ampliar QA-02 a logs de Firestore (los rechazos solo registran `error_code`). Sin cambios de esquema.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/auctions -q`.

- Fecha/hora: 2026-10-11T22:27:02-05:00
- Issue/PR: LX-34 (invariante proxy bajo concurrencia)
- Para rol: Base de datos
- Estado: listo para consumir
- Contexto: `test_parallel_proxies_keep_a_single_live_limit` (8 máximos simultáneos) ya verifica "como máximo un límite vivo, el del líder". Modelos nuevos `managed = False`: `ProxyBidLimit`, `Notification`, `Watchlist` (PK compuesta), `Report`; la prueba de deriva los cubre.
- Archivos, tablas o endpoints afectados: `proxy_bid_limit`, `notification`, `watchlist`, `report`; el job escribe `notification` con `INSERT ... WHERE NOT EXISTS`.
- Acción requerida: ampliar LX-34 (proxy + manual + cierre simultáneos). Sin cambios de esquema.
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/auctions -q`.

- Fecha/hora: 2026-10-11T21:48:54-05:00
- Issue/PR: LX-25 (concurrencia) y LX-26 (recálculo) — base hecha por ARQ en LX-22/LX-23
- Para rol: Base de datos
- Estado: listo para consumir
- Contexto: `tests/auctions/test_concurrency.py` ya cubre QA-01 (20 pujas paralelas), QA-08 (misma `Idempotency-Key` en paralelo) y 3 cierres simultáneos; pasan contra Postgres 17 local como `lancex_app`.
- Archivos, tablas o endpoints afectados: `auction`, `bid`, `audit_event`, `job_heartbeat`.
- Acción requerida: LX-25: ampliar (más hilos, pujas + cierre al mismo tiempo, reintentos tras timeout). LX-26: script que recalcule el resultado desde `bid` y lo compare con `auction` (QA-07).
- Cómo validar: `LANCEX_REQUIRE_DB=1 python -m pytest tests/auctions -q`.

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

