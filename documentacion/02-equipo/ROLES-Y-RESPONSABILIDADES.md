# Roles y responsabilidades del equipo

El equipo está formado por tres personas. Cada rol tiene un responsable principal, pero no crea silos: seguridad, pruebas, revisión y documentación son compartidas. Las tareas concretas por fase están en `00-contexto/PLAN-DE-DESARROLLO.md`.

## Arquitectura / backend (ARQ)

**Rama asociada:** `architect-lancex` / `backend-lancex`

- Mantiene contexto, ADR, diagramas C4, escenarios de calidad y `ESTADO-COMPARTIDO.md`.
- Implementa Django: dominio puro (mecanismos, políticas de cierre, proxy), servicios transaccionales, API, autenticación y permisos.
- Implementa logging a Firestore, `request_id`, formato de errores y job de cierre.
- Mantiene el OpenAPI (drf-spectacular) sincronizado con el contrato.
- Facilita acuerdos entre roles antes de cambios incompatibles; no es cuello de botella: cualquiera puede proponer una ADR.

## Base de datos (BD)

**Rama asociada:** `db-lancex`

- **Dueño del esquema:** escribe y revisa las migraciones SQL de `supabase/migrations/`, roles, grants, RLS, índices y triggers.
- **Único que ejecuta `supabase db push`** contra el proyecto compartido, después del merge a `main`, y registra el resultado en su bitácora.
- Mantiene `MODELO-DE-DATOS-INICIAL.md` sincronizado con el SQL.
- Mantiene scripts de base local (`scripts/db/`), `seed_demo` y la prueba de deriva modelo ↔ SQL.
- Responsable de las pruebas de concurrencia, idempotencia, recálculo de resultados y desempeño (QA-01, QA-05, QA-07, QA-08).
- Custodia la contraseña de `postgres` y entrega la de `lancex_app` al equipo por el canal privado.
- No hace cambios manuales en la base compartida sin migración revisada.

## Frontend (FE)

**Rama asociada:** `frontend-lancex`

- Implementa flujos, componentes, formularios, estados de carga/error/cierre, accesibilidad y diseño adaptable.
- Consume solo el contrato aprobado; trabaja con mocks tipados mientras el backend avanza.
- Regenera tipos desde OpenAPI y reporta incompatibilidades por handoff.
- Responsable de los E2E con Playwright.
- No es autoridad sobre permisos, precios, máximos ni cierres.

## Seguridad transversal (SEC)

**Rama asociada:** `security-lancex`

No es una cuarta persona; cada tarea `SEC` del plan tiene un responsable concreto. Se revisa: autorización por objeto, no fuga de datos privados (API, logs, auditoría), validación de entrada, throttling, secretos, grants y RLS, reglas de Firestore y dependencias.

## Regla de revisión cruzada

El autor de un cambio no decide solo si está listo:

- Cambios de SQL: revisión de BD **y** de backend.
- Cambios de reglas de dominio: revisión de BD (datos y pruebas).
- Cambios de frontend que muestren información sensible: revisión de seguridad.
- Cambios del contrato API: revisión de frontend y backend.
