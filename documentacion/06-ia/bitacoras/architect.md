# Bitácora de IA: Arquitectura

> Solo el rol de arquitectura agrega entradas. No editar entradas históricas: corregirlas mediante una nueva entrada.

## Plantilla de entrada

```markdown
## YYYY-MM-DDTHH:mm:ss-05:00: INICIO/CIERRE: ISSUE/PR
- Humano responsable:
- Herramienta/modelo IA (si se conoce):
- Rama y commit:
- Objetivo:
- Archivos/documentos modificados:
- Decisiones/supuestos:
- Pruebas ejecutadas y resultado real:
- Riesgos/bloqueos:
- Handoff/siguiente paso:
```

## 2026-10-11T13:16:54-05:00: CIERRE: definición completa (sin issue/PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: copia local de `main`, sin commit.
- Objetivo: cerrar la definición del proyecto antes de programar: alcance completo, stack, esquema sin migraciones de Django, logs en Firestore, reglas, modelo, contrato API, calidad y plan por roles.
- Archivos/documentos modificados: `AGENTS.md`, `README.md`, `.env.example`, `backend/.env.example` (nuevo), `frontend/.env.example` (nuevo), `backend/README.md`, `frontend/README.md`, `LANCEX_CONTEXTO_GENERAL.md` (ahora apunta al canónico), `MANIFEST.txt`, toda `documentacion/` (nuevos: `PLAN-DE-DESARROLLO.md`, `ATRIBUTOS-DE-CALIDAD.md`, ADR-0003, ADR-0004, ADR-0005, `decisiones/README.md`, `GESTION-DEL-ESQUEMA.md`).
- Decisiones/supuestos: decisiones del humano: sin migraciones de Django, solo Supabase y Firebase en la nube, backend/frontend en local, Firebase para logs, alcance completo. El resto (auth por sesión, polling, reglas numéricas, vela con commit-reveal, B2B con calificación previa) lo definió la IA por delegación explícita del humano y queda sujeto a revisión del equipo.
- Pruebas ejecutadas y resultado real: ninguna (solo documentación).
- Riesgos/bloqueos: verificar en la práctica `search_path` con el pooler de Supabase y la cuota de Firestore.
- Handoff/siguiente paso: revisión en equipo; PR `docs/architect/definicion-completa`; iniciar Fase 0.

## 2026-10-11T13:39:46-05:00: CIERRE: roles, pantallas y seguridad (sin issue/PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: copia local de `main`, sin commit.
- Objetivo: definir tipos de usuario, capacidades, pantallas por rol, funcionamiento del sistema y controles para que nadie active funciones desde el navegador ni se filtren datos.
- Archivos/documentos modificados: nuevos `03-dominio/ROLES-Y-PERMISOS.md`, `03-dominio/FUNCIONAMIENTO-DEL-SISTEMA.md`, `08-interfaz/PANTALLAS-Y-NAVEGACION.md`, `05-calidad/SEGURIDAD-Y-AUTORIZACION.md`, ADR-0006; actualizados `AGENTS.md`, reglas (§13 a §15), modelo de datos, contrato API, ADR-0004, ADR-0005, calidad (QA-09), plan, visión, contexto, índices, `frontend/README.md`.
- Decisiones/supuestos: staff sin actividad comercial; moderador separado de admin; registro sin verificación de email (riesgo aceptado); bloqueo de login compartido vía `DatabaseCache`.
- Pruebas ejecutadas y resultado real: ninguna (solo documentación).
- Riesgos/bloqueos: revocar sesiones por usuario requiere `SessionStore` propio con `user_id` en `django_session`.
- Handoff/siguiente paso: BD agrega `report`, `django_cache`, `job_heartbeat` y columnas de `app_user` a la migración base (LX-02).

## 2026-10-11T19:20:19-05:00: INICIO: LX-04, LX-05, LX-17 (sin PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `architect-lancex` @ `5d82b14`.
- Objetivo: inicializar `backend/` (Django 5.2 + DRF + drf-spectacular + psycopg 3 + django-environ), núcleo transversal `apps/core` (TimeSource, request_id, errores, logging a Firestore) y autorización por capacidades (DenyAll, HasCapability, system check `lancex.E001`, StrictInputMixin). LX-06 queda a la espera de la migración base (LX-02).
- Plan aprobado por el humano: "confío en ti, crea"; foco primero en arquitectura.

## 2026-10-11T19:42:04-05:00: CIERRE: LX-04, LX-05, LX-17 base (sin PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `architect-lancex` sobre `5d82b14`, cambios sin commit (el humano hará el commit).
- Objetivo: inicializar el backend con la arquitectura de las ADR 0001 a 0006.
- Archivos/documentos modificados: nuevos `backend/{manage.py, conftest.py, pyproject.toml, requirements.txt, requirements-dev.txt}`, `backend/config/**`, `backend/apps/**` (core, accounts, organizations, catalog, auctions, audit, notifications con capas api/services/domain), `backend/tests/**`, `firebase/firestore.rules`; actualizados `backend/README.md`, `backend/.env.example`, `ESTADO-COMPARTIDO.md`, handoffs `architect.md` y `database.md`, `CONFIGURACION-LOCAL.md`; eliminado `backend/.gitkeep`.
- Decisiones/supuestos:
  - Permisos declarativos con fábricas `HasCapability(cap)`, `HasOrgCapability(cap)`, `ByMethod(GET=..., POST=...)` y `Public`; el check `lancex.E001` inspecciona `permission_classes`. Además: E002 capacidad inexistente, E003 prohibido sobrescribir `get_permissions`, E004 el global debe ser `DenyAll`.
  - Capacidades en Python puro (`apps/core/capabilities.py`), fallo cerrado; el cargador ORM se inyecta por `LANCEX_PRINCIPAL_LOADER` para que `core` no dependa de apps de dominio. `reverse.bid` y conflictos de interés por subasta quedan como condición de objeto en servicios.
  - `TimeSource.db_now()` = `clock_timestamp()`; `db_transaction_now()` = `now()`.
  - No autenticado en endpoint protegido → `401 AUTH_REQUIRED`; sin capacidad → `403 FORBIDDEN`; CSRF → `403 CSRF_FAILED`; error no controlado → `500 INTERNAL_ERROR` sin detalles. Se agregaron `METHOD_NOT_ALLOWED` (405), `NOT_ACCEPTABLE` (406) y `UNSUPPORTED_MEDIA_TYPE` (415), no listados en el contrato: revisar e incorporarlos al contrato.
  - Logs a Firestore: documento con lista blanca de campos del esquema de ADR-0002 (más `reason`, `capability`, `fields`, `view`, `serializer` para eventos de seguridad); la excepción se resume como tipo + archivo:línea, sin mensaje. Si `FIRESTORE_LOGS_ENABLED=true` sin credencial, solo consola. Se excluyen los logs del propio cliente de Firebase para evitar bucles.
  - `UserSession` (`django_session` + `user_id`) y `SessionStore` propio con `revoke_all_sessions()`; `django.contrib.sessions` no se instala para evitar dos modelos sobre la misma tabla.
  - Se adelantan `Organization` y `OrganizationMembership` (de LX-06) porque las capacidades contextuales las necesitan.
  - El esquema OpenAPI (`/api/v1/schema/`) solo se sirve con `LANCEX_SERVE_SCHEMA` (por defecto = DEBUG), porque enumera rutas de staff.
  - Throttle `anon` 120/min: valor no definido en ADR-0004, supuesto a confirmar.
- Pruebas ejecutadas y resultado real:
  - `python manage.py check` (con `DJANGO_SECRET_KEY`/`DATABASE_URL` ficticios, `FIRESTORE_LOGS_ENABLED=false`): `System check identified no issues (0 silenced).`
  - `check` con URLConf de prueba que tiene una vista sin permiso: `(lancex.E001) La vista /api/v1/forgotten/ (UndeclaredView) no declara permiso`.
  - `python -m pytest`: `112 passed, 2 skipped` (las 2 omitidas son de `TimeSource` y requieren PostgreSQL local: Docker no estaba corriendo).
  - `ruff check .`: `All checks passed!`; `ruff format --check .`: sin cambios.
  - `python manage.py emit_test_log` con Firestore activado y sin credencial: la app no falla y avisa por stderr. **No verificado** el envío real a Firestore (no hay proyecto Firebase ni cuenta de servicio configurados).
- Riesgos/bloqueos:
  - Entorno local con Python 3.14.7 (ADR-0004 pide 3.12); `requires-python >= 3.12` y ruff apunta a 3.12. CI debe correr en 3.12.
  - Criterio "un WARNING llega a Firestore" verificado solo con doble en memoria; falta prueba real (LX-01/LX-05 humano).
  - Pruebas de BD pendientes hasta LX-02/LX-03 (Postgres local con SQL).
  - Firestore rules en `firebase/firestore.rules` aún no publicadas en el proyecto.
- Handoff/siguiente paso: handoff a BD (columnas que exigen los modelos, `search_path`, base `lancex_test`). Siguiente: commit en `architect-lancex`, PR a `main`, después LX-11 (auth) y LX-06 al recibir LX-02.

## 2026-10-11T20:05:08-05:00: CIERRE: LX-09 CI (sin PR todavía)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `architect-lancex` sobre `9ce4ef9`, sin commit.
- Objetivo: GitHub Actions con ruff + check + pytest sobre PostgreSQL de servicio con SQL aplicado, y job de frontend.
- Archivos/documentos modificados: nuevo `.github/workflows/ci.yml`; `backend/README.md` (formato de ruff en bloques de código).
- Decisiones/supuestos: Python 3.12 en CI; `postgres:17` (ajustar a la versión mayor del proyecto Supabase). Si existen `supabase/migrations/*.sql` se aplican en orden (y `scripts/db/bootstrap_local.sql` si existe) y se activa `LANCEX_REQUIRE_DB=1`; sin SQL, las pruebas de BD se omiten con aviso. El job de frontend se activa solo cuando exista `frontend/package.json` (LX-07). El humano pidió "todo el backend": se detuvo en Fase 0 por la regla de AGENTS.md (no adelantar fases sin integrar la previa en `main`) y por la instrucción de esperar LX-02 para LX-06; se consulta al humano.
- Pruebas ejecutadas y resultado real: YAML válido (2 jobs, 7 pasos backend); localmente con los mismos comandos: `ruff check` OK, `ruff format --check` detectó `README.md` y se corrigió, `manage.py check` sin errores, `pytest` 112 passed / 2 skipped. **No ejecutado en GitHub** (no hay push).
- Riesgos/bloqueos: el workflow solo se validará de verdad al hacer push/PR; la protección de `main` (LX-10) la configura el humano en GitHub.
- Handoff/siguiente paso: push y PR a `main` con LX-04/05/09/17; luego decidir alcance (ver pregunta al humano).

## 2026-10-11T20:13:52-05:00: CIERRE: LX-11, LX-12, LX-17 (Fase 1 backend)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/LX-11-auth` (desde `architect-lancex` con LX-09), se publica en `backend-lancex` a pedido del humano.
- Objetivo: backend de la Fase 1: autenticación, catálogo de publicaciones y cierre de LX-17.
- Archivos/documentos modificados: `apps/core/authentication.py` (nuevo), `apps/core/models.py` (`ClockTimestamp`), `apps/audit/{models.py,services}`, `apps/accounts/{services,api}`, `apps/catalog/{models.py,services,api}`, `apps/auctions/services/listing_guard.py`, `config/{settings/base.py,api_v1.py}`, `tests/{accounts,catalog}`, `tests/security/endpoint_matrix.yaml`, `pyproject.toml`; `CONTRATO-API-INICIAL.md`, handoffs FE y BD, estado compartido.
- Decisiones/supuestos:
  - CSRF obligatorio también en peticiones anónimas mutables (login CSRF, T13).
  - Bloqueo de login por hash del email (también inexistentes) → 429 `RATE_LIMITED`, sin revelar si la cuenta existe; cuenta suspendida con contraseña correcta → 403 `ACCOUNT_SUSPENDED`.
  - Cambio de contraseña con step-up (`STEP_UP_FAILED`), mantiene la sesión actual con clave nueva y revoca las demás.
  - Publicación no editable con subasta `draft|scheduled|active` (se siguió `ROLES-Y-PERMISOS.md` §4; el contrato decía "subasta publicada": **pendiente de confirmar** si `draft` debe bloquear). Código nuevo `LISTING_LOCKED`.
  - `GET /listings/{id}/` solo para el dueño; los demás reciben 404 (IDOR, T05). Staff no tiene `listing.manage_own` → 403.
  - Consulta a `auction` por SQL parametrizado hasta que LX-06 traiga el modelo.
- Pruebas ejecutadas y resultado real: `manage.py check` sin errores; `ruff check` y `ruff format --check` limpios; `pytest`: **147 passed, 15 skipped** (las 15 son `django_db` y requieren PostgreSQL local con el SQL de LX-02, que aún no existe: **no ejecutadas**).
- Riesgos/bloqueos: flujo real de registro/login/publicaciones no probado contra base; deriva posible hasta LX-02/LX-06; Fase 2+ no se inicia hasta integrar Fase 1 en `main` (AGENTS.md).
- Handoff/siguiente paso: handoffs a FE y BD registrados. PR `backend-lancex` → `main`.

## 2026-10-11T20:47:05-05:00: CIERRE: LX-05 verificación real en Firestore
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/LX-11-auth`, sin cambios de código.
- Objetivo: comprobar que un WARNING llega a Firestore sin datos sensibles.
- Archivos/documentos modificados: ninguno versionado. Fuera del repo: credencial movida a `~/.lancex/firebase-sa.json` (sin abrirla); `backend/.env` creado (ignorado por Git) con proyecto `lancex-d82d4`, `DEV_NAME=nicolay`, `DJANGO_SECRET_KEY` aleatoria y `DATABASE_URL` provisional.
- Decisiones/supuestos: el humano creó la base Firestore `(default)` en modo producción y publicó las reglas que niegan clientes.
- Pruebas ejecutadas y resultado real: 1.º intento `emit_test_log` → `NotFound: The database (default) does not exist` (la app no falló: lote descartado, QA-04). 2.º intento tras crear la base → documento `request_id=32f350a9940441d2bf35bba13d56ab5e` leído de vuelta con el Admin SDK: contiene level, event, dev, env, request_id, path, error_code, ts y expire_at (+30 días); **no** contiene la contraseña, `max_amount` ni el correo de prueba (mensaje con `[REDACTED]`).
- Riesgos/bloqueos: política TTL sobre `expire_at` pendiente de crear en la consola; `DATABASE_URL` real pendiente de BD.
- Handoff/siguiente paso: los otros dos integrantes generan su propia clave con los mismos pasos. Esperar LX-02 para la Fase 2.

## 2026-10-11T21:02:57-05:00: CIERRE: LX-02 y LX-03 (borrador para BD) + pruebas de esquema
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/LX-11-auth` → `backend-lancex`.
- Objetivo: desbloquear las pruebas de base de datos escribiendo la migración base y el Postgres local (a pedido del humano; la revisión y el `db push` siguen siendo del rol BD).
- Archivos/documentos modificados: `supabase/migrations/20261011180000_baseline_lancex.sql`, `scripts/db/*`, `backend/tests/db/test_schema_guarantees.py`, `backend/tests/accounts/test_auth_api.py`, `backend/config/settings/test.py`, `backend/.env.example`, `.github/workflows/ci.yml`, ADR-0007, `decisiones/README.md`, `GESTION-DEL-ESQUEMA.md`, `MODELO-DE-DATOS-INICIAL.md`, handoff BD, estado compartido. Fuera de Git: `backend/.env` (`DATABASE_URL` con usuario `lancex_app.<ref>` y contraseña pendiente; `TEST_DATABASE_URL` como `lancex_app`).
- Decisiones/supuestos: RLS con política solo para `lancex_app` (ADR-0007), porque sin política RLS bloquea a Django. El rol `lancex_app` se crea sin contraseña (se fija fuera de Git). Postgres 17 local y en CI (confirmar la versión del proyecto). Restricciones adicionales listadas en `MODELO-DE-DATOS-INICIAL.md`.
- Pruebas ejecutadas y resultado real: `apply_local.sh` y `apply_local.ps1` aplican sin errores (20 tablas, RLS en 20); `LANCEX_REQUIRE_DB=1 pytest`: **182 passed** (incluye las antes omitidas de auth y catálogo, deriva modelo↔SQL, sin DDL para `lancex_app`, `audit_event` append-only, `bid` sin DELETE, matriz de mecanismos, sin grants a `anon`/`authenticated`). Un fallo intermedio era de la propia prueba (faltaba `format="json"`), corregido.
- Riesgos/bloqueos: no aplicado en Supabase (lo hace BD); `supabase init` pendiente; contraseña de `lancex_app` pendiente.
- Handoff/siguiente paso: handoff BD con los comandos exactos. Fase 2 tras integrar Fase 1 en `main`.

## 2026-10-11T21:48:54-05:00: CIERRE: Fase 2 backend (LX-20 a LX-24)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/LX-20-ascending` (desde `main` con la Fase 1) → `backend-lancex`.
- Objetivo: núcleo ascendente con cierre fijo según ADR-0005 y REGLAS §1, §2, §9, §10.
- Archivos/documentos modificados: `apps/auctions/domain/{money,errors,state,registry}.py`, `domain/mechanisms/{base,ascending}.py`, `domain/closing/fixed.py`; `apps/auctions/models.py` (`Auction`, `Bid`, `JobHeartbeat`); `apps/auctions/services/{snapshot,lifecycle,bidding,closing,queries,listing_guard}.py`; `apps/auctions/api/{presenters,serializers,views,urls}.py`; comando `close_due_auctions`; `config/api_v1.py`; `tests/auctions/*`; `endpoint_matrix.yaml`; contrato (`LISTING_HAS_OPEN_AUCTION`); handoffs FE y BD; estado compartido. Además, guía y script `push_supabase.ps1` para que BD aplique la migración (rama `docs/db/aplicar-migraciones`).
- Decisiones/supuestos:
  - Solo `ascending` + `fixed` en esta fase; las demás combinaciones válidas responden "todavía no disponible" (registro de Strategy listo para enchufarlas).
  - `TimeSource.db_now()` = `clock_timestamp()` tras el `FOR UPDATE`; el ETag de `live/` incluye versión, estado efectivo y si el espectador lidera (el estado cambia con el reloj sin tocar `version`).
  - `rules_snapshot` no copia el importe de la reserva (solo `has_reserve`).
  - Al cerrar con `awarded`, `settlement_status = pending`.
  - `ending_soon` = activas que terminan en la próxima hora (supuesto, no estaba definido).
  - Moderadores/admin ven identidades en el historial (`moderation.view_auction_internals`); el dueño, solo tras el cierre.
  - `GET /result/` de una subasta aún abierta responde 200 con `outcome: null` (el contrato no lo definía).
- Pruebas ejecutadas y resultado real: `ruff` limpio; `manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 pytest`: **282 passed** (dominio, flujo, no fuga de `reserve_price` en detalle/live/bids/result/catálogo, seudónimos, ETag 304, QA-01 20 pujas paralelas, QA-08 idempotencia paralela, 3 cierres simultáneos → un solo `auction_closed`). `close_due_auctions` contra la base local: "Subastas cerradas: 0" y heartbeat `nicolay`.
- Riesgos/bloqueos: Supabase aún sin la migración (BD); sin pruebas de carga (QA-05, Fase 7).
- Handoff/siguiente paso: FE (LX-27..29) y BD (LX-25/26). Fase 3 tras integrar la Fase 2 en `main`.

## 2026-10-11T22:27:02-05:00: CIERRE: Fase 3 backend (LX-31, LX-32, LX-33, LX-37)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/fase-3` (desde `main` con la Fase 2) → `backend-lancex`.
- Objetivo: proxy bidding, soft close, notificaciones/seguimiento y reportes.
- Archivos/documentos modificados: dominio `proxy.py`, `closing/soft_close.py`, `state.py`, `registry.py`, `mechanisms/ascending.py`; modelos `ProxyBidLimit`, `Notification`, `Watchlist`, `Report` (nueva app `apps/moderation`, en `INSTALLED_APPS`); servicios `bidding.py` (motor común manual/proxy), `closing.py` (notificaciones + `notify_watchers`), `lifecycle.py` (soft close + aviso de cancelación), `snapshot.py`; `notifications/services`, `moderation/services`; vistas `proxy-limit`, `watch`, `notifications`, `reports`; pruebas `test_domain_proxy_soft_close.py`, `test_phase3_flow.py`; matriz de endpoints; contrato; REGLAS §2; README del backend; handoffs FE y BD; estado compartido.
- Decisiones/supuestos:
  - Ganador ascendente = última puja válida (mayor importe, empate -> seq mayor) para que el empate de proxy `Cc = M_L` lo gane el líder, como dice §3; antes la prueba asumía seq menor. Documentado en REGLAS §2.
  - El líder que sube su techo no genera pujas ni cambia `version`. La auditoría de límites (`proxy_limit_set/raised`) no incluye el importe.
  - Proxy y puja manual comparten un único motor transaccional; el soft close se evalúa una vez por operación con la hora de PostgreSQL.
  - Notificaciones con lista blanca de claves en `data` (nunca máximos). Los avisos del job (`watch_auction_started/ending`) se insertan con `NOT EXISTS`; en una carrera exacta entre backends podría duplicarse un aviso informativo (aceptado).
  - Reportes: listing reportable solo si tiene alguna subasta publicada; 404 si no; staff no usa `/reports/`. Código nuevo `ALREADY_REPORTED`; `PROXY_NOT_ENABLED` para proxy en subasta sin proxy.
  - Nueva app `moderation` (ADR-0005 no la listaba): agrupa reportes y la futura moderación (LX-77).
- Pruebas ejecutadas y resultado real: `ruff check` y `format --check` limpios; `manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 pytest`: **329 passed** (casos obligatorios de §3, soft close con tope, no fuga del máximo proxy en detalle/live/bids/result/proxy-limit ajeno/auditoría/notificaciones, notificaciones outbid/won/lost/owner/cancelled/watch, reportes con límites, 8 proxies en paralelo con un solo límite vivo).
- Riesgos/bloqueos: Supabase aún sin migración aplicada (BD). `watch_auction_ending` depende de que alguien ejecute `close_due_auctions --loop`.
- Handoff/siguiente paso: FE (LX-35, LX-38) y BD (LX-34). Fase 4 tras integrar la Fase 3 en `main`.

## 2026-10-12T19:55:50-05:00: CIERRE: Fase 4 backend (LX-40)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/fase-4` (desde `main` con la Fase 3) → `backend-lancex`.
- Objetivo: sobre cerrado de primer precio según REGLAS §6 y la matriz de visibilidad.
- Archivos/documentos modificados: `domain/mechanisms/sealed.py`, `domain/registry.py`; modelo `SealedOffer`; servicios `sealed.py`, `closing.py` (registros por mecanismo + revelación), `lifecycle.py` (cancelación con `active_offer_count`); `api/presenters.py` (`_counters` como única fuente de precio/contadores, ranking por audiencia), `api/views.py` (`SealedOfferView`, `/bids/` sellado), `api/serializers.py` (`min_increment` opcional, `SealedOfferInput`), `api/urls.py`; pruebas `test_domain_sealed.py`, `test_sealed_flow.py`, concurrencia; matriz de endpoints; contrato (`MECHANISM_MISMATCH`); handoffs FE y BD; estado compartido.
- Decisiones/supuestos:
  - Canal lateral: `version` solo cambia si cambia `active_offer_count` (editar no altera el ETag).
  - `reserve_met` en `null` antes del cierre en sellado (revelaría si alguna oferta supera la reserva).
  - Revelación solo al MATERIALIZAR el cierre; con `result_pending` aún no se muestra nada.
  - `bid_count` es el contador interno de versiones (para `seq`); nunca se publica en sellado.
  - Ranking: participantes (incluidos quienes retiraron su oferta) con seudónimos; dueño y staff con identidad; público solo precio final y número de ofertas.
  - Auditoría `sealed_offer_*` sin importes; `sealed_offers_revealed` con número de ofertas.
- Pruebas ejecutadas y resultado real: ruff limpio; manage.py check sin errores; LANCEX_REQUIRE_DB=1 pytest: 355 passed (incluye no fuga de importes sellados en detalle/live/bids/result/catálogo/auditoría para público, otro participante, dueño y admin; ETag sin cambios al editar; ranking por audiencia; empate por seq vigente; 5 ofertas simultáneas -> 1 vigente).
- Riesgos/bloqueos: verificación de la base Supabase pendiente de la contraseña de `lancex_app` (la compañera ya aplicó las tablas, según el humano).
- Handoff/siguiente paso: FE (LX-42), BD (LX-41/43). Fase 5 tras integrar la Fase 4 en `main`.

## 2026-10-12T20:13:16-05:00: CIERRE: Fase 5 backend (LX-50, LX-51, LX-54)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/fase-5` (desde `main` con la Fase 4) → `backend-lancex`.
- Autorización: el humano pidió "Ahora sí continúa con las demás fases" tras integrar la Fase 4. Se interpreta como autorización explícita para encadenar las Fases 5, 6 y 7 sin esperar el merge de cada una (excepción a la regla de AGENTS.md, registrada aquí). Cada fase va en su propio commit con pruebas completas.
- Objetivo: organizaciones B2B, necesidades, inscripción/calificación y subasta inversa según REGLAS §7, §8 y §15.
- Archivos/documentos modificados: dominio `mechanisms/reverse.py`, `money.py` (precio unitario de 4 decimales, envío ≥ 0, `reverse_total`), `state.py`, `registry.py`, `proxy.py` (argumentos con nombre); `core/permissions.py` (`HasAnyOrgCapability`); `organizations/services` y `api`; `catalog` (`ProcurementRequest`, servicio y API); `auctions` (`AuctionParticipant`, FK `procurement_request` y `Bid.organization`, `visible_to` con miembros de la organización dueña, `services/participants.py`, inversa en `lifecycle`, `bidding`, `closing`, `snapshot`, presenters y vistas); `audit` (`organization_updated`); pruebas `test_domain_reverse.py`, `test_reverse_flow.py`; matriz; contrato; REGLAS §12; handoffs; estado compartido.
- Decisiones/supuestos:
  - Verificación de organizaciones por moderador adelantada de LX-77: sin ella la Fase 5 no es usable.
  - Endpoints de organización con `HasAnyOrgCapability`: quien no es miembro recibe 404 desde el servicio (sin enumeración).
  - Cualquier miembro activo de la compradora gestiona la subasta inversa (ROLES §4); el dueño es quien la creó.
  - El proveedor que pertenece a varias organizaciones admitidas debe indicar `organization_id` en la oferta.
  - Congelamiento en `starts_at`: el estado efectivo se calcula al leer (`rejected`/`not_reviewed`) y el job lo materializa.
  - Seudónimos por organización ("Proveedor N"); el desglose (precio unitario, envío) solo para la propia organización; la compradora ve identidades al cerrar.
  - Acción de auditoría nueva `organization_updated` (no estaba en el catálogo).
- Pruebas ejecutadas y resultado real: ruff limpio; `manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 pytest`: **392 passed** (fórmula con ROUND_HALF_UP, `OFFER_ABOVE_MAXIMUM` con máximo exacto aceptado, `ALREADY_LEADING` por organización, `NOT_ADMITTED`, compradora no oferta, `CONFLICT_OF_INTEREST`, `LAST_OWNER`, step-up, vuelta a `pending`, `not_reviewed`, visibilidad durante y tras el cierre, licitación desierta). Un fallo intermedio era de la prueba (nota de verificación de 2 caracteres).
- Riesgos/bloqueos: ninguno nuevo; Supabase pendiente de la contraseña de `lancex_app`.
- Handoff/siguiente paso: FE (LX-53), BD (LX-52). Fase 6 (vela).

## 2026-10-12T20:17:21-05:00: CIERRE: Fase 6 backend (LX-60, script de LX-61)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/fase-5` (continuación autorizada) → `backend-lancex`.
- Objetivo: cierre por vela verificable según REGLAS §5.
- Archivos/documentos modificados: `domain/closing/candle.py` (compromiso, instante HMAC, verificación, corte retroactivo), `state.py`, `registry.py`; `services/lifecycle.py` (semilla con `secrets` al publicar; `rules_snapshot` con compromiso, nunca la semilla), `closing.py` (`counted = false` y `candle_revealed`), `snapshot.py`; presenters (`candle_info`, `candle_proof`, precio oficial tras el corte, `counted` oculto hasta el cierre), vista `CandleProofView`, serializers; `scripts/verify_candle.py`; pruebas `test_domain_candle.py`, `test_candle_flow.py`; matriz; contrato (`NOT_REVEALED_YET`); handoffs; estado.
- Decisiones/supuestos:
  - La ventana se ancla en `original_ends_at` (fijado al publicar) para que el instante sea reproducible.
  - `counted` se publica como `null` mientras la subasta está abierta: un `false` revelaría el instante secreto.
  - Tras el cierre, el precio público es `final_price` (el del ganador dentro del corte), no la última puja.
  - La semilla se genera en el servicio; el dominio es determinista y probado sin aleatoriedad.
- Pruebas ejecutadas y resultado real: ruff limpio; `LANCEX_REQUIRE_DB=1 pytest`: **412 passed** (instante determinista y dentro de la ventana, verificación con semilla falsa, límites, no fuga de semilla/instante en API, `rules_snapshot` y auditoría para público/dueño/admin, corte retroactivo con `counted = false`, script independiente con salida 0).
- Riesgos/bloqueos: límite declarado en REGLAS §5 (quien accede a la base podría leer la semilla antes).
- Handoff/siguiente paso: FE (LX-62), BD (LX-61). Fase 7.

## 2026-10-12T20:26:42-05:00: CIERRE: Fase 7 backend (LX-70, LX-71, LX-72, LX-77, LX-79) + seed_demo y bootstrap_admin
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/fase-5` (continuación autorizada) → `backend-lancex`.
- Objetivo: cerrar el backend del contrato v1.
- Archivos/documentos modificados: `catalog/services/{storage,images}.py` (puerto `ObjectStorage` + adaptador Supabase con `httpx`), modelo `ListingImage`, vistas de imágenes; `auctions/services/post_close.py`, modelo `Rating`, vistas de liquidación y calificación, perfil público `GET /users/{id}/`; `moderation/services/staff.py` y `api/staff_views.py` (moderación y administración); comandos `bootstrap_admin` y `seed_demo`; `requirements.txt` (`httpx==0.28.1`, permitido por ADR-0004); settings `SUPABASE`; pruebas `test_images.py`, `test_post_close.py`, `test_staff.py`, `test_commands.py`; matriz de endpoints; contrato; README; configuración local; handoffs; estado.
- Decisiones/supuestos:
  - Imágenes: tipo y tamaño se validan al pedir la URL y otra vez con los metadatos REALES del objeto (HEAD); si no cumplen, el objeto se borra (T17). Si Storage falla, el detalle se sirve sin imágenes.
  - Suspensión (ROLES §7): cancela `draft/scheduled` propias (`owner_suspended`), cancela proxies activos, retira ofertas selladas vigentes en subastas abiertas (ajusta `active_offer_count`), revoca sesiones; las activas siguen.
  - Un admin no puede ser suspendido (se usa el cambio de rol); admin sí suspende moderadores.
  - Pasar a staff exige no tener membresías ni operaciones abiertas (`OPEN_ACTIVITY`).
  - `PATCH /admin/categories/{id}/` en vez de un PATCH sin id (contrato actualizado).
  - El reportante no recibe notificación al resolverse (el tipo no está en el catálogo de REGLAS §11): pendiente de decisión.
  - `seed_demo` y `bootstrap_admin` sin contraseña por defecto (la base es compartida).
- Pruebas ejecutadas y resultado real: ruff limpio; `manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 pytest`: **445 passed**; `seed_demo` sobre una base recién creada: 5 subastas (ascendente fija, proxy + soft close, sellada, vela, inversa) y 6 usuarios; segunda ejecución sin duplicados.
- Riesgos/bloqueos: Storage real no probado (sin bucket ni claves); notificación al reportante pendiente de decisión; QA-05 (desempeño) no medido.
- Handoff/siguiente paso: PR `backend-lancex` → `main`; humano: contraseña `lancex_app`, bucket `listing-images`, claves de Storage.

## 2026-10-12T23:23:03-05:00: INICIO: pendientes de Frontend + pantallas sin endpoint + cuenta y actividad
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/cuenta-y-actividad` desde `main` @ `3a43bdc` (incluye el frontend de LX-07..LX-42).
- Objetivo: resolver los 3 handoffs de Frontend (`GET /listings/`, `listing_id` en el detalle, `title` en notificaciones), cubrir las pantallas de PANTALLAS-Y-NAVEGACION sin endpoint (/panel, /mis-pujas, perfil público con subastas, panel de organización, inscripciones) y lo pedido por el humano (perfil configurable, registro de actividad, sesiones, resumen de operaciones).

## 2026-10-12T23:30:01-05:00: CIERRE: pendientes de Frontend + cuenta y actividad
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/cuenta-y-actividad` (desde `main` @ `3a43bdc`) → `backend-lancex`.
- Objetivo: ver INICIO de esta tarea.
- Archivos/documentos modificados: `supabase/migrations/20261012230000_perfil_usuario.sql` (nueva); `accounts` (modelo `bio`/`location_city`, validación, servicios de perfil y sesiones, vistas `SessionsView`, `RevokeOtherSessionsView`, perfil público ampliado); `auctions/services/{my_activity,queries,bidding,closing,lifecycle,participants,post_close}.py`; `auctions/api/{me_views,presenters,views,urls}.py`; `catalog` (`GET /listings/`, `listing_overview`, `first_images`); pruebas `test_account_and_activity.py`; matriz; contrato; modelo de datos; handoffs Backend (cerrado), Frontend y BD; estado compartido.
- Decisiones/supuestos:
  - "Saldo": LANCEX no procesa pagos ni custodia dinero (REGLAS §10, VISION). Se implementa un resumen INFORMATIVO de operaciones con aviso explícito; un monedero real requeriría una ADR nueva y cambio de alcance (pendiente de decisión humana).
  - `listing_id` público en el detalle (dato no sensible; la publicación ya es pública por la subasta).
  - Registro de actividad desde `audit_event` con lista blanca de claves por acción (no expone datos de terceros).
  - Sesiones: id derivado por hash; la clave de sesión nunca sale.
  - `?organization=` solo para miembros (404 al resto); `?seller=` nunca muestra borradores.
  - `watchers_count` solo para dueño/staff.
- Pruebas ejecutadas y resultado real: backend `ruff` limpio, `check` sin errores, `LANCEX_REQUIRE_DB=1 pytest` **458 passed**; frontend `typecheck` y `lint` sin errores, `vitest` **140 passed**; humo real con Vite (`:5173`) + Django (`:8000`) sobre `lancex_dev` con `seed_demo`: SPA 200, catálogo con 5 modalidades por el proxy, login sin CSRF -> `CSRF_FAILED`, con CSRF -> 200, `GET /listings/`, `listing_id`, `PATCH /auth/me/` (bio/ciudad), `/me/summary/`, `/me/activity/`, `/auth/sessions/` correctos.
- Riesgos/bloqueos: hasta aplicar la migración nueva en Supabase, el backend contra Supabase falla al leer usuarios (handoff BD bloqueante). Storage sin configurar (imágenes 503).
- Handoff/siguiente paso: BD aplica la migración; FE conecta las pantallas nuevas.

## 2026-10-12T23:55:03-05:00: CIERRE: análisis de flujos por rol y cierre de huecos de API
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/cuenta-y-actividad` → `backend-lancex`.
- Objetivo: el humano pidió analizar todos los flujos por rol. Se cruzaron las 8 secciones de PANTALLAS-Y-NAVEGACION.md con los 61 endpoints del URLConf y las rutas del frontend.
- Hallazgos y resolución (11): (1) resultado sin ganador seudonimizado; (2) necesidad pública sin subasta ni admitidos; (3) sin estado "puede calificar"; (4) miembros de la compradora (no creadores) sin contacto del ganador; (5) panel de organización sin inscripciones pendientes; (6) sin listado de necesidades por organización; (7) sin oportunidades filtradas por conflicto de interés; (8) sin total oficial antes de ofertar; (9) verificación sin miembros; (10) bandeja sin subastas reportadas; (11) el reportante no recibía aviso aunque FUNCIONAMIENTO-DEL-SISTEMA.md lo exige (cierra la decisión que quedó pendiente). Además, aviso a owners al verificar/rechazar su organización.
- Archivos/documentos modificados: presenters (resultado), `catalog/services/procurement.py` y vistas, `auctions/services/participants.py` (`pending_counts`, `opportunities`), `auctions/api/{views,me_views,urls}.py` (`ReverseQuoteView`, `OrganizationOpportunitiesView`), `organizations/services` y vistas (detalle de verificación, aviso a owners), `moderation/services/staff.py`, `notifications/services` (3 tipos), modelo `AuctionParticipant.related_name`; pruebas `test_role_flows.py`; matriz; contrato; REGLAS §11; handoff Frontend; estado.
- Pruebas ejecutadas y resultado real: ruff limpio; `check` sin errores; `LANCEX_REQUIRE_DB=1 pytest` **466 passed**; backend reiniciado y verificado por el proxy de Vite (SPA 200, endpoint nuevo responde).
- Riesgos/bloqueos: siguen pendientes la migración de perfil en Supabase (BD) y Storage.
- Handoff/siguiente paso: Frontend conecta las pantallas listadas en su handoff.

## 2026-10-12T23:59:12-05:00 (2026-10-13T04:59:12Z): INICIO: auditoría funcional integral del backend
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/cuenta-y-actividad` @ `5759fa6` (sin cambio de rama; sin commit ni push hasta autorización, por instrucción de la misión).
- Objetivo: fase cero de inspección + informe `documentacion/05-calidad/AUDITORIA-FUNCIONAL-BACKEND.md`; luego lotes acotados L1 (D1, D6) y L2 (D2–D5) con pruebas y matriz de trazabilidad.
- Inspección: sin TODO/stubs; sin secretos versionados ni `.env` en el historial; rutas que consume el frontend = existentes; `npm audit --omit=dev` 0 vulnerabilidades; `pip-audit` no disponible; línea base `pytest` 466 passed.

## 2026-10-13T00:03:04-05:00 (2026-10-13T05:03:04Z): CIERRE: auditoría funcional integral del backend (bloques L1–L3)
- Humano responsable: Nicolay.
- Herramienta/modelo IA: Claude (claude-opus-5-5).
- Rama y commit: `feat/architect/cuenta-y-actividad` @ `5759fa6`; cambios **sin commit ni push** (la misión lo exige sin autorización).
- Objetivo: auditar el backend de punta a punta y corregir brechas acotadas con pruebas.
- Archivos/documentos modificados: `apps/auctions/services/{lifecycle,queries}.py` (D1, D3), `apps/moderation/services/staff.py` y `api/staff_views.py` (D2), `apps/catalog/services/images.py` (D4), `apps/accounts/services/__init__.py` y `apps/audit/services/__init__.py` (D5); pruebas nuevas `tests/auctions/test_audit_fixes.py`, `tests/security/test_role_sweep.py`; `tests/security/endpoint_matrix.yaml` (`object_level_for`); documentos nuevos `05-calidad/AUDITORIA-FUNCIONAL-BACKEND.md`, `05-calidad/MATRIZ-DE-TRAZABILIDAD.md`; actualizados contrato, REGLAS §12, handoffs Frontend y BD, estado compartido. Un archivo vacío creado por error fuera del repo (`c:/A_Universidad/Securitytmp_placeholder.txt`) se eliminó en el acto.
- Decisiones/supuestos: inversa rechaza edición de textos (el texto es de la necesidad); moderador ve sellados solo tras revelar; borrado de imagen valida Storage antes de tocar la base (si falla el borrado remoto tras el commit queda un objeto huérfano en bucket privado, registrado como WARNING); auditoría de perfil con nombres de campo sin valores; no se implementan recuperación de contraseña ni cambio de email (sin proveedor de correo: decisión humana).
- Pruebas ejecutadas y resultado real: las 5 regresiones D1–D5 **fallaron antes** de corregir y pasan después; `ruff check .` y `ruff format --check .` limpios; `manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 pytest` **655 passed**; `npm audit --omit=dev` (frontend) 0 vulnerabilidades; `pip-audit` no disponible (no verificado).
- Riesgos/bloqueos: R1 migración de perfil en Supabase; Storage sin configurar; QA-05 sin medir.
- Handoff/siguiente paso: autorización humana para commit/push; decisiones sobre correo y autodesactivación.

## 2026-10-13T00:23:50-05:00 (2026-10-13T05:23:50Z): DECISIÓN: recuperación de contraseña sin proveedor
- Humano responsable: Nicolay.
- Decisión: posponer la recuperación de contraseña y el cambio de email; no se integra proveedor de correo por ahora (riesgo aceptado, SEGURIDAD §7). El humano autorizó el commit de la auditoría (no se pidió push).
