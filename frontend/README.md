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

## Calidad

Antes de integrar: `eslint`, `tsc --noEmit`, Vitest, build y, por fase, el recorrido E2E correspondiente.
