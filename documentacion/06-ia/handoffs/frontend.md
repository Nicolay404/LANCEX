# Handoff: Frontend

## Pendiente inicial

- LX-07 y LX-08: proyecto Vite con el stack de ADR-0004, proxy `/api` y cliente `fetch` (CSRF, `Idempotency-Key`, errores tipados).
- Construir pantallas con mocks tipados según `CONTRATO-API-INICIAL.md`; no inventar campos.
- Respetar la matriz de visibilidad: nunca mostrar máximos ajenos, ofertas selladas no reveladas ni reserva.
- Cuenta regresiva basada en `server_time` y polling según ADR-0004.

## Handoffs activos

- Fecha/hora: 2026-10-11T21:48:54-05:00
- Issue/PR: LX-20..LX-24 (Fase 2, ascendente con cierre fijo; rama `backend-lancex`)
- Para rol: Frontend (LX-27, LX-28, LX-29)
- Estado: listo para consumir
- Contexto: subastas ascendentes con cierre fijo de punta a punta: crear borrador, editar, publicar, cancelar, pujar, cierre, resultado.
- Archivos, tablas o endpoints afectados: `GET|POST /auctions/`, `GET|PATCH /auctions/{id}/`, `POST /auctions/{id}/publish/`, `POST /auctions/{id}/cancel/`, `GET /auctions/{id}/live/`, `GET|POST /auctions/{id}/bids/`, `GET /auctions/{id}/result/`.
- Acción requerida: importes siempre como string (`"105.00"`); `POST /bids/` exige cabecera `Idempotency-Key` (UUID v4 nuevo por intento lógico; reintentar con la misma clave). Cuenta regresiva con `server_time`, nunca con el reloj local. Polling de `live/` con `If-None-Match` (ETag) -> `304`. `soft_close`, `candle`, `proxy_enabled=true`, `sealed` y `reverse` responden `400 VALIDATION_ERROR` "todavía no disponible" hasta su fase. Nuevo código `LISTING_HAS_OPEN_AUCTION` (409). `images` vacío hasta LX-70; `viewer.my_proxy_max` null hasta Fase 3.
- Cómo validar: `GET /api/v1/schema/` (local) y `tests/auctions/test_auction_flow.py` como ejemplos de uso.

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

