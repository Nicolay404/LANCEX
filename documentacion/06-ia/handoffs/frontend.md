# Handoff: Frontend

## Pendiente inicial

- LX-07 y LX-08: proyecto Vite con el stack de ADR-0004, proxy `/api` y cliente `fetch` (CSRF, `Idempotency-Key`, errores tipados).
- Construir pantallas con mocks tipados según `CONTRATO-API-INICIAL.md`; no inventar campos.
- Respetar la matriz de visibilidad: nunca mostrar máximos ajenos, ofertas selladas no reveladas ni reserva.
- Cuenta regresiva basada en `server_time` y polling según ADR-0004.

## Handoffs activos

- Fecha/hora: 2026-10-12T20:13:16-05:00
- Issue/PR: LX-50, LX-51, LX-54 (Fase 5, B2B; rama `backend-lancex`)
- Para rol: Frontend (LX-53)
- Estado: listo para consumir
- Contexto: organizaciones, necesidades B2B, inscripción/calificación de proveedores y subasta inversa.
- Archivos, tablas o endpoints afectados: `POST /organizations/`, `GET|PATCH /organizations/{id}/` (incluye `members` y `my_role`), `POST /organizations/{id}/members/` (`{email}`), `DELETE /organizations/{id}/members/{user_id}/`, `POST /organizations/{id}/transfer-ownership/` (`{new_owner_user_id, password}`), `POST /procurement-requests/`, `GET /procurement-requests/{id}/`, `GET|POST /auctions/{id}/participants/` (`{organization_id, compliance: [{code, complies, comment}]}`), `POST /auctions/{id}/participants/{pid}/decision/` (`{status, reason}`), `GET /moderation/organizations/?status=pending`, `POST /moderation/organizations/{id}/decision/` (`{status, note}`, nota ≥ 3). Crear inversa: `POST /auctions/` con `mechanism: reverse`, `organization_id`, `procurement_request_id`, `reference_budget`, `min_decrement` (sin `listing_id` ni `starting_price`). Ofertar: `POST /auctions/{id}/bids/` con `{unit_price, shipping_cost}` (+ `organization_id` si el usuario está en varias admitidas) e `Idempotency-Key`.
- Acción requerida: el detalle de una inversa trae `reverse` (necesidad, presupuesto, `admitted_count`, aviso legal "no es SERCOP") y `maximum_allowed` en vez de `minimum_next_bid`. El historial usa "Proveedor N" / "Tu organización" y muestra el desglose solo de la propia organización. Resultado público: `winner_organization`. `UserMe.organizations[].capabilities` decide los menús B2B. Nuevos códigos: `RUC_ALREADY_REGISTERED`, `ALREADY_MEMBER`, `ALREADY_REGISTERED`, `PROCUREMENT_HAS_AUCTION`.
- Cómo validar: `tests/auctions/test_reverse_flow.py`.

- Fecha/hora: 2026-10-12T19:55:50-05:00
- Issue/PR: LX-40 (Fase 4, sobre cerrado; rama `backend-lancex`)
- Para rol: Frontend (LX-42)
- Estado: listo para consumir
- Contexto: subastas `sealed` (cierre `fixed`, sin `min_increment`; `starting_price` = oferta mínima).
- Archivos, tablas o endpoints afectados: `GET|PUT|DELETE /auctions/{id}/sealed-offer/` (PUT con `Idempotency-Key`, `{amount}` -> `{amount, submitted_at, active_offer_count}`, 201 / 200 en reintento; DELETE 204, 404 sin oferta vigente). En sellado, antes del cierre: `current_price`, `bid_count` y `reserve_met` llegan `null` para todos (también el dueño) y se muestra `active_offer_count`; `GET /bids/` devuelve lista vacía. Tras el cierre: `current_price` = precio final; `GET /bids/` es un ranking (`rank`, `amount`, `bidder` "Postor N"/"Tú", `is_winner`; dueño ve `bidder_identity`); `GET /result/` trae `offer_count` y `viewer.rank`. Detalle: `viewer.my_sealed_offer` (solo la propia).
- Acción requerida: pantalla de oferta sin datos ajenos; editar = reemplazar (pierde prioridad en empate, avisarlo en la UI). `POST /bids/` en sellado -> `409 MECHANISM_MISMATCH`.
- Cómo validar: `tests/auctions/test_sealed_flow.py`.

- Fecha/hora: 2026-10-11T22:27:02-05:00
- Issue/PR: LX-31, LX-32, LX-33, LX-37 (Fase 3; rama `backend-lancex`)
- Para rol: Frontend (LX-35, LX-38)
- Estado: listo para consumir
- Contexto: proxy bidding, soft close, notificaciones, seguimiento y reportes.
- Archivos, tablas o endpoints afectados: `GET|PUT /auctions/{id}/proxy-limit/` (`{max_amount}`; respuesta con `bid` —null si el líder solo sube su techo—, `auction`, `outbid_by_proxy`, `max_amount`, `status`, `is_leader`), `PUT|DELETE /auctions/{id}/watch/` (204), `GET /notifications/?unread=true`, `POST /notifications/read/` (`{ids}` o `{all: true}` -> `{updated}`), `POST /reports/`. Crear subasta acepta `proxy_enabled` y `closing_policy: soft_close` con `soft_close_window_s`, `soft_close_extension_s`, `soft_close_max_total_s` (por defecto 120/120/3600). El detalle trae `soft_close` (`extended`, `original_ends_at`) y `viewer.my_proxy_max` (solo el propio).
- Acción requerida: tras cada puja, re-leer `ends_at` (puede extenderse). Polling de notificaciones cada 30 s. Nuevos códigos `PROXY_NOT_ENABLED`, `ALREADY_REPORTED`. `PROXY_LIMIT_DECREASE_NOT_ALLOWED` si se baja o repite el máximo.
- Cómo validar: `tests/auctions/test_phase3_flow.py` muestra cada flujo.

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

