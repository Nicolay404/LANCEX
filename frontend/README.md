# Frontend LANCEX

**Stack:** React 19 + TypeScript (estricto) + Vite, React Router, TanStack Query, React Hook Form + Zod, Tailwind CSS + shadcn/ui, openapi-typescript, Vitest + Testing Library, Playwright (ADR-0004).

## Responsabilidad

- Presentar catálogo, detalle de subasta, formularios, paneles y resultados.
- Consumir solo la API documentada en `documentacion/04-api/CONTRATO-API-INICIAL.md`.
- Mostrar estados de carga, error, vacío, éxito, fase de vela, extensión de cierre y resultado pendiente.
- No decidir ganadores ni validar de forma autoritativa precios, permisos o cierres.
- No usar Supabase ni Firebase desde el navegador (salvo subir/leer imágenes con URLs firmadas que entrega el backend).
- Nunca mostrar máximos ajenos, ofertas selladas no reveladas ni precio de reserva.

## Convenciones

```text
src/
├── app/            # router, providers (QueryClient), layout
├── api/            # cliente fetch (CSRF, Idempotency-Key, errores tipados) + tipos generados
├── features/
│   ├── auth/
│   ├── catalog/
│   ├── auctions/   # detalle, pujar, proxy, sellado, vela, resultado
│   ├── b2b/        # organizaciones, necesidades, inscripción, panel comprador/proveedor
│   ├── notifications/
│   ├── moderation/ # paquete moderation
│   └── admin/      # paquete admin
├── components/ui/  # shadcn/ui
└── lib/            # formato de dinero (string decimal), fechas, utilidades
```

- Llamadas a rutas relativas `/api/v1/...`; Vite hace proxy al backend (sesión mismo origen, sin CORS).
- Importes como `string` en todo el frontend; formateo con `Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" })` solo para mostrar.
- Cuenta regresiva calculada con `server_time` de la API, no con el reloj local.
- Polling con `refetchInterval` (2 s detalle activo, 15 s catálogo, 30 s notificaciones) y `If-None-Match`.
- Cada intento de puja genera un `Idempotency-Key` nuevo; los reintentos automáticos reutilizan el mismo.
- Tipos generados desde `/api/v1/schema/` con `openapi-typescript`; mientras no exista, tipos manuales del contrato.

## Carga por rol (ADR-0006)

- `GET /auth/me` al iniciar; sus `capabilities` construyen router y menú. Nada de rol en `localStorage`.
- Paquetes con `import()` dinámico: `public`, `user`, `org-buyer`, `org-supplier`, `moderation`, `admin`. Un usuario descarga solo los suyos.
- Ruta sin capacidad = no registrada = 404. Ante 403 se vuelve a pedir `/auth/me`.
- Logout: `queryClient.clear()` y recarga completa.
- Sin modos ocultos, banderas de depuración ni funciones en `window`. Build de producción sin source maps ni `console`.
- Recordatorio: esto es experiencia de usuario. La seguridad real está en el backend; ver `documentacion/05-calidad/SEGURIDAD-Y-AUTORIZACION.md`.
- Mapa completo de pantallas: `documentacion/08-interfaz/PANTALLAS-Y-NAVEGACION.md`.

## Arranque local

Requisitos: Node `^22.22.2` o `>=24.15.0` (LTS) y el backend Django en `http://localhost:8000`.

```bash
cd frontend
cp .env.example .env      # PowerShell: Copy-Item .env.example .env
npm ci
npm run dev               # http://localhost:5173 ; /api se reenvía a BACKEND_URL
```

| Script | Qué hace |
|---|---|
| `npm run dev` | Vite en `:5173` con proxy `/api` → `BACKEND_URL` |
| `npm run lint` | ESLint (prohíbe `console`, `localStorage` y `axios`) |
| `npm run typecheck` | `tsc -b --noEmit` (TypeScript estricto) |
| `npm test -- --run` | Vitest una vez (sin `--run` queda en modo watch) |
| `npm run build` | `tsc -b` + build sin source maps ni `console` |
| `npm run format` | Prettier |

## Cliente de la API (`src/api`)

```ts
import { api, apiFetchConditional, newIdempotencyKey, isApiError } from '@/api'

const me = await api.get<UserMe>('/auth/me/')               // GET: sin CSRF
await api.post('/auth/login/', { email, password })          // pide /auth/csrf/ si falta la cookie

const key = newIdempotencyKey()                              // una por intento lógico de puja
await api.post(`/auctions/${id}/bids/`, { amount: '140.00' }, { idempotencyKey: key })

const r = await apiFetchConditional(`/auctions/${id}/live/`, { ifNoneMatch: etag })
if (!r.notModified) { /* r.data, r.etag */ }

try { ... } catch (e) { if (isApiError(e) && e.is('BID_BELOW_MINIMUM')) e.details.minimum_allowed }
```

- Solo rutas relativas: una URL absoluta lanza error (no enviar cookie ni CSRF a otro origen).
- `CSRF_FAILED` → renueva el token y reintenta una sola vez con la misma `Idempotency-Key`.
- Fallo de red → `ApiError` `NETWORK_ERROR` (status 0); cancelaciones (`AbortError`) se propagan.
- Las mutaciones de TanStack Query no se reintentan solas (`retry: false`).

## Sesión, rutas y paquetes por rol (LX-14, LX-19)

- `src/app/AppShell.tsx` espera `GET /auth/me` (401 = visitante) y `src/app/buildRoutes.tsx` registra **solo** las rutas que permiten las `capabilities`; lo demás cae en la 404 única.
- Paquetes con `import()`: `account` (`/cuenta`), `user` (`/panel`), `moderation` (`/moderacion`), `admin` (`/admin`), `org` (`/org/:orgId`) con `org-buyer` / `org-supplier` según las capacidades de esa organización. Un usuario no descarga los paquetes que no le corresponden.
- `/ingresar` y `/registro` solo para visitantes (`GuestOnly`); tras el login se vuelve a `?next=` validado (`safeNextPath`, sin redirecciones abiertas).
- El contexto activo (Personal / Organización) vive en la URL, nunca en `localStorage`.
- Errores globales (`src/app/queryClient.ts`): `401 AUTH_REQUIRED` → visitante; `403 FORBIDDEN` → se vuelve a pedir `/auth/me`.
- Logout: `POST /auth/logout/`, `queryClient.clear()` y recarga completa.
- Publicaciones (LX-15, paquete `listings`, capacidad `listing.manage_own`): `/mis-publicaciones/nueva` crea con `POST /listings/`; `/mis-publicaciones/:id/editar` lee con `GET` y guarda con `PATCH` parcial (solo campos modificados). `editable=false` o `409 LISTING_LOCKED` bloquean el formulario. El listado espera un endpoint que el contrato aún no tiene (handoff a backend).
- Catálogo y detalle (LX-27): `/` lista `GET /auctions/` con filtros en la URL y polling cada 15 s; `/subastas/:id` (paquete `auction`, público) pide el detalle y hace polling de `live/` cada 2 s con `If-None-Match` (304 sin cambios); si sube `version` recarga detalle e historial. Cuentas regresivas con el desfase de `server_time` (`src/lib/serverClock.ts`). Puja manual ascendente con `Idempotency-Key` nueva por intento y la misma en reintentos tras fallo de red; confirmación si supera 3 veces el precio actual. Sobre cerrado: nunca precio ni "Vas ganando" antes del cierre.
- Crear subasta (LX-28, paquete `auction-create`, capacidad `auction.create_personal`): desde una publicación editable, botón "Crear subasta" → `/mis-subastas/nueva?listing=<id>`. Pasos: publicación → reglas (ascendente o sobre cerrado, precio inicial, incremento, reserva, puja automática) → fechas y cierre (al publicar o programada; fijo, con extensión o vela) → revisión → "Guardar borrador" (`POST /auctions/`) o "Publicar ahora" (`POST /auctions/` + `/publish/`). Fechas en hora de Ecuador (UTC−05:00) enviadas en ISO con offset. Errores por campo del backend vuelven al paso correspondiente. Un borrador propio muestra "Publicar subasta" en `/subastas/:id`.
- Resultado y "Mis subastas" (LX-29): `/subastas/:id/resultado` (público) usa `GET /result/` (materializa el cierre si estaba pendiente; reintenta cada 3 s mientras `result_pending`) y muestra a cada audiencia lo suyo: ganador/dueño ven el contacto de la contraparte, sellado muestra el puesto. `/mis-subastas` (`mine=owner`, pestañas por estado en `?estado=`), `/mis-pujas` (`mine=participating`) y `/panel` (resumen). El dueño puede cancelar con motivo (borrador/programada siempre; activa sin pujas) desde `/subastas/:id`.
- Fase 3 (LX-35): en `/subastas/:id`, panel "Puja automática" (solo con `proxy_enabled` y `proxy.manage_own`; `PUT /proxy-limit/ {max_amount}`, solo se puede subir; solo se muestra el máximo propio), aviso "Cierre extendido" cuando `live/` trae un `ends_at` posterior (soft close) y botón "Seguir subasta" (`PUT|DELETE /watch/`). Campana con no leídas (`GET /notifications/?unread=true`, cada 30 s), `/notificaciones` (marcar una o todas) y `/seguimiento` (`mine=watching`).
- Reportar (LX-38): botón "Reportar" con ventana modal accesible (`src/components/ui/modal.tsx`: foco dentro, Escape cierra, foco vuelve) en `/subastas/:id` y en el perfil público `/usuarios/:id` (`GET /users/{id}/`: nombre y reputación, nunca email). `POST /reports/ {target_type, target_id, reason, detail}`; `ALREADY_REPORTED` se explica como aviso. Solo con `report.create` (staff no lo ve) y nunca sobre lo propio. Reportar una publicación espera que el detalle exponga `listing_id` (handoff a backend).
- Sobre cerrado (LX-42): en `/subastas/:id` de una subasta `sealed` activa, panel "Tu oferta sellada" (`GET|PUT|DELETE /sealed-offer/`, PUT con `Idempotency-Key`): ofertar, reemplazar (aviso de pérdida de prioridad en empate) y retirar, ambos con confirmación. Solo se muestra la oferta propia y el número de participantes; nunca "Vas ganando". Al cierre, `SealedRanking` muestra el ranking que entrega `GET /bids/` por audiencia (seudónimos y "Tú"; identidades solo al dueño), en el detalle y en el resultado.
- Para probar en local con datos demo: `python manage.py seed_demo` en el backend (usuarios `ana`, `beto`, `carla`, `diego`, `moderador`, `admin` `@demo.lancex.test`).

## Calidad

Antes de integrar: `eslint`, `tsc --noEmit`, Vitest, build y, por fase, el recorrido E2E correspondiente.
