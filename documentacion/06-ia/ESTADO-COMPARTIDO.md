# Estado compartido de LANCEX

**Responsable de integración:** rol de arquitectura. Cualquier integrante puede proponer cambios; se revisan con el equipo.

## Estado actual

- **Fase:** definición cerrada; siguiente paso Fase 0 de `PLAN-DE-DESARROLLO.md`.
- Frontend: no inicializado (LX-07).
- Backend: inicializado en `architect-lancex` (LX-04, LX-05, LX-17 base): settings por entorno, `apps/core` (TimeSource, request_id, errores, logging Firestore, capacidades, DenyAll/HasCapability, check `lancex.E001`, StrictInputMixin) y modelos `User`, `UserSession`, `Organization`, `OrganizationMembership` (`managed = False`). Pendiente de PR a `main`.
- Esquema: migración base escrita y probada en local (`supabase/migrations/20261011180000_baseline_lancex.sql`); pendiente revisión de BD y `supabase db push` al proyecto `sikzfznkirzpjpqsjfsd`.
- API: contrato v1 aprobado; OpenAPI se generará con drf-spectacular.
- CI: pendiente (LX-09).
- Proyecto Supabase `lancex` creado (ref `sikzfznkirzpjpqsjfsd`, pooler de sesión `aws-1-us-west-2`). Firebase `lancex-d82d4` con Firestore y logs verificados (LX-05).

## Decisiones vigentes

1. Monolito modular Django; sin microservicios (ADR-0001).
2. Logs técnicos en Firestore; auditoría en PostgreSQL; sin Firebase Analytics (ADR-0002).
3. Esquema en SQL con Supabase CLI; **sin migraciones de Django**; modelos `managed = False`; rol `lancex_app` sin DDL (ADR-0003).
4. Frontend y backend en local; una base Supabase compartida; hora de PostgreSQL; sesión de Django + CSRF vía proxy de Vite; polling con versión; imágenes en Supabase Storage (ADR-0004).
5. Motor de subastas con Strategy por mecanismo, máquina de estados, `FOR UPDATE` por subasta y cierre perezoso idempotente (ADR-0005).
6. Reglas de todas las modalidades aprobadas (`REGLAS-DE-SUBASTAS.md`).
7. Roles `visitor`, `user`, `moderator`, `admin` + roles de organización; autorización por capacidades en el servidor; cada rol carga solo su interfaz (ADR-0006, `ROLES-Y-PERMISOS.md`).
8. Ramas de rol se conservan; tareas en ramas cortas `feat/<rol>/LX-xx-tema`; integración frecuente a `main`.

## Dependencias entre roles

- Frontend puede empezar ya con el contrato y mocks; necesita backend real desde LX-11.
- Backend necesita la migración base aplicada (LX-02) para las pruebas de integración; el dominio puro puede empezar antes.
- BD no depende de nadie para LX-01 a LX-03.

## Pendiente de decisión humana

- Asignar nombres concretos a los roles ARQ, BD y FE.
- Fechas de cada fase según el calendario de la materia.
- Confirmar con el docente si exige algún entregable adicional (vistas 4+1, informe, video).

## Riesgos abiertos

| Riesgo | Mitigación |
|---|---|
| `search_path` vía pooler no aplica `OPTIONS` | `ALTER ROLE lancex_app SET search_path` en la migración base; verificar con `SHOW search_path` |
| Cuota gratuita de Firestore | Solo `WARNING+` y eventos seleccionados; desactivado en pruebas |
| Proyecto Supabase pausado antes de una demo | Ensayo el día previo; reanudar desde el dashboard |
| Deriva modelos ↔ SQL | Prueba de deriva en CI |
| Latencia a Supabase | `live/` liviano, índices, sin N+1 |

## Registro de cambios compartidos

Formato: `YYYY-MM-DDTHH:mm:ss-05:00`: decisión/avance, issue/PR, impacto en roles, siguiente acción.

- `2026-10-11T13:16:54-05:00`: definición completa del proyecto (ADR-0001 a ADR-0005, reglas, modelo, contrato API, calidad, plan). Sin issue/PR aún (cambios en copia local de `main`). Impacto: todos los roles pueden iniciar Fase 0. Siguiente acción: revisar en equipo, subir en rama `docs/architect/definicion-completa` y abrir PR.
- `2026-10-11T13:39:46-05:00`: roles y permisos, pantallas por rol, funcionamiento del sistema, modelo de amenazas y ADR-0006; reglas nuevas (cuentas, límites, reportes, conflictos de interés, relanzamiento); tablas `report`, `django_cache`, `job_heartbeat`; `platform_role` reemplaza a `is_staff`. Sin PR aún. Impacto: todos los roles (nuevas tareas LX-17 a LX-19, LX-37, LX-38, LX-77 a LX-80). Siguiente acción: revisión en equipo.
- `2026-10-11T19:42:04-05:00`: backend inicializado (LX-04, LX-05, LX-17 base) en `architect-lancex`, sin PR aún. Impacto: BD debe crear en la migración base las columnas que usan los modelos (ver handoff de BD); backend puede construir servicios y vistas sobre `apps/core`; frontend sin cambios de contrato. Siguiente acción: PR a `main`, luego LX-06 al recibir LX-02.
- `2026-10-11T20:13:52-05:00`: backend Fase 1 (LX-11 auth, LX-12 categorías/publicaciones, LX-17 completo para Fase 1) en `backend-lancex`; CI (LX-09) en `architect-lancex` pendiente de PR. Contrato: códigos `LISTING_LOCKED`, 405/406/415 y 429 por bloqueo de login. Impacto: FE puede integrar auth y publicaciones; BD debe cubrir `audit_event`, `category`, `listing` en LX-02. Siguiente acción: PR `backend-lancex` → `main`; Fase 2 tras integrar.
- `2026-10-11T21:02:57-05:00`: LX-02/LX-03 escritos por ARQ (borrador para BD) y probados en Postgres 17 local; ADR-0007 (RLS con política para `lancex_app`); pruebas como `lancex_app`: 182 passed. Impacto: BD revisa y aplica; todos pueden correr las pruebas de BD en local. Siguiente acción: PR `backend-lancex` → `main`, `supabase db push`, contraseña de `lancex_app`.
- `2026-10-11T21:48:54-05:00`: Fase 2 backend (LX-20 a LX-24): dominio ascendente + cierre fijo, ciclo de vida, `place_bid` con `FOR UPDATE` e idempotencia, cierre idempotente con `SKIP LOCKED` + `close_due_auctions --loop`, catálogo/detalle/live/historial/resultado por audiencia. 282 pruebas en verde contra Postgres local (incluye QA-01, QA-08, cierre triple). Impacto: FE puede construir LX-27..29; BD amplía LX-25/26. Siguiente acción: PR `backend-lancex` -> `main`; Fase 3 (proxy, soft close, notificaciones).
- `2026-10-11T22:27:02-05:00`: Fase 3 backend (LX-31 proxy como decorador, LX-32 soft close, LX-33 notificaciones + watchlist + avisos del job, LX-37 reportes en la nueva app `moderation`). Aclaración en REGLAS §2: empate de importes -> gana el seq mayor (empate de proxy). 329 pruebas en verde contra Postgres local. Impacto: FE LX-35/38; BD LX-34. Siguiente acción: PR `backend-lancex` -> `main`; Fase 4 (sobre cerrado).
- `2026-10-12T19:55:50-05:00`: Fase 4 backend (LX-40 sobre cerrado): `SealedFirstPrice`, ofertas con versión vigente, retiro, revelación automática al cierre, ranking por audiencia y ocultamiento de precio/contadores/`reserve_met` antes del cierre. Pruebas: ruff limpio; manage.py check sin errores; LANCEX_REQUIRE_DB=1 pytest: 355 passed (incluye no fuga de importes sellados en detalle/live/bids/result/catálogo/auditoría para público, otro participante, dueño y admin; ETag sin cambios al editar; ranking por audiencia; empate por seq vigente; 5 ofertas simultáneas -> 1 vigente). Impacto: FE LX-42; BD LX-41/43. Siguiente acción: PR `backend-lancex` -> `main`; Fase 5 (organizaciones e inversa B2B).
- `2026-10-12T20:13:16-05:00`: Fase 5 backend (LX-50 organizaciones, LX-51 necesidades + inscripción + calificación + inversa, LX-54 autorización por membresía) + verificación de organizaciones por moderador (adelanto de LX-77). 392 pruebas en verde contra Postgres local. El humano autorizó encadenar las Fases 5, 6 y 7 sin esperar el merge de cada una. Impacto: FE LX-53; BD LX-52. Siguiente acción: Fase 6 (vela).
