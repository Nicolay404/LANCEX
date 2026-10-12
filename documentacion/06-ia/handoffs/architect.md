# Handoff: Arquitectura / backend

## Pendiente inicial

- Revisar con el equipo ADR-0001 a ADR-0005 y asignar responsables a ARQ, BD y FE.
- LX-04: inicializar Django con `MIGRATION_MODULES`, `TimeSource`, `request_id` y formato de errores.
- LX-05: logging a Firestore con `QueueHandler` y `SensitiveDataFilter`.
- LX-06: modelos `managed = False` para todas las tablas + prueba de deriva (en cuanto BD entregue LX-02).
- LX-09: CI con Postgres de servicio y SQL aplicado.
- Mantener `ESTADO-COMPARTIDO.md` tras cada integración.

## Handoffs activos

- Fecha/hora: 2026-10-11T19:42:04-05:00
- Issue/PR: LX-04, LX-05, LX-17 (rama `architect-lancex`)
- Para rol: Arquitectura/backend (yo mismo, siguiente sesión) y equipo
- Estado: requiere revisión
- Contexto: backend inicializado; LX-17 tiene la base (capacidades, permisos, check, StrictInputMixin, SessionStore revocable). Falta `visible_to(user)` (llega con los modelos de subasta/publicación) y `/auth/me` (LX-11).
- Archivos, tablas o endpoints afectados: `backend/` completo; `firebase/firestore.rules`; `backend/tests/security/endpoint_matrix.yaml`.
- Acción requerida: revisión humana; PR a `main`; LX-06 cuando BD entregue LX-02; LX-09 (CI con `LANCEX_REQUIRE_DB=1`).
- Cómo validar: `cd backend && python manage.py check && python -m pytest && ruff check .`

## Plantilla

- Fecha/hora:
- Issue/PR:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto:
- Archivos, tablas o endpoints afectados:
- Acción requerida:
- Cómo validar:

