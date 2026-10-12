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
