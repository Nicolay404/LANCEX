# Matriz de trazabilidad: requisito → API → servicio → datos → pruebas

**Actualizada:** 2026-10-13T05:01:37Z, tras la auditoría funcional ([`AUDITORIA-FUNCIONAL-BACKEND.md`](AUDITORIA-FUNCIONAL-BACKEND.md)).
**Evidencia global:** `cd backend; $env:LANCEX_REQUIRE_DB="1"; python -m pytest` → **655 passed** contra PostgreSQL 17 local como `lancex_app`.

Cómo usarla: si cambia una funcionalidad, esta fila indica qué endpoint, servicio, tablas, pruebas y documentos revisar. Los IDs son los de `PLAN-DE-DESARROLLO.md`; "—" indica un requisito que proviene directamente de un documento (se cita en la columna Fuente). **Estado:** ✅ verificado con pruebas · 🟡 implementado, verificación parcial · ⛔ bloqueado/pendiente.

Leyenda de capas (todas en `backend/apps/`): `S:` servicio, `D:` dominio puro. Autorización global: `DenyAll` + capacidad declarada (check `lancex.E001`) y barrido por rol `tests/security/test_role_sweep.py` (aplica a TODAS las filas).

## Cuenta e identidad

| ID | Fuente | Actor y flujo | Endpoint | Permiso / validación | Servicio | Datos | Pruebas | Estado |
|---|---|---|---|---|---|---|---|---|
| LX-11 | CONTRATO §Auth | Visitante se registra | `POST /auth/register/` | Público, CSRF, throttle 3/min, `StrictInput`, validadores de contraseña, nombre sin URLs | `S: accounts.register` | `app_user`, `django_session`, `audit_event(user_registered)` | `tests/accounts/test_auth_api.py` | ✅ |
| LX-11 | SEGURIDAD T11 | Inicia sesión | `POST /auth/login/` | Público, CSRF, 5/min por IP, bloqueo 5 fallos/15 min por email (también inexistentes), mensaje genérico, suspendida → 403 | `S: accounts.login`, `lockout` | `django_session`, `django_cache` | `test_auth_api.py::TestLoginWithoutDatabase` | ✅ |
| LX-11 | CONTRATO | Cierra sesión | `POST /auth/logout/` | `account.manage_own` | `S: accounts.logout` | `django_session` | `test_auth_api.py::TestAuthFlow` | ✅ |
| LX-11 | ADR-0006 | Consulta su perfil y capacidades | `GET /auth/me/` | `account.manage_own` | `principal`, `capabilities` | `app_user`, membresías | `test_auth_api.py`, `tests/core/test_capabilities.py` | ✅ |
| — | PANTALLAS `/cuenta` | Edita perfil (nombre, bio, ciudad) | `PATCH /auth/me/` | `UNKNOWN_FIELD` ante campos privilegiados; bio sin URLs | `S: accounts.update_profile` | `app_user` (+ migración `20261012230000`), `audit_event(user_profile_updated)` solo nombres de campo | `test_account_and_activity.py`, `test_audit_fixes.py::test_d5_*` | ✅ (⛔ en Supabase hasta aplicar la migración) |
| LX-11 | REGLAS §13, T12 | Cambia contraseña | `POST /auth/password/` | contraseña actual (`STEP_UP_FAILED`), validadores; nunca registra secretos | `S: accounts.change_password` | `app_user.password` (hash Django), sesiones, `audit_event(security_password_changed)` | `test_auth_api.py::test_password_change_*` | ✅ |
| — | SEGURIDAD T12 | Ve y cierra sus otras sesiones | `GET /auth/sessions/`, `POST /auth/sessions/revoke-others/` | `account.manage_own`; id de sesión por hash | `S: sessions_of`, `revoke_other_sessions` | `django_session`, `audit_event(security_sessions_revoked)` | `test_account_and_activity.py`, `test_d5_*` | ✅ |
| — | SEGURIDAD T11 | Activa/usa/desactiva el doble factor (TOTP + códigos de respaldo) | `/auth/mfa/*`, `POST /auth/login/mfa/` | `account.manage_own`; step-up; anti-repetición; fallos al bloqueo de cuenta | `S: mfa` | `user_mfa`, `mfa_recovery_code`, `audit_event(security_mfa_*)` | `tests/accounts/test_mfa_and_recovery.py` | ✅ |
| — | Decisión 2026-10-14 | Admin restablece contraseña o quita el 2FA de un usuario | `POST /admin/users/{id}/password-reset/`, `/mfa-reset/`, `POST /auth/password-reset/` | `admin.manage_users`; step-up + motivo; nunca a sí mismo; token de un uso (hash) | `S: recovery` | `password_reset_token`, `audit_event(security_password_reset_*, security_mfa_reset_by_admin)` | `test_mfa_and_recovery.py` | ✅ |
| — | PANTALLAS `/usuarios/:id` | Ve un perfil público | `GET /users/{id}/`, `GET /auctions/?seller=` | Público; sin email; sin borradores | vista + `queries.catalog` | `app_user`, `rating` | `test_post_close.py`, `test_account_and_activity.py` | ✅ |
| — | PANTALLAS `/panel` | Resumen personal y de operaciones (no es saldo) | `GET /me/summary/` | `account.manage_own`; solo datos propios | `S: my_activity.summary` | `auction`, `bid`, `notification` | `test_account_and_activity.py` | ✅ |
| — | PANTALLAS `/mis-pujas` | Participaciones activas/ganadas/perdidas | `GET /me/participations/` | `bid.place`; máximos y ofertas solo propios | `S: my_activity.participations` | `bid`, `sealed_offer`, `proxy_bid_limit` | `test_account_and_activity.py` | ✅ |
| — | Pedido del humano | Registro de actividad propia | `GET /me/activity/` | `account.manage_own`; lista blanca de `data` | `S: my_activity.activity` | `audit_event` | `test_account_and_activity.py` | ✅ |
| — | SEGURIDAD §7 | Recuperar contraseña / cambiar o verificar email | — | — | — | — | — | ⛔ sin proveedor de correo (decisión humana) |

## Catálogo y publicaciones

| ID | Fuente | Actor y flujo | Endpoint | Permiso / validación | Servicio | Datos | Pruebas | Estado |
|---|---|---|---|---|---|---|---|---|
| LX-12 | CONTRATO | Lista categorías | `GET /categories/` | Público; solo activas | `S: catalog.active_categories` | `category` | `tests/catalog/test_listings_api.py` | ✅ |
| LX-12, LX-15 | CONTRATO | Crea, lista y edita sus publicaciones | `POST/GET /listings/`, `GET/PATCH /listings/{id}/` | `listing.manage_own`; ajenas → 404; máx. 50; `LISTING_LOCKED` con subasta abierta | `S: catalog.*` | `listing` | `test_listings_api.py`, `test_account_and_activity.py` | ✅ |
| LX-70 | ADR-0004 §6, T17 | Sube y borra imágenes | `/listings/{id}/images/…` | dueño; tipo/tamaño declarados y REALES; máx. 6; sin Storage → 503 sin borrar la fila | `S: catalog.images`, `storage` | `listing_image`, bucket privado | `tests/catalog/test_images.py`, `test_d4_*` | 🟡 (Storage real ⛔ sin configurar) |

## Subastas (núcleo y modalidades)

| ID | Fuente | Actor y flujo | Endpoint | Permiso / validación | Servicio / dominio | Datos | Pruebas | Estado |
|---|---|---|---|---|---|---|---|---|
| LX-20 | REGLAS §1–2, ADR-0005 | Reglas ascendentes y estado efectivo | — | — | `D: mechanisms/ascending`, `state`, `registry` | — | `test_domain_ascending.py` | ✅ |
| LX-21 | REGLAS §1, §9 | Crea, edita, publica, cancela | `POST /auctions/`, `PATCH /auctions/{id}/`, `…/publish/`, `…/cancel/` | `auction.create_personal`/`manage_own`; dueño u org. dueña; `RULES_LOCKED`; inversa no edita textos aquí (D1) | `S: lifecycle` | `auction`, `audit_event` | `test_auction_flow.py::TestLifecycle`, `test_audit_fixes.py::test_d1_*` | ✅ |
| LX-22 | ADR-0005 D3 | Puja | `POST /auctions/{id}/bids/` | `bid.place`, `Idempotency-Key`, 30/min, 1/s, `FOR UPDATE`, hora PG | `S: bidding.place_bid` | `bid`, `auction`, `audit_event`, `notification(outbid)` | `test_auction_flow.py::TestBidding`, `test_concurrency.py` | ✅ |
| LX-23 | ADR-0005 D4 | Cierre idempotente | job `close_due_auctions`, `GET …/result/` | sistema; `SKIP LOCKED` | `S: closing` | `auction`, `job_heartbeat`, `audit_event`, `notification` | `TestClosing`, `test_three_backends_closing_*` | ✅ |
| LX-24 | CONTRATO, matriz de visibilidad | Catálogo, detalle, live, historial, resultado | `GET /auctions/…` | Público con lista blanca; ETag; seudónimos; `?mine`, `?seller`, `?organization` | `S: queries`, `api/presenters` | `auction`, `bid` | `TestReads`, `test_role_flows.py`, `test_d3_*` | ✅ |
| LX-31 | REGLAS §3 | Máximo proxy | `GET/PUT …/proxy-limit/` | `proxy.manage_own`; solo el propio; sube nunca baja | `D: proxy`, `S: bidding.set_proxy_limit` | `proxy_bid_limit` (privado) | `test_domain_proxy_soft_close.py`, `test_phase3_flow.py` | ✅ |
| LX-32 | REGLAS §4 | Soft close | — | — | `D: closing/soft_close` | `auction.ends_at`, `audit_event(auction_extended)` | idem | ✅ |
| LX-33 | REGLAS §11 | Seguir y notificaciones | `PUT/DELETE …/watch/`, `GET /notifications/`, `POST /notifications/read/` | propias; `data` con lista blanca | `S: notifications` | `watchlist`, `notification` | `test_phase3_flow.py` | ✅ |
| LX-40 | REGLAS §6 | Oferta sellada | `GET/PUT/DELETE …/sealed-offer/` | `sealed.manage_own`; sin fuga antes del cierre (API, ETag, auditoría) | `D: sealed`, `S: sealed` | `sealed_offer` (privado) | `test_domain_sealed.py`, `test_sealed_flow.py` | ✅ |
| LX-50 | REGLAS §8, §15 | Organizaciones y miembros | `/organizations/…` | membresía/owner; 404 a ajenos; `LAST_OWNER`; step-up | `S: organizations` | `organization`, `organization_membership` | `test_reverse_flow.py::TestOrganizations` | ✅ |
| LX-51, LX-54 | REGLAS §7 | Necesidades, inscripción, calificación, oferta inversa | `/procurement-requests/…`, `…/participants/…`, `…/reverse-quote/`, `POST …/bids/` | org. verificada; `CONFLICT_OF_INTEREST`; `NOT_ADMITTED`; total oficial | `D: reverse`, `S: participants`, `bidding` | `procurement_request`, `auction_participant`, `bid` | `test_domain_reverse.py`, `test_reverse_flow.py`, `test_role_flows.py` | ✅ |
| LX-60 | REGLAS §5 | Vela verificable | `GET …/candle-proof/` | tras el cierre | `D: closing/candle` | `auction.candle_*`, `bid.counted` | `test_domain_candle.py`, `test_candle_flow.py` (+ `scripts/verify_candle.py`) | ✅ |
| LX-71 | REGLAS §10 | Liquidación y calificación | `PATCH …/settlement/`, `POST …/rating/` | dueño/ganador; final; una vez | `S: post_close` | `auction.settlement_*`, `rating` | `test_post_close.py`, `test_role_flows.py` | ✅ |
| LX-37 | REGLAS §14 | Reportar | `POST /reports/` | 10/día, uno por objeto, 404 a no visibles | `S: moderation` | `report` | `test_phase3_flow.py::TestReports` | ✅ |

## Staff

| ID | Fuente | Actor y flujo | Endpoint | Permiso / validación | Servicio | Datos | Pruebas | Estado |
|---|---|---|---|---|---|---|---|---|
| LX-77 | ROLES §4, §7 | Moderación: bandeja, reportes, cancelar, suspender, verificar | `/moderation/…` | capacidades `moderation.*`; motivo; reglas staff | `S: moderation/staff`, `organizations` | `report`, `auction`, `app_user`, `organization` | `tests/moderation/test_staff.py`, `test_role_flows.py`, `test_d2_*` | ✅ |
| LX-79 | ROLES §6 | Administración: usuarios, roles, categorías, auditoría, salud | `/admin/…` | `admin.*`; step-up; `LAST_ADMIN`; `OPEN_ACTIVITY` | `S: moderation/staff` | `app_user`, `category`, `audit_event`, `job_heartbeat` | `test_staff.py` | ✅ |
| LX-18 | SEGURIDAD §5 | Inventario y barrido por rol | todas | 401/403 por actor según la matriz | — | — | `tests/security/test_endpoint_inventory.py`, `test_role_sweep.py` (186 casos) | ✅ |

## Transversales

| Requisito | Fuente | Implementación | Pruebas | Estado |
|---|---|---|---|---|
| Sin migraciones de Django; modelos `managed = False` | ADR-0003 | `MIGRATION_MODULES`, `manage.py` bloquea comandos | `tests/architecture`, `tests/db` (deriva modelo↔SQL) | ✅ |
| Hora de negocio de PostgreSQL | ADR-0004 | `TimeSource`, `ClockTimestamp` | `test_time_and_context.py`, regla AST | ✅ |
| Auditoría append-only en la misma transacción | ADR-0002 | `audit_event` + trigger + `record()` exige transacción | `test_schema_guarantees.py` | ✅ |
| Logs técnicos sin datos sensibles | ADR-0002, T22 | `SensitiveDataFilter`, lista blanca, Firestore asíncrono | `test_logging.py` (+ verificación real 2026-10-11) | ✅ |
| Errores uniformes sin trazas | T21 | `api_exception_handler` | `test_api_permissions_and_errors.py` | ✅ |
| RLS y sin acceso para `anon`/`authenticated` | ADR-0007 | migración base | `test_schema_guarantees.py` | ✅ |
| Escaneo de dependencias | — | `npm audit` (0); `pip-audit` no disponible | — | 🟡 |
| Carga / desempeño (QA-05) | ATRIBUTOS | — | — | ⛔ pendiente (LX-75) |
