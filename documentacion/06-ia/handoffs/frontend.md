# Handoff: Frontend

## Pendiente inicial

- LX-07 y LX-08: proyecto Vite con el stack de ADR-0004, proxy `/api` y cliente `fetch` (CSRF, `Idempotency-Key`, errores tipados).
- Construir pantallas con mocks tipados según `CONTRATO-API-INICIAL.md`; no inventar campos.
- Respetar la matriz de visibilidad: nunca mostrar máximos ajenos, ofertas selladas no reveladas ni reserva.
- Cuenta regresiva basada en `server_time` y polling según ADR-0004.

## Handoffs activos

- Fecha/hora: 2026-10-11T20:13:52-05:00
- Issue/PR: LX-11, LX-12 (rama `feat/architect/LX-11-auth` → `backend-lancex`)
- Para rol: Frontend
- Estado: listo para consumir (requiere la base de LX-02 para probar contra el backend real)
- Contexto: endpoints de autenticación y catálogo implementados según el contrato.
- Archivos, tablas o endpoints afectados: `GET /auth/csrf/`, `POST /auth/register/`, `POST /auth/login/`, `POST /auth/logout/`, `GET|PATCH /auth/me/`, `POST /auth/password/`, `GET /categories/`, `POST /listings/`, `GET|PATCH /listings/{id}/`.
- Acción requerida: **todo método mutable exige `X-CSRFToken`, también login y registro** (llamar antes a `/auth/csrf/`). Nuevos códigos en el contrato: `LISTING_LOCKED` (409), `METHOD_NOT_ALLOWED`, `NOT_ACCEPTABLE`, `UNSUPPORTED_MEDIA_TYPE`, y `RATE_LIMITED` (429) cuando el login queda bloqueado. `UserMe.organizations[].capabilities` viene ordenado.
- Cómo validar: con el backend en local, `GET /api/v1/schema/` devuelve el OpenAPI para `openapi-typescript`.

## Plantilla

- Fecha/hora:
- Issue/PR:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto:
- Archivos, tablas o endpoints afectados:
- Acción requerida:
- Cómo validar:

