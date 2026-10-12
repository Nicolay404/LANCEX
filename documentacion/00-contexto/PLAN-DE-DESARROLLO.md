# Plan de desarrollo

Alcance: **completo** (todas las modalidades y capacidades descritas en `REGLAS-DE-SUBASTAS.md`). El orden importa: cada fase se apoya en el núcleo de la anterior. Las fechas de cada hito las fija el equipo según el calendario de la materia.

## Principio de paralelismo

- La **migración SQL base crea todas las tablas del modelo desde el día uno** (`MODELO-DE-DATOS-INICIAL.md` ya está cerrado). Así base de datos no bloquea a nadie fase a fase.
- El **contrato de API ya está fijado**: frontend construye pantallas con datos simulados (MSW o fixtures tipados) mientras backend implementa.
- Cada tarea es un issue de GitHub con el ID de esta tabla (`LX-xx`), una rama corta y un PR.

## Roles

| Rol | Abreviatura | Responsabilidad principal |
|---|---|---|
| Arquitectura / backend | ARQ | Django, dominio, servicios, API, logging, ADRs, integración |
| Base de datos | BD | SQL, roles, grants, seed, pruebas de integridad y concurrencia, apoyo backend |
| Frontend | FE | React, UX, consumo del contrato, pruebas de componentes y E2E |

Seguridad es transversal: cada fase tiene tareas `SEC` asignadas a una persona concreta.

## Fase 0: arranque (todos en paralelo)

| ID | Rol | Tarea | Hecho cuando |
|---|---|---|---|
| LX-01 | BD | Crear proyecto Supabase, invitar a los 3, `supabase init` + `link` | Los 3 ven el proyecto |
| LX-02 | BD | Migración base: esquema `lancex`, rol `lancex_app`, todas las tablas, índices, `CHECK`, grants, RLS, trigger append-only de `audit_event` | `supabase db push` aplicado y `supabase migration list` en bitácora |
| LX-03 | BD | `scripts/db/bootstrap_local.sql` y `apply_local` (sh y ps1) | Postgres local idéntico en 1 comando |
| LX-04 | ARQ | Proyecto Django: settings por entorno, `MIGRATION_MODULES`, apps vacías con estructura de ADR-0005, `TimeSource`, middleware `request_id`, formato de errores | `python manage.py check` sin errores |
| LX-05 | ARQ | Logging a Firestore con `QueueHandler`, `SensitiveDataFilter` y reglas de Firestore que niegan clientes | Un error de prueba aparece en Firestore con `dev` correcto |
| LX-06 | ARQ | Modelos `managed = False` de todas las tablas + prueba de deriva modelo ↔ SQL | Prueba de deriva en verde |
| LX-07 | FE | Proyecto Vite + TS estricto + Router + TanStack Query + Tailwind + shadcn/ui + proxy `/api` | `npm run dev` muestra layout base |
| LX-08 | FE | Cliente `fetch` propio (CSRF, `Idempotency-Key`, errores tipados) y tipos del contrato | Pruebas unitarias del cliente |
| LX-09 | ARQ | GitHub Actions: ruff + pytest con Postgres de servicio + lint/tsc/vitest/build del frontend | CI verde en `main` |
| LX-10 | Todos | Protección de `main` y plantillas de issue/PR | Push directo bloqueado |

## Fase 1: identidad y catálogo

| ID | Rol | Tarea |
|---|---|---|
| LX-11 | ARQ | Registro, login, logout, `me`, `csrf`, throttling |
| LX-12 | ARQ | Categorías, publicaciones (`listing`) CRUD con permisos de dueño |
| LX-13 | BD | Comando `seed_demo` (categorías, usuarios y publicaciones demo) |
| LX-14 | FE | Pantallas: registro, login, perfil, layout autenticado, guardas de ruta |
| LX-15 | FE | Crear/editar publicación |
| LX-16 | SEC (BD) | Pruebas de autorización por objeto en publicaciones |
| LX-17 | ARQ | Capacidades calculadas por petición, `DenyAll` + `HasCapability`, system check `lancex.E001`, `StrictInputMixin`, `visible_to(user)`, sesiones revocables (ADR-0006) |
| LX-18 | SEC (BD) | `tests/security/endpoint_matrix.yaml` + prueba de inventario de endpoints por rol (QA-09) |
| LX-19 | FE | Router dinámico desde `capabilities`, paquetes por rol con `import()`, página 404 única, logout con limpieza y recarga, selector de contexto de organización |

## Fase 2: núcleo ascendente (la fase más importante)

| ID | Rol | Tarea |
|---|---|---|
| LX-20 | ARQ | Dominio: `Ascending`, `Fixed`, `effective_status`, errores de dominio + pruebas unitarias |
| LX-21 | ARQ | Servicios: crear borrador, publicar (snapshot de reglas), cancelar |
| LX-22 | ARQ | `place_bid` transaccional con `FOR UPDATE`, `seq`, idempotencia, auditoría, `version` |
| LX-23 | ARQ | `close_auction` + `close_due_auctions --loop` con `SKIP LOCKED`; `result/` con cierre de respaldo |
| LX-24 | ARQ | Endpoints catálogo, detalle por audiencia, `live/` con ETag, historial con seudónimos |
| LX-25 | BD | Pruebas de concurrencia QA-01 y QA-08 (pujas paralelas, cierres paralelos, reintentos) |
| LX-26 | BD | Script de recálculo de resultados desde `bid` (QA-07) |
| LX-27 | FE | Catálogo con filtros, detalle con cuenta regresiva basada en `server_time`, formulario de puja, historial, polling 2 s |
| LX-28 | FE | Crear subasta ascendente (wizard: publicación → reglas → revisión → publicar) |
| LX-29 | FE | Pantalla de resultado y "Mis subastas" (como dueño / participando) |
| LX-30 | SEC (ARQ) | Pruebas QA-02 (reserva) y QA-03 (reloj) |

## Fase 3: proxy, soft close, seguimiento y notificaciones

| ID | Rol | Tarea |
|---|---|---|
| LX-31 | ARQ | `ProxyBidding` (decorador) + endpoint `proxy-limit` + casos de prueba de reglas §3 |
| LX-32 | ARQ | `SoftClose` + auditoría `auction_extended` |
| LX-33 | ARQ | Notificaciones internas + watchlist + avisos `watch_auction_ending` en el job |
| LX-34 | BD | Pruebas de invariante proxy (un solo límite vivo) bajo concurrencia |
| LX-35 | FE | UI de máximo proxy (con explicación), aviso de extensión, campana de notificaciones, seguir subasta |
| LX-36 | SEC (FE) | Revisión de que el máximo proxy no aparece en ninguna vista ajena |
| LX-37 | ARQ | Reportes de usuarios (`report`) con límites |
| LX-38 | FE | Modal "Reportar" en subasta, publicación y perfil |

## Fase 4: sobre cerrado

| ID | Rol | Tarea |
|---|---|---|
| LX-40 | ARQ | `SealedFirstPrice`, oferta vigente/editar/retirar, revelación al cierre |
| LX-41 | BD | Pruebas de empate por `seq` de versión y de no fuga antes del cierre |
| LX-42 | FE | Pantalla de oferta sellada (sin datos ajenos) y resultado con ranking |
| LX-43 | SEC (BD) | QA-02 para ofertas selladas en API, logs y auditoría |

## Fase 5: organizaciones y subasta inversa B2B

| ID | Rol | Tarea |
|---|---|---|
| LX-50 | ARQ | Organizaciones, membresías, transferencia de propiedad, conflictos de interés |
| LX-51 | ARQ | `procurement_request`, inscripción, calificación, `Reverse` con cálculo de total |
| LX-52 | BD | Pruebas de fórmula de total, admisión congelada en `starts_at`, `NOT_ADMITTED` |
| LX-53 | FE | Gestión de organización, publicar necesidad, panel del comprador (calificar), panel del proveedor (inscribirse y ofertar) |
| LX-54 | SEC (ARQ) | Autorización por membresía en todos los endpoints B2B |

## Fase 6: cierre por vela

| ID | Rol | Tarea |
|---|---|---|
| LX-60 | ARQ | `Candle`: semilla, compromiso, corte retroactivo, `candle-proof` |
| LX-61 | BD | `scripts/verify_candle.py` + prueba QA-07 de vela |
| LX-62 | FE | Indicador de fase de vela, precio provisional y pantalla de verificación |

## Fase 7: imágenes, post-cierre y cierre del proyecto

| ID | Rol | Tarea |
|---|---|---|
| LX-70 | ARQ | Imágenes con URLs firmadas de Supabase Storage |
| LX-71 | ARQ | `settlement`, calificaciones y reputación |
| LX-72 | ARQ | Endpoints de administración y consulta de auditoría |
| LX-73 | FE | Galería de imágenes, contacto post-cierre, calificar; paquete `admin` (usuarios, categorías, auditoría, salud) |
| LX-74 | FE | E2E Playwright de los recorridos principales de cada modalidad |
| LX-75 | BD | Prueba QA-05 de desempeño y QA-04 de caída de Firestore |
| LX-76 | Todos | Ensayo de demo, actualización de ADRs, estado compartido y bitácoras |
| LX-77 | ARQ | Moderación: verificación de organizaciones, resolución de reportes, cancelación, suspensión con efectos de `ROLES-Y-PERMISOS.md` §7 |
| LX-78 | FE | Paquete `moderation`: bandeja, verificación, reportes, vista de subasta, ficha de usuario |
| LX-79 | ARQ | Administración: usuarios y roles (step-up, `LAST_ADMIN`), categorías, auditoría, salud (`job_heartbeat`) |
| LX-80 | SEC (BD) | Pruebas de abuso de staff (T20) y de sesiones (T12) |

## Definition of Done por fase

- Reglas de la fase implementadas según `REGLAS-DE-SUBASTAS.md`.
- Pruebas unitarias del dominio + integración + escenario de calidad asociado en verde, con evidencia en el PR.
- Contrato API y OpenAPI sincronizados; tipos del frontend regenerados.
- Sin fugas de datos privados (pruebas QA-02 de la fase) y endpoints nuevos en `endpoint_matrix.yaml` (QA-09).
- Recorrido de la fase demostrable en el frontend.
- Documentación y bitácoras actualizadas; fase integrada en `main`.

## Guion de demostración final

1. Ascendente con proxy y soft close: dos navegadores, el proxy responde solo y la subasta se extiende.
2. Concurrencia: se ejecuta en vivo la prueba de 20 pujas paralelas.
3. Sobre cerrado: nadie ve ofertas ajenas; al cerrar, ranking revelado.
4. Inversa: calificación de proveedores y puja a la baja con fórmula de total.
5. Vela: se muestra el compromiso al publicar y, al cerrar, se verifica la semilla con el script.
6. Firestore (logs con `request_id`) junto a `audit_event` en Supabase para la misma acción.
7. Diagramas C4, ADRs y escenarios de calidad como cierre.
