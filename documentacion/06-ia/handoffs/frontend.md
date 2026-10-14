# Handoff: Frontend

## Pendiente inicial

- LX-07 y LX-08: proyecto Vite con el stack de ADR-0004, proxy `/api` y cliente `fetch` (CSRF, `Idempotency-Key`, errores tipados).
- Construir pantallas con mocks tipados según `CONTRATO-API-INICIAL.md`; no inventar campos.
- Respetar la matriz de visibilidad: nunca mostrar máximos ajenos, ofertas selladas no reveladas ni reserva.
- Cuenta regresiva basada en `server_time` y polling según ADR-0004.

## Handoffs activos

- Fecha/hora: 2026-10-13T19:43:43-05:00
- Issue/PR: `EMAXCONNSESSION` (pool de Supabase agotado) — rama `feat/architect/cuenta-y-actividad`, sin commit aún
- Para rol: Frontend y Base de datos (todos los que corren el backend contra Supabase)
- Estado: requiere acción tras el merge
- Contexto: el backend dejaba conexiones abiertas 60 s por cada hilo de `runserver` (`CONN_MAX_AGE = 60`) y llenaba las 15 plazas del pooler en modo sesión, compartidas por los tres. Síntoma: 500 intermitentes con `EMAXCONNSESSION max clients reached`. Corregido: `CONN_MAX_AGE` por defecto 0 (`DB_CONN_MAX_AGE`), ADR-0004 Enmienda 2.
- Archivos, tablas o endpoints afectados: `backend/config/settings/base.py`, `backend/.env.example`.
- Acción requerida: tras el merge a `main`, `git pull` y **reiniciar** tu backend. Mientras alguien corra la versión vieja, sigue ocupando plazas de todos. No hace falta tocar el `.env`.
- Cómo validar: navegar el catálogo un par de minutos con el backend contra Supabase sin 500.

- Fecha/hora: 2026-10-13T19:09:56-05:00
- Issue/PR: respuesta a los handoffs de rendimiento, LX-74 y LX-53 (rama `feat/architect/cuenta-y-actividad`, sin commit aún)
- Para rol: Frontend
- Estado: listo para consumir (pendiente de commit/PR por autorización humana)
- Contexto: (1) Rendimiento: throttling general en memoria y panel agrupado. Consultas por petición (Postgres local, sesión real): `/categories/` 13→1, `/auctions/` anónimo 15→3, detalle 17→5, `live/` 14→2, `/auth/me/` 12→6, `/me/summary/` 30→11, `/me/participations/` 17→9. No medido contra Supabase (la red del ARQ bloquea el puerto 5432 en ese momento): validar con tu `Measure-Command`. (2) LX-74: job `e2e` agregado a `ci.yml` con tu propuesta, solo en push a `main`, `timeout-minutes: 25` y espera activa a que el backend responda; aún no ejecutado en GitHub. (3) LX-53: `?q=` busca también en el título de la necesidad (la inversa aparece al buscar "Resmas"); `auction.status` en `/procurement-requests/{id}/`, `/organizations/{id}/procurement-requests/` y `/organizations/{id}/registrations/` ahora es el EFECTIVO.
- Archivos, tablas o endpoints afectados: los endpoints citados; sin cambios de forma en las respuestas.
- Acción requerida: puedes mostrar el `status` de esas vistas B2B. Si 6 min de E2E en cada push a `main` es mucho, avisa.
- Cómo validar: `tests/core/test_query_budget.py`, `tests/auctions/test_lx53_reverse_visibility.py`; `GET /auctions/?q=Resmas` con el seed.

- Fecha/hora: 2026-10-13T00:03:04-05:00 (2026-10-13T05:03:04Z)
- Issue/PR: auditoría funcional del backend (sin commit aún; pendiente de autorización)
- Para rol: Frontend
- Estado: requiere revisión
- Contexto: correcciones con efecto visible. (1) En subastas inversas, `PATCH /auctions/{id}/` con `title`/`description` ahora responde `400 VALIDATION_ERROR` (antes 200 sin guardar nada). (2) `?mine=participating` incluye subastas donde el usuario solo tiene oferta sellada. (3) Borrar una imagen sin Storage devuelve 503 y la imagen sigue existiendo. (4) Moderación: `sealed_offers` en la vista interna de una subasta.
- Archivos, tablas o endpoints afectados: los cuatro citados.
- Acción requerida: no ofrecer editar textos de una inversa desde la subasta; tratar el 503 de borrado como "inténtalo más tarde".
- Cómo validar: `tests/auctions/test_audit_fixes.py`.

- Fecha/hora: 2026-10-12T23:55:03-05:00
- Issue/PR: análisis de flujos por rol (PANTALLAS-Y-NAVEGACION.md vs API) — rama `backend-lancex`
- Para rol: Frontend
- Estado: listo para consumir
- Contexto: se cerraron los huecos de backend de las pantallas documentadas para todos los roles.
- Archivos, tablas o endpoints afectados: resultado con `winner_pseudonym` y `viewer.can_rate`/`my_rating` (pantalla `/calificar`); `GET /procurement-requests/{id}/` con `auction` y `admitted_count` (`/necesidades/:id`); `GET /organizations/{id}/procurement-requests/` (`/org/:orgId/necesidades`); `registrations_pending` en `GET /auctions/?organization=` (`/org/:orgId`); `GET /organizations/{id}/opportunities/` (`/org/:orgId/oportunidades`, ya sin conflictos de interés); `POST /auctions/{id}/reverse-quote/` (sala de puja inversa: total oficial antes de enviar); `GET /moderation/organizations/{id}/` (verificación con miembros); `reported_active_auctions` en la bandeja; notificaciones nuevas `report_resolved`, `organization_verified`, `organization_rejected` (con `data.organization_name` y `data.reason`).
- Acción requerida: conectar esas pantallas; textos para los 3 tipos nuevos de notificación.
- Cómo validar: `tests/auctions/test_role_flows.py`.

- Fecha/hora: 2026-10-12T23:30:01-05:00
- Issue/PR: pendientes de LX-15/LX-35/LX-38 + pantallas de PANTALLAS-Y-NAVEGACION sin endpoint (rama `backend-lancex`)
- Para rol: Frontend
- Estado: listo para consumir
- Contexto: resueltos los 3 pedidos y agregados los endpoints de "Mi cuenta" y "Mi actividad".
- Archivos, tablas o endpoints afectados: `GET /listings/` (mis publicaciones), `listing_id` en `GET /auctions/{id}/`, `data.title` en notificaciones; `PATCH /auth/me/` acepta `bio` y `location_city` (y `UserMe` los devuelve); `GET /auth/sessions/` y `POST /auth/sessions/revoke-others/`; `GET /users/{id}/` con `bio`, `location_city`, `member_since`; `GET /auctions/?seller=` (perfil público) y `?organization=` (panel de organización); `watchers_count` en el detalle para el dueño; `GET /me/summary/` (/panel), `GET /me/participations/?tab=` (/mis-pujas), `GET /me/activity/` (registro), `GET /organizations/{id}/registrations/` (/org/:orgId/inscripciones).
- Acción requerida: conectar /mis-publicaciones, "Reportar publicación", títulos en notificaciones, /panel, /mis-pujas, /cuenta (bio, ciudad, sesiones, cerrar otras sesiones, registro de actividad), perfil público con sus subastas, panel e inscripciones de organización. Imágenes (LX-73): esperan a que BD configure Supabase Storage (`503 STORAGE_UNAVAILABLE` mientras tanto). El "resumen de operaciones" NO es un saldo: mostrar el aviso `operations.notice`.
- Cómo validar: `tests/auctions/test_account_and_activity.py` y el OpenAPI en `/api/v1/schema/`.

- Fecha/hora: 2026-10-12T20:26:42-05:00
- Issue/PR: LX-70, LX-71, LX-72, LX-77, LX-79 (Fase 7; rama `backend-lancex`)
- Para rol: Frontend (LX-73, LX-78)
- Estado: listo para consumir — el backend del contrato v1 está completo
- Contexto: imágenes, liquidación y calificaciones, perfil público, moderación y administración; datos demo.
- Archivos, tablas o endpoints afectados: imágenes `POST /listings/{id}/images/upload-url/` -> `{upload_url, storage_path, expires_in}` (el navegador hace `PUT`/`POST` del archivo a `upload_url`), luego `POST /listings/{id}/images/` `{storage_path, position}`; `DELETE /listings/{id}/images/{image_id}/`; `images[]` con URL firmada (1 h) en el detalle de la subasta y de la publicación. `PATCH /auctions/{id}/settlement/`, `POST /auctions/{id}/rating/`, `GET /users/{id}/`. Moderación: `/moderation/summary/`, `/moderation/reports/`, `/moderation/reports/{id}/resolve/`, `/moderation/auctions/{id}/`, `/moderation/auctions/{id}/cancel/`, `/moderation/users/{id}/`, `/moderation/users/{id}/suspend/`, `/moderation/organizations/...`. Admin: `/admin/users/`, `/admin/users/{id}/reactivate/`, `/admin/users/{id}/role/` (step-up), `/admin/categories/` y `/admin/categories/{id}/`, `/admin/audit-events/`, `/admin/system-health/`.
- Acción requerida: datos demo con `python manage.py seed_demo` (contraseña por `LANCEX_DEMO_PASSWORD`; usuarios `ana|beto|carla|diego|moderador|admin@demo.lancex.test`). Nuevos códigos: `ALREADY_RATED`, `OPEN_ACTIVITY`, `SLUG_ALREADY_EXISTS`, `STORAGE_UNAVAILABLE` (503).
- Cómo validar: `tests/catalog/test_images.py`, `tests/auctions/test_post_close.py`, `tests/moderation/test_staff.py`.

- Fecha/hora: 2026-10-12T20:17:21-05:00
- Issue/PR: LX-60 (Fase 6, vela; rama `backend-lancex`)
- Para rol: Frontend (LX-62)
- Estado: listo para consumir
- Contexto: `closing_policy: candle` (solo ascendente, admite proxy) con `candle_window_s` 300–3600 (por defecto 600, no mayor que la subasta).
- Archivos, tablas o endpoints afectados: detalle con `candle` = `{window_start, window_s, commitment, in_window, price_is_provisional, notice, close_at}` (`close_at` solo tras el cierre); `GET /auctions/{id}/candle-proof/` -> `{auction_id, commitment, seed_hex, window_start, window_s, close_at, algorithm}` tras el cierre (`409 NOT_REVEALED_YET` antes). Historial: `counted` es `null` mientras está abierta y `true/false` tras el cierre.
- Acción requerida: indicador de fase de vela con el aviso `notice`; precio "provisional" en la ventana; pantalla de verificación con los datos de `candle-proof` (se pueden comprobar con `scripts/verify_candle.py`).
- Cómo validar: `tests/auctions/test_candle_flow.py`.

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

