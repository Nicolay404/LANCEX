# Auditoría funcional integral del backend

**Fecha:** 2026-10-13T04:57:50Z (2026-10-12T23:57:50-05:00). **Auditor:** agente IA de Arquitectura (Claude, claude-opus-5-5), a pedido de Nicolay.
**Rama inspeccionada:** `feat/architect/cuenta-y-actividad` (= `main` @ `3a43bdc` + 2 commits de backend aún no integrados: `f0355a5`, `5759fa6`).
**Alcance:** backend Django completo, esquema SQL, contrato de API, integración con el frontend de `main`. Matriz requisito → código → prueba: [`MATRIZ-DE-TRAZABILIDAD.md`](MATRIZ-DE-TRAZABILIDAD.md).

> Convención: **Confirmado** = verificado leyendo el código y/o con una prueba ejecutada. **Riesgo** = posible problema sin defecto demostrado. **No verificable** = falta entorno o información.

## 1. Arquitectura identificada (verificada)

- Monolito modular Django 5.2 + DRF 3.18 (ADR-0001), capas `api → services → domain`; dominio de subastas en Python puro (`apps/auctions/domain`), comprobado por `tests/architecture` (sin imports de Django en el dominio, sin reloj local en servicios, sin `migrations/`, todos los modelos `managed = False`).
- PostgreSQL (Supabase) con esquema `lancex` gestionado por SQL (`supabase/migrations/`, 2 archivos), rol `lancex_app` sin DDL, RLS con política solo para `lancex_app` (ADR-0007). Pruebas contra PostgreSQL 17 local conectadas como `lancex_app`.
- Autenticación: sesión de Django + CSRF obligatorio también para anónimos (`CsrfSessionAuthentication`); **no hay JWT ni tokens**: las credenciales vivas son filas de `django_session`, revocables por usuario (`UserSession.user_id`).
- Autorización: `DenyAll` global + permisos declarativos por capacidad; system check `lancex.E001..E004` impide arrancar con una vista sin permiso.
- Hora de negocio: `TimeSource.db_now()` (PostgreSQL). Concurrencia: `SELECT … FOR UPDATE` por subasta, `SKIP LOCKED` en el cierre.
- Auditoría de negocio: tabla `audit_event` append-only (trigger + grants), escrita en la misma transacción. Logs técnicos: Firestore asíncrono con lista blanca (verificado en real el 2026-10-11). **No se usa Firebase Analytics** (ADR-0002).
- Sin CORS (mismo origen vía proxy de Vite), sin WebSockets (polling con ETag), sin Celery (job `close_due_auctions`).

## 2. Módulos y responsabilidad

| Módulo | Responsabilidad | Evidencia |
|---|---|---|
| `core` | errores, request_id, TimeSource, capacidades, permisos, check E001, StrictInputMixin, logging Firestore | `tests/core` (86) |
| `accounts` | usuario, sesión revocable, registro/login/logout, `me`, contraseña, sesiones, perfil público, `bootstrap_admin` | `tests/accounts` (33) |
| `organizations` | organizaciones, membresías, transferencia, verificación | `tests/auctions/test_reverse_flow.py` |
| `catalog` | categorías, publicaciones, imágenes (Storage), necesidades B2B | `tests/catalog` (23) |
| `auctions` | dominio (4 mecanismos + 3 cierres + proxy), servicios, API, job de cierre, `seed_demo` | `tests/auctions` (211) |
| `audit` | `audit_event` + `record()` | `tests/db` |
| `notifications` | notificaciones y seguimiento | `tests/auctions/test_phase3_flow.py` |
| `moderation` | reportes, moderación y administración | `tests/moderation` (11) |

## 3. Funcionalidades existentes (con evidencia)

Todas verificadas con pruebas ejecutadas el 2026-10-13: `LANCEX_REQUIRE_DB=1 pytest` → **466 passed**. Detalle por funcionalidad en la matriz de trazabilidad. Resumen:

- Cuenta: registro, login con bloqueo por cuenta, logout, `me`, edición de perfil (nombre, bio, ciudad), cambio de contraseña con step-up y revocación de otras sesiones, listado y revocación de sesiones, perfil público, registro de actividad.
- Subastas: ascendente, proxy (decorador), soft close, vela con commit-reveal verificable, sobre cerrado, inversa B2B; ciclo de vida completo; cierre idempotente concurrente; liquidación; calificaciones.
- B2B: organizaciones, miembros, verificación, necesidades, inscripción, calificación, congelamiento `not_reviewed`, oportunidades sin conflicto, cotización.
- Staff: moderación (reportes, cancelación, suspensión con efectos), administración (roles con step-up y último admin, categorías, auditoría, salud).
- Integración con el frontend de `main`: verificada en local (SPA en :5173, API por proxy, CSRF, login). Todas las rutas que hoy consume el frontend existen.

## 4. Hallazgos

### 4.1 Defectos confirmados — todos corregidos y verificados

| ID | P | Hallazgo | Evidencia | Corrección |
|---|---|---|---|---|
| D1 | **P1** | `PATCH /auctions/{id}/` con `title`/`description` en una subasta **inversa** responde 200 y audita, pero **no persiste nada** (actualiza `listing` con `pk=None`) | `lifecycle.update_auction`, líneas 201 y 217 | Rechazar con `VALIDATION_ERROR` (los textos de la inversa pertenecen a la necesidad B2B) + prueba |
| D2 | P2 | Vista de moderación de una sellada: `sealed_revealed` se calcula pero no se usa; el moderador no ve las ofertas ni tras la revelación | `moderation/services/staff.py:323` | Incluir el ranking revelado (con identidad) solo tras el cierre + prueba de no fuga antes |
| D3 | P2 | `GET /auctions/?mine=participating` ignora las ofertas selladas (solo mira `bid`); inconsistente con `/me/participations/` | `queries.catalog` | Incluir `sealed_offer` + prueba |
| D4 | P2 | Borrar una imagen sin Storage disponible: la fila se borra y el cliente recibe 503 (estado inconsistente) | `images.delete_image` | Validar disponibilidad de Storage antes de borrar; si el borrado del objeto falla después, se registra y la operación responde éxito (el objeto queda huérfano, no la fila) + prueba |
| D5 | P2 | Cambios de perfil y "cerrar otras sesiones" no quedan en la auditoría de negocio | `accounts.services` | Acciones `user_profile_updated` (solo nombres de campos) y `security_sessions_revoked` + prueba |
| D6 | **P1** | Falta la prueba de inventario de autorización por rol que SEGURIDAD §5 declara obligatoria (hoy `tests/security` solo verifica que cada ruta esté en la matriz) | `tests/security` (2 pruebas) | Barrido automático: para TODA ruta y método de la matriz, visitante → 401 donde corresponde, usuario normal → 403 en staff, staff → 403 en lo comercial |

### 4.2 Riesgos (sin defecto demostrado)

| ID | P | Riesgo | Situación / mitigación |
|---|---|---|---|
| R1 | P1 | Migración `20261012230000_perfil_usuario.sql` aún no aplicada en Supabase: el backend contra Supabase fallará al leer usuarios | Handoff BD bloqueante registrado; aplicar con `push_supabase.ps1` tras el merge |
| R2 | P2 | `notify_watchers` puede duplicar un aviso informativo si dos backends corren el job en el mismo instante | Aceptado y documentado (no afecta resultados) |
| R3 | P2 | Dependencias Python sin escaneo de vulnerabilidades (`pip-audit` no instalado) | **No verificable**. Frontend: `npm audit --omit=dev` → 0 vulnerabilidades |
| R4 | P3 | Cookies sin `Secure` (entorno local HTTP) | Correcto para el alcance local (ADR-0004); para un despliegue real: `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, HSTS |
| R5 | P3 | Supabase Storage sin configurar: imágenes responden 503 | **Bloqueado** por configuración (bucket + claves) |

### 4.3 Cuenta del usuario: clasificación (sección 5 de la misión)

| Operación | Estado | Detalle |
|---|---|---|
| Consultar perfil propio | Completo y verificado | `GET /auth/me/`; el ajeno solo expone datos públicos (`GET /users/{id}/`, sin email) |
| Editar perfil | Completo y verificado | `PATCH /auth/me/` parcial; `UNKNOWN_FIELD` ante `platform_role`, `email`, `status`… (asignación masiva bloqueada) |
| Cambiar contraseña | Completo y verificado | Hash de Django (PBKDF2), validadores, contraseña actual obligatoria (`STEP_UP_FAILED`), sesión actual rotada y demás revocadas, auditoría sin secretos. Sin confirmación doble (el contrato no la pide: la UI la compara) |
| Recuperar contraseña | **Bloqueado / decisión** | No hay proveedor de correo; SEGURIDAD §7 lo declara riesgo aceptado. Implementarlo exige un proveedor real (no se simula) → aprobación humana |
| Cambiar email / verificarlo | **Fuera de alcance aprobado** | Requiere verificación por correo (mismo bloqueo); hoy el email es inmutable desde la API |
| Avatar | P3 pendiente | Depende de Storage y de una columna nueva |
| Preferencias de notificación | P3 pendiente | No definidas en REGLAS §11 |
| Cerrar sesión / revocar | Completo y verificado | `logout`, `sessions`, `sessions/revoke-others` |
| Desactivar o eliminar la cuenta | **Decisión** | REGLAS §13: no se eliminan cuentas con historial; la autodesactivación no está definida |
| Historial de actividad | Completo y verificado | `GET /me/activity/` (lista blanca de campos) |
| Notificaciones | Completo y verificado | listar, marcar leídas |

### 4.4 Subastas (sección 6)

Verificado con pruebas para las cuatro modalidades: transiciones de estado con hora de PostgreSQL, permisos de dueño/participante/staff, mínimos e incrementos, empates (`seq`), sin ofertas → `unsold`, reserva, concurrencia (20 pujas paralelas, idempotencia paralela, 3 cierres simultáneos, 8 proxies paralelos, 5 ofertas selladas paralelas), confidencialidad de sellado (API, ETag, auditoría, notificaciones), máximos proxy nunca expuestos, cierre idempotente. En la inversa, el criterio "menor total" **es** la regla documentada (REGLAS §7) tras la calificación previa de cumplimiento; no hay evaluación multicriterio definida. Las notificaciones y la auditoría se escriben en la misma transacción que el cambio; los logs técnicos se emiten con `on_commit`.

### 4.5 Trazabilidad de eventos (sección 7)

- Esquema persistente actual de `audit_event`: `id` (identidad), `occurred_at` (`clock_timestamp()` UTC del servidor), `actor_user_id` (NULL = sistema), `action`, `entity_type`, `entity_id`, `auction_id`, `request_id` (correlación con Firestore), `data` (lista blanca, sin secretos). Inmutable (trigger + grants).
- **Resultado de la operación:** `audit_event` registra solo operaciones de negocio confirmadas; los rechazos relevantes (`bid_rejected`, `authz_denied`, `login_failed`, `unknown_field_rejected`, `csrf_failed`, `rate_limited`) van a Firestore como `WARNING` con `error_code` (ADR-0002). Decisión vigente; no se cambia.
- **Outbox:** no es necesario. Auditoría y notificaciones viven en la misma base y se escriben en la misma transacción; el único destino externo (Firestore) es deliberadamente no garantizado (QA-04).
- Catálogo: REGLAS §12, con las adiciones de este bloque (`user_profile_updated`, `security_sessions_revoked`).

## 5. Pruebas y cobertura de flujos críticos

Línea base: 466 pruebas (core 86, accounts 33, auctions 211, catalog 23, db 32, moderation 11, security 2, architecture 64, commands 4). Brecha principal: D6 (inventario por rol). Sin cobertura automatizada: Storage real, Supabase real, carga (QA-05).

## 6. Plan incremental

| Lote | Contenido | Prioridad | Dependencias | Estado |
|---|---|---|---|---|
| L1 | D1, D6 | P1 | ninguna | este bloque |
| L2 | D2, D3, D4, D5 | P2 | ninguna | este bloque |
| L3 | Matriz de trazabilidad | — | L1, L2 | este bloque |
| L4 | Aplicar migración de perfil en Supabase (R1) | P1 | merge a `main` | humano (BD) |
| L5 | Recuperación de contraseña / cambio de email | P2 | proveedor de correo + aprobación | decisión humana |
| L6 | Avatar, preferencias de notificación | P3 | Storage, definición en REGLAS | backlog |
| L7 | `pip-audit` en CI, QA-05 carga, cookies `Secure` para despliegue | P2/P3 | herramienta / despliegue | backlog |

## 7. Acciones que requieren aprobación humana

1. Recuperación de contraseña y cambio de email (requieren proveedor de correo).
2. Autodesactivación de cuenta (regla no definida).
3. Commit y push de este bloque (la misión pide no hacerlos sin autorización).

## 8. Resultado del bloque (actualizado 2026-10-13T05:03:04Z)

| ID | Estado | Verificación |
|---|---|---|
| D1 | ✅ corregido y verificado | `tests/auctions/test_audit_fixes.py::test_d1_*` (falló antes de la corrección, pasa después) |
| D2 | ✅ corregido y verificado | `test_d2_*` (sin ofertas antes del cierre; con identidad después) |
| D3 | ✅ corregido y verificado | `test_d3_*` |
| D4 | ✅ corregido y verificado | `test_d4_*` (503 sin borrar la fila) |
| D5 | ✅ corregido y verificado | `test_d5_*` (solo nombres de campos) |
| D6 | ✅ implementado y verificado | `tests/security/test_role_sweep.py`: 181 combinaciones ruta × método × actor denegadas por capacidad + 5 denegaciones por objeto con una subasta real ajena; 5 filas de la matriz marcadas `object_level_for` |

Comandos y resultados reales: `ruff check .` sin errores; `ruff format --check .` sin cambios; `python manage.py check` sin errores; `LANCEX_REQUIRE_DB=1 python -m pytest` → **655 passed** (antes 466). Pendientes sin cambio: R1 (migración en Supabase), R3 (`pip-audit`), R4, R5, L5–L7.

**Decisión (2026-10-13T05:23:50Z):** recuperación de contraseña y cambio de email pospuestos sin proveedor de correo (decisión de Nicolay). L5 queda en backlog hasta elegir proveedor mediante una ADR.
