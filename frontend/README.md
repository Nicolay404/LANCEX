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

## Calidad

Antes de integrar: `eslint`, `tsc --noEmit`, Vitest, build y, por fase, el recorrido E2E correspondiente.
