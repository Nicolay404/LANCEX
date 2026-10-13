# Handoff: Backend

## Pendiente inicial

- Las reglas están aprobadas en `REGLAS-DE-SUBASTAS.md`; el dominio puro (`auctions/domain/`) puede empezar sin base de datos.
- Seguir la estructura de módulos y el esqueleto de `place_bid` / `close_auction` de ADR-0005.
- **No crear migraciones de Django.** Si falta una columna, crear migración SQL nueva y dejar handoff a BD.
- Toda hora de negocio desde `TimeSource.db_now()`.
- Mantener drf-spectacular alineado con `CONTRATO-API-INICIAL.md`.

## Handoffs activos

- Fecha/hora: 2026-10-12T23:30:01-05:00
- Issue/PR: respuesta a los handoffs de LX-15, LX-35 y LX-38 (rama `backend-lancex`)
- Para rol: Backend (ARQ) — CERRADO
- Estado: resuelto
- Contexto: (1) `GET /listings/` implementado tal como se propuso (más `latest_auction` y `cover_image_url`); (2) `listing_id` agregado al detalle de la subasta (dato no sensible); (3) `data.title` en todas las notificaciones de subasta (outbid, cierre, cancelación, seguimiento, inscripción, calificación).
- Archivos, tablas o endpoints afectados: ver handoff de Frontend del mismo momento.
- Acción requerida: ninguna para Backend.
- Cómo validar: `tests/auctions/test_account_and_activity.py::TestFrontendRequests`.

- Fecha/hora: 2026-10-12T22:44:55-05:00
- Issue/PR: LX-38 (rama `frontend-lancex`)
- Para rol: Backend (ARQ)
- Estado: requiere revisión (no bloquea; hoy se reportan subasta y usuario)
- Contexto: LX-38 pide "Reportar" también en la publicación, y `POST /reports/` acepta `target_type: listing`, pero el detalle público de la subasta (`GET /auctions/{id}/`) no trae el id de la publicación, así que el frontend no tiene qué enviar como `target_id`.
- Archivos, tablas o endpoints afectados: `apps/auctions/api/presenters.py` (`detail`), `CONTRATO-API-INICIAL.md` (detalle público).
- Acción requerida: decidir si exponer `listing_id` (dato no sensible; la publicación ya es pública a través de la subasta) en el detalle; si se aprueba, avisar a Frontend para agregar "Reportar publicación".
- Cómo validar: `GET /auctions/{id}/` de una subasta ascendente trae `listing_id`; `POST /reports/` con ese id y `target_type: listing` responde 201.

- Fecha/hora: 2026-10-12T22:37:42-05:00
- Issue/PR: LX-35 (rama `frontend-lancex`)
- Para rol: Backend (ARQ)
- Estado: requiere revisión (mejora menor, no bloquea)
- Contexto: las notificaciones de puja (`outbid`) y de cierre (`auction_won`, `auction_lost`, `auction_closed_owner`, `auction_unsold_owner`) llegan sin `data.title`, aunque `DATA_KEYS` lo permite. El frontend muestra entonces "Te superaron en una subasta" en lugar del nombre del artículo.
- Archivos, tablas o endpoints afectados: `apps/auctions/services/bidding.py` (`notify(... "outbid" ...)`), `apps/auctions/services/closing.py` (`_notify_closed`), `GET /notifications/`.
- Acción requerida: incluir `title` (título de la publicación o de la necesidad B2B, dato público) en `data` de esas notificaciones. Sin cambios de contrato: `title` ya está en la lista blanca.
- Cómo validar: tras una puja que supera a otro, `GET /notifications/` del superado trae `data.title`; en el frontend se lee "Te superaron en «<título>»".

- Fecha/hora: 2026-10-12T21:46:43-05:00
- Issue/PR: LX-15 (rama `frontend-lancex`)
- Para rol: Backend (ARQ)
- Estado: bloqueado (solo la pantalla `/mis-publicaciones`; crear y editar ya funcionan)
- Contexto: `PANTALLAS-Y-NAVEGACION.md` §3 pide `/mis-publicaciones` con el listado de artículos propios, pero el contrato v1 solo tiene `POST /listings/` y `GET|PATCH /listings/{id}/`. El frontend no inventa endpoints: hoy esa pantalla solo ofrece "Nueva publicación" y la edición se abre por id tras crear.
- Archivos, tablas o endpoints afectados: propuesta `GET /api/v1/listings/` (capacidad `listing.manage_own`, solo publicaciones propias con `visible_to(user)`, paginado `?page&page_size` estándar, orden `-updated_at`), con la misma forma que `ListingOwnerSerializer` (`id`, `category`, `title`, `item_condition`, `location_city`, `created_at`, `updated_at`, `editable`) y, si es barato, la primera imagen. Agregarlo a `CONTRATO-API-INICIAL.md` y a `tests/security/endpoint_matrix.yaml` (visitante 401, staff 403, usuario 200 solo con lo suyo).
- Acción requerida: decidir y, si se aprueba, implementar y avisar por handoff a Frontend; el frontend conecta la lista en `frontend/src/packages/listings/MyListingsPage.tsx`.
- Cómo validar: con `seed_demo`, `ana` ve solo sus 2 publicaciones `[DEMO]` y `beto` las suyas; un moderador recibe 403.

## Plantilla

- Fecha/hora:
- Issue/PR:
- Para rol:
- Estado: bloqueado / requiere revisión / listo para consumir
- Contexto:
- Archivos, tablas o endpoints afectados:
- Acción requerida:
- Cómo validar:

