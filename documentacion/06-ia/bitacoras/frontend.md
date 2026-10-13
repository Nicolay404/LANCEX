# Bitácora de IA: Frontend

> Solo el rol de frontend agrega entradas. No editar entradas históricas: corregirlas mediante una nueva entrada.

## Plantilla de entrada

```markdown
## YYYY-MM-DDTHH:mm:ss-05:00: INICIO/CIERRE: ISSUE/PR
- Humano responsable:
- Herramienta/modelo IA (si se conoce):
- Rama y commit:
- Objetivo:
- Componentes/archivos modificados:
- Contrato consumido:
- Pruebas ejecutadas y resultado real:
- Riesgos/bloqueos:
- Handoff/siguiente paso:
```

## 2026-10-12T17:57:19-05:00: INICIO: LX-07, LX-08
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `feat/frontend/LX-07-08-base` (creada por la humana desde `main`), sin commit aún
- Objetivo: proyecto Vite base (LX-07) y cliente `fetch` con CSRF, `Idempotency-Key` y errores tipados (LX-08).
- Componentes/archivos modificados: plan presentado y aprobado; solo `frontend/` y esta bitácora.
- Contrato consumido: `CONTRATO-API-INICIAL.md` (convenciones, errores, `UserMe`, `live/` con ETag); backend real: `apps/core/exceptions.py`, `apps/core/views.py` (`csrf_failure`), `config/settings/base.py` (cookies/CSRF), `apps/auctions/api/views.py` (ETag, `Idempotency-Key` UUID v4).
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: la petición inicial pedía LX-02/LX-03 (rol BD); se descartó por estar fuera del rol FE y ya existir el borrador de ARQ.
- Handoff/siguiente paso: implementar.

## 2026-10-12T18:03:35-05:00: CIERRE: LX-07, LX-08
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `feat/frontend/LX-07-08-base`, sin commit (lo hace la humana tras revisar el diff)
- Objetivo: LX-07 y LX-08.
- Componentes/archivos modificados (todos nuevos salvo README): `frontend/package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `components.json`, `index.html`, `public/favicon.svg`, `src/main.tsx`, `src/index.css`, `src/vite-env.d.ts`, `src/app/{AppLayout,providers,queryClient,routes}.tsx|ts`, `src/app/pages/{HomePage,NotFoundPage}.tsx`, `src/components/ui/button.tsx`, `src/lib/{utils,money}.ts`, `src/api/{client,errors,types,csrf,index}.ts`, pruebas `src/api/client.test.ts`, `src/lib/money.test.ts`, `src/app/AppLayout.test.tsx`, `src/test/setup.ts`; `frontend/README.md` (secciones "Arranque local" y "Cliente de la API").
- Decisiones/supuestos:
  - Versiones exactas: React 19.3.0, Vite 8.3.4, TypeScript 6.0.3, React Router 7.18.4, TanStack Query 5.104.2, Tailwind 4.3.3, Vitest 5.0.4, ESLint 10.12.0 + typescript-eslint 8.71.2. TS 6.0 y no 7.x porque typescript-eslint exige `<6.1`. React Router 7 (no 8) por API conocida y menor exigencia de Node.
  - Proxy `/api` sin `changeOrigin`: Django recibe `Host: localhost:5173`, coherente con `CSRF_TRUSTED_ORIGINS`.
  - Build: `sourcemap: false` y `dropConsole`/`dropDebugger` con el minificador de Rolldown (Vite 8 ya no usa la opción `esbuild.drop`).
  - ESLint prohíbe `console`, `localStorage` y `axios` (ADR-0004/0006).
  - El cliente solo acepta rutas relativas; `CSRF_FAILED` → un único reintento con la misma `Idempotency-Key`; códigos desconocidos se guardan en `rawCode`.
  - Tipos manuales (`UserMe`, `Paginated`, `Money = string`) hasta generar con openapi-typescript.
  - shadcn/ui: `components.json` y `Button` escritos a mano (equivalente a lo que genera la CLI).
- Pruebas ejecutadas y resultado real (en el espacio de trabajo en la nube, Node 22.22.0; la terminal de la laptop no pudo montar la carpeta):
  - `npm ci` → 0 vulnerabilidades.
  - `npm run lint` → sin errores.
  - `npx tsc --noEmit` y `npx tsc -b --noEmit` → OK.
  - `npm test -- --run` → 3 archivos, 27 pruebas, todas en verde.
  - `npm run build` → OK; 0 archivos `.map`; 0 apariciones de `console.` en el JS.
  - `npx prettier --check .` → OK.
  - `npx vite` + backend falso en :8000: `GET /api/v1/auth/me/` llegó con `Host: localhost:5173`.
  - `vite preview` + Chromium (Playwright): renderiza el layout, `h1 = "Subastas"`, sin errores de consola.
- Riesgos/bloqueos:
  - No probado contra el backend Django real (requiere Supabase y `.env`); validar login/CSRF de punta a punta en LX-14.
  - Engines: jsdom 30 pide Node `^22.22.2 || >=24.15.0`; con Node más antiguo `npm ci` avisa EBADENGINE.
  - En CI, `npx tsc --noEmit` sobre un `tsconfig.json` con solo `references` no comprueba nada; la comprobación real la hace `tsc -b` dentro de `npm run build`. Sugerencia para ARQ (LX-09): usar `npm run typecheck`.
  - `frontend/.gitkeep` queda en el repo; se puede borrar.
- Handoff/siguiente paso: commit + PR a `main` con revisión de ARQ. Siguiente FE: LX-14 (registro, login, perfil, layout autenticado, guardas de ruta) y luego LX-19 (router por `capabilities`). Handoff a ARQ por el punto de `tsc` en CI (sin cambios de contrato API).

## 2026-10-12T21:04:26-05:00: INICIO: LX-14, LX-19
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex` (ya incluye `main` con el backend v1 completo), sin commit aún
- Objetivo: pantallas de registro, login y cuenta; router y menú por `capabilities`; paquetes por rol con `import()`; 404 única; logout con limpieza y recarga; selector de contexto de organización.
- Componentes/archivos modificados: alcance aprobado por la humana (opción "LX-14 + LX-19").
- Contrato consumido: `/auth/csrf/`, `/auth/register/`, `/auth/login/`, `/auth/logout/`, `GET|PATCH /auth/me/`, `/auth/password/`; `UserMe` con `capabilities` y `organizations[].capabilities`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno al inicio.
- Handoff/siguiente paso: implementar.

## 2026-10-12T21:14:58-05:00: CIERRE: LX-14, LX-19
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana tras revisar el diff)
- Objetivo: LX-14 y LX-19.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/app/{AppShell,buildRoutes}.tsx`, `src/features/auth/{api,keys,session,capabilities,nextPath}.ts`, `src/features/auth/{LoginPage,RegisterPage,GuestOnly,AuthCard}.tsx`, `src/packages/{account/AccountPage,user/UserPanelPage,moderation/ModerationHomePage,admin/AdminHomePage,org/OrgHomePage,org-buyer/BuyerSection,org-supplier/SupplierSection}.tsx`, `src/components/{ErrorAlert,FormErrorBanner,FormField,PageLoading,PagePlaceholder}.tsx`, `src/components/ui/{input,label,alert}.tsx`, `src/lib/formErrors.ts`, pruebas `src/app/routing.test.tsx`, `src/features/auth/{LoginPage,RegisterPage}.test.tsx`, `src/features/auth/{session,nextPath,capabilities}.test.ts`, `src/packages/account/AccountPage.test.tsx`, `src/test/{fakeServer.ts,renderApp.tsx}`.
  - Modificados: `src/main.tsx` (BrowserRouter + AppShell), `src/app/AppLayout.tsx` (menú por capacidades, menú de cuenta, selector de contexto), `src/app/queryClient.ts` (401/403 globales), `src/app/pages/NotFoundPage.tsx`, `package.json`/`package-lock.json` (react-hook-form 7.90.0, zod 4.6.7, @hookform/resolvers 5.9.1, @testing-library/user-event 14.6.7; todas de ADR-0004), `eslint.config.js`, `.prettierignore`, `README.md` (sección de sesión y rutas).
  - Retirados: `src/app/routes.tsx` y `src/app/AppLayout.test.tsx` (reemplazados por `buildRoutes.tsx` y `routing.test.tsx`); movidos a `.tmp/_to_delete/` (ignorado por git).
- Contrato consumido: el indicado en el INICIO; sin cambios de contrato.
- Decisiones/supuestos:
  - Rutas declarativas con `useRoutes(buildRoutes(me))`: al cambiar `/auth/me` (login, logout, rol) el árbol se recalcula. Ruta sin capacidad = no registrada = 404; al visitante la 404 le ofrece "Ingresa" con `?next=`.
  - `/cuenta` en paquete `account` (también lo usan moderador y admin, todos tienen `account.manage_own`).
  - Tras login/registro, `GuestOnly` redirige a `?next` validado; `safeNextPath` bloquea `//`, `/\`, `://`, caracteres de control y bucles a `/ingresar`.
  - `password_confirm` es solo del cliente: no se envía (entrada estricta del backend).
  - Contexto de organización en la URL (`/org/:orgId`), sin `localStorage`; organización ajena = 404.
  - Pantallas de `/panel`, `/moderacion`, `/admin` y secciones B2B son esqueletos con su tarea (LX-27/29, LX-78, LX-53).
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm ci` (0 vulnerabilidades), `npm run lint` (0 errores, 0 avisos), `npx tsc --noEmit` y `npx tsc -b --noEmit` OK, `npm test -- --run` 9 archivos / 63 pruebas en verde, `npm run build` OK con chunks separados por paquete y sin `.map` ni `console`.
  - Backend real local: Postgres 16 + `scripts/db/apply_local.sh` (base `lancex_dev`), `python manage.py check` sin problemas, `seed_demo` OK, `runserver` + `vite`. Con curl a través del proxy: login correcto/incorrecto, validaciones de registro, `STEP_UP_FAILED`, `UNKNOWN_FIELD`, logout 204 y `/auth/me` de user, moderador y admin.
  - E2E en Chromium (Playwright) contra ese backend: 17/17 comprobaciones OK (visitante, registro real, cambio de nombre, contraseña incorrecta y correcta, logout, login inválido, login con `?next`, menús y 404 por rol, sin descarga de paquetes ajenos) y 0 errores de consola.
- Riesgos/bloqueos:
  - El backend de prueba usó Postgres 16 local, no Supabase; con Supabase el flujo es el mismo pero conviene repetir el recorrido en la laptop.
  - El login tiene límite de 5/min por IP: al probar a mano, esperar si aparece "Demasiados intentos".
  - `.tmp/` contiene una copia del backend usada para la prueba y los dos archivos retirados; se puede borrar.
- Handoff/siguiente paso: commit + PR a `main` con revisión de ARQ. Siguiente FE: LX-15 (crear/editar publicación) y LX-27 (catálogo y detalle).

## 2026-10-12T21:41:12-05:00: INICIO: LX-15
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex` (LX-14/LX-19 aún sin commit en la misma rama)
- Objetivo: crear y editar publicaciones.
- Componentes/archivos modificados: plan aprobado por la humana: crear + editar completos; listado pendiente de endpoint (handoff a backend).
- Contrato consumido: `GET /categories/`, `POST /listings/`, `GET|PATCH /listings/{id}/` (`ListingOwnerSerializer` + `images`, `editable`), códigos `VALIDATION_ERROR`, `LIMIT_REACHED`, `LISTING_LOCKED`, `NOT_FOUND`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: el contrato v1 no tiene endpoint para listar las publicaciones propias.
- Handoff/siguiente paso: implementar.

## 2026-10-12T21:46:43-05:00: CIERRE: LX-15
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-15.
- Componentes/archivos modificados (todo en `frontend/` salvo docs):
  - Nuevos: `src/features/listings/{types,api,schema}.ts`, `src/features/listings/ListingForm.tsx`, `src/packages/listings/{MyListingsPage,NewListingPage,EditListingPage}.tsx`, `src/packages/listings/listings.test.tsx`, `src/components/ui/{textarea,native-select}.tsx`, `src/lib/dates.ts`.
  - Modificados: `src/app/buildRoutes.tsx` (rutas `/mis-publicaciones`, `/nueva`, `/:id/editar` solo con `listing.manage_own`), `src/app/AppLayout.tsx` (menú "Mis publicaciones"), `src/lib/formErrors.ts` (`leftoverFieldErrors`), `README.md`.
  - Docs: `documentacion/06-ia/handoffs/backend.md` (pedido de `GET /listings/`).
- Decisiones/supuestos:
  - Se envían solo los 5 campos del contrato (`category_id` como número); en edición, PATCH solo con los campos modificados.
  - El formulario espera a tener las categorías antes de pintarse (si no, el `<select>` perdía la categoría actual; encontrado en la prueba E2E y corregido).
  - Publicación ajena o inexistente = 404. Con `editable=false` o `LISTING_LOCKED` el formulario queda bloqueado con explicación.
  - Imágenes: solo se muestran si el backend las envía; subir imágenes queda para LX-73 (requiere Supabase Storage).
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 10 archivos / 72 pruebas en verde (9 nuevas de LX-15); `npm run build` OK con chunks propios de `listings`; prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`): 9/9 OK: login de ana a `/mis-publicaciones`, validación en cliente, POST real crea y abre edición, botón deshabilitado sin cambios, PATCH real envía solo `{"location_city": ...}` y persiste tras recargar, publicación demo con subasta abierta bloqueada con su categoría visible, publicación de beto = 404 para ana; 0 errores de consola.
  - La humana verificó en su PC (Docker + `seed_demo` + `runserver`) que el login de ana funciona contra su backend local.
- Riesgos/bloqueos: listado de `/mis-publicaciones` bloqueado hasta que backend publique `GET /listings/` (handoff).
- Handoff/siguiente paso: commit + PR (LX-14, LX-19 y LX-15 juntos o por separado). Siguiente FE: LX-27 (catálogo y detalle de subasta).

## 2026-10-12T21:48:30-05:00: INICIO: LX-27
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: catálogo con filtros; detalle con cuenta regresiva por `server_time`, formulario de puja, historial y polling de 2 s.
- Componentes/archivos modificados: alcance confirmado por la humana ("sigamos" tras proponer LX-27).
- Contrato consumido: `GET /auctions/` (filtros `q`, `category`, `mechanism`, `status`, `ending_soon`, `ordering`, paginación), `GET /auctions/{id}/`, `GET /auctions/{id}/live/` (ETag/304), `GET|POST /auctions/{id}/bids/` (`Idempotency-Key`), códigos `BID_BELOW_MINIMUM`, `ALREADY_LEADING`, `AUCTION_NOT_ACTIVE`, `BID_ON_OWN_AUCTION`, `INVALID_AMOUNT_PRECISION`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:02:45-05:00: CIERRE: LX-27
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-27.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/features/auctions/{types,api,labels,formatRemaining,useAuctionLive}.ts`, `src/features/auctions/{CatalogPage,AuctionCard,Countdown,StatusBadge,PriceSummary,BidForm,BidHistory}.tsx`, `src/packages/auction/AuctionDetailPage.tsx`, `src/lib/serverClock.ts`, pruebas `src/features/auctions/auctions.test.tsx`.
  - Modificados: `src/app/buildRoutes.tsx` (`/` = catálogo, `/subastas/:id` lazy y público), `src/api/client.ts` (`onApiResponse` para leer la cabecera `Date`), `src/api/errors.ts` (códigos de fases 4 a 7), `src/lib/money.ts` (`isValidAmountInput`, `toCents`, `normalizeAmount`), `src/lib/money.test.ts`, `src/test/fakeServer.ts`, `README.md`.
  - Retirado: `src/app/pages/HomePage.tsx` (reemplazada por el catálogo), movida a `.tmp/_to_delete/`.
- Decisiones/supuestos:
  - Reloj: desfase servidor − local desde `server_time` (detalle y `live/`, punto medio de la petición); la cabecera `Date` solo como respaldo en el catálogo, que no trae `server_time`.
  - `live/`: si responde 304 se reutiliza el mismo objeto (sin re-render); si `version` sube se invalidan detalle e historial. Sin polling en pestaña oculta ni en subastas cerradas/canceladas sin resultado pendiente.
  - Puja: importe como string normalizado a 2 decimales; validación de formato y mínimo solo como ayuda; `Idempotency-Key` nueva por intento lógico y la misma al reintentar tras `NETWORK_ERROR`/`INTERNAL_ERROR`/`INVALID_RESPONSE`.
  - "Vas ganando / Te superaron" solo en ascendente (nunca en sellado); el aviso de puja aceptada se oculta cuando `version` avanza.
  - Fuera de alcance (tareas propias): puja automática (LX-35), sobre cerrado (LX-42), inversa (LX-53), resultado (LX-29), seguir subasta y reportar (LX-38).
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 11 archivos / 89 pruebas en verde (17 nuevas de LX-27), estables en 3 corridas; `npm run build` OK (`AuctionDetailPage` en chunk propio); prettier OK.
  - E2E Chromium con dos sesiones contra backend real (Postgres local + `seed_demo` recién aplicado): 14/14 OK: catálogo público, filtro en URL, detalle con cuenta regresiva, "Ingresa para pujar" vuelve al detalle tras el login, puja real de beto aceptada ("Vas ganando", "Tú" en historial), carla ve la puja por polling en 1,9 s sin recargar y a beto como "Postor 1", confirmación >3x, validación de mínimo, carla supera a beto, beto pasa a "Te superaron" por polling y el aviso viejo desaparece, la dueña (ana) no puede pujar. `live/` respondió 200 y 304. Único error de consola: el 401 esperado de `/auth/me` del visitante (log del navegador).
- Riesgos/bloqueos: ninguno nuevo. Pendiente de LX-15: listado de publicaciones (handoff a backend).
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-28 (asistente para crear subasta) o LX-29 (resultado).

## 2026-10-12T22:04:10-05:00: INICIO: LX-28
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: asistente para crear subasta (publicación → reglas → revisión → publicar).
- Componentes/archivos modificados: alcance pedido por la humana ("sigue con LX-28").
- Contrato consumido: `POST /auctions/` (`AuctionCreateInput`), `POST /auctions/{id}/publish/`, `GET /listings/{id}/`; reglas del dominio (`ascending.py`, `sealed.py`, `soft_close.py`, `candle.py`, `registry.validate_schedule`).
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: sin endpoint de listado de publicaciones, el asistente se abre desde una publicación concreta.
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:16:18-05:00: CIERRE: LX-28
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-28.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/packages/auction-create/NewAuctionPage.tsx`, `src/features/auctions/wizard/schema.ts`, pruebas `src/features/auctions/wizard/wizard.test.tsx`.
  - Modificados: `src/app/buildRoutes.tsx` (`/mis-subastas/nueva` solo con `auction.create_personal`), `src/features/auctions/api.ts` (`createAuction`, `publishAuction`), `src/lib/dates.ts` (`toGuayaquilInput`, `fromGuayaquilInput`), `src/packages/auction/AuctionDetailPage.tsx` (borrador propio con "Publicar subasta" y confirmación; avisos tras crear/publicar), `src/packages/listings/EditListingPage.tsx` (botón "Crear subasta con esta publicación"), `README.md`.
- Decisiones/supuestos:
  - Modalidades del asistente: ascendente (fijo, con extensión o vela; puja automática opcional) y sobre cerrado (solo cierre fijo, sin incremento ni proxy), según la matriz de ADR-0005. Ofertar en sobre cerrado sigue siendo LX-42.
  - Inicio "al publicar": se envía la hora actual del servidor; el backend la reajusta al publicar (REGLAS §1). Fechas escritas en hora de Ecuador, enviadas como ISO con `-05:00`.
  - Validaciones del cliente copiadas del dominio solo como ayuda (precio ≥ 1,00; incremento ≥ 0,01; reserva ≥ precio inicial; 2 min ≤ duración ≤ 30 días; soft close 30–600 s y total 30 s–24 h; vela 5–60 min y ≤ duración). Errores por campo del backend se mapean y regresan al paso afectado.
  - "Publicar ahora" = crear + publicar; si la publicación falla, queda el borrador y se muestra el motivo en su página.
  - El panel "Mis subastas" queda para LX-29.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 12 archivos / 102 pruebas en verde (13 nuevas), estables en 3 corridas; `npm run build` OK (`NewAuctionPage` en chunk propio); prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`): 8/8 OK: desde una publicación nueva se abre el asistente; valida reserva < precio inicial; "Guardar borrador" crea el borrador real; el borrador no aparece en el catálogo público y el visitante recibe 404; "Publicar subasta" lo deja Activo con cuenta regresiva de ~11 min; el backend guardó `soft_close` 120/120/3600, `proxy_enabled`, reserva oculta al público, 50.00/5.00; otra usuaria puja en la subasta recién creada.
- Riesgos/bloqueos: ninguno nuevo. Sigue pendiente `GET /listings/` (handoff a backend).
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-29 (resultado y "Mis subastas").

## 2026-10-12T22:17:40-05:00: INICIO: LX-29
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: pantalla de resultado y "Mis subastas" (como dueño / participando).
- Componentes/archivos modificados: alcance pedido por la humana ("sigamos con LX-29").
- Contrato consumido: `GET /auctions/{id}/result/`, `GET /auctions/?mine=owner|participating&status=`, `POST /auctions/{id}/cancel/` (`{reason}`, REGLAS §9), visibilidad de `contact`, `settlement_status` y `viewer.rank`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:27:20-05:00: CIERRE: LX-29
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-29.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/packages/auction/AuctionResultPage.tsx`, `src/packages/my-auctions/{MyAuctionsPage,MyBidsPage}.tsx`, `src/features/auctions/{AuctionList.tsx,links.ts}`, pruebas `src/packages/my-auctions/lx29.test.tsx`.
  - Modificados: `src/app/buildRoutes.tsx` (`/subastas/:id/resultado` público; `/mis-subastas` con `auction.manage_own`; `/mis-pujas` con `bid.place`), `src/app/AppLayout.tsx` (menú "Mis subastas"), `src/packages/user/UserPanelPage.tsx` (resumen real), `src/packages/auction/AuctionDetailPage.tsx` ("Ver resultado" y cancelación del dueño con motivo), `src/features/auctions/{api,types,AuctionCard}.ts(x)`, `README.md`.
- Decisiones/supuestos:
  - El resultado se muestra tal como lo entrega el backend por audiencia; el frontend no calcula ganador ni revela nada adicional. Contacto solo si llega `contact` (REGLAS §10).
  - Pestaña activa en la URL (`?estado=`); listas con polling de 15 s.
  - Cancelación del dueño solo se ofrece cuando REGLAS §9 la permite; el backend tiene la última palabra (`INVALID_STATE_TRANSITION`).
  - Fuera de alcance: liquidación y calificación (`PATCH /settlement/`, `POST /rating/`) y "Seguimiento" (LX-38).
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 13 archivos / 115 pruebas en verde (13 nuevas), estables en 3 corridas; `npm run build` OK (chunks propios de resultado, mis subastas y mis pujas); prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`), en dos fases con una subasta real de 2 min 15 s: 13/13 OK: "Mis subastas" lista y filtra por pestaña; cancelación real de una programada con motivo; carla puja y la ve en "Mis pujas" y "Mi actividad"; al cerrar, el detalle ofrece "Ver resultado" por polling; visitante ve precio final sin contacto; carla ve "¡Ganaste!" y el email de beto; "Mis pujas → Terminadas" lleva al resultado; beto ve el contacto de carla; la cancelada muestra el motivo al dueño.
- Riesgos/bloqueos: ninguno nuevo. Sigue pendiente `GET /listings/` (handoff a backend).
- Handoff/siguiente paso: commit + PR (Fase 2 de frontend completa: LX-27, LX-28, LX-29). Siguiente FE: Fase 3 (LX-35 puja automática y soft close en la UI, LX-38 notificaciones, seguimiento y reportes).

## 2026-10-12T22:28:30-05:00: INICIO: LX-35
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: UI de máximo proxy (con explicación), aviso de extensión, campana de notificaciones, seguir subasta.
- Componentes/archivos modificados: alcance pedido por la humana (Fase 3, LX-35).
- Contrato consumido: `GET|PUT /auctions/{id}/proxy-limit/`, `PUT|DELETE /auctions/{id}/watch/`, `GET /notifications/?unread=true`, `POST /notifications/read/` (`{ids}`|`{all:true}`), `GET /auctions/?mine=watching`, `soft_close` y `ends_at` de `live/`; códigos `PROXY_NOT_ENABLED`, `PROXY_LIMIT_DECREASE_NOT_ALLOWED`, `BID_BELOW_MINIMUM`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:37:42-05:00: CIERRE: LX-35
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-35.
- Componentes/archivos modificados (todo en `frontend/` salvo docs):
  - Nuevos: `src/features/auctions/{ProxyLimitPanel,WatchButton,ExtensionNotice}.tsx`, `src/features/notifications/{api,messages}.ts`, `src/features/notifications/NotificationBell.tsx`, `src/packages/notifications/NotificationsPage.tsx`, `src/packages/my-auctions/WatchingPage.tsx`, pruebas `src/features/auctions/phase3.test.tsx`.
  - Modificados: `src/packages/auction/AuctionDetailPage.tsx`, `src/app/{AppLayout,buildRoutes}.tsx` (campana; `/notificaciones` con `notification.read_own`; `/seguimiento` con `watchlist.manage_own`), `src/packages/user/UserPanelPage.tsx` (sección "Subastas que sigo"), `src/features/auctions/api.ts`, `src/test/fakeServer.ts`, `README.md`.
  - Docs: `documentacion/06-ia/handoffs/backend.md` (incluir `title` en `data` de notificaciones).
- Decisiones/supuestos:
  - Máximo proxy: solo se pide y muestra el PROPIO (`GET /proxy-limit/`); validación en cliente de "solo subir" y mínimo como ayuda; sin `Idempotency-Key` (el contrato no la exige en `proxy-limit`).
  - Aviso de extensión derivado de `ends_at` de `live/` (patrón de React "ajustar estado al cambiar una prop", sin efectos).
  - Seguir: actualización optimista del detalle en caché y reversión si falla.
  - Campana con `page_size=1` (solo interesa `count`); notificaciones con texto por tipo y tipo desconocido con texto genérico; los de cierre enlazan al resultado.
  - Reportar (LX-38) queda para su tarea.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 14 archivos / 125 pruebas en verde (10 nuevas), estables en 3 corridas; `npm run build` OK; prettier OK.
  - E2E Chromium con tres usuarios contra backend real (Postgres local + `seed_demo`), subasta de 2 min con proxy y soft close: 14/14 OK: explicación visible; carla sigue la subasta; carla fija máximo $100 (puja automática de $40); diego puja $45 y la automática de carla responde al instante; `proxy-limit` de diego no revela el máximo de carla (null); carla ve "Cierre extendido" por polling y el `ends_at` real se extendió; diego fija $200 y gana con $105; carla pasa a "Te superaron"; campana con no leídas; `/notificaciones` muestra la notificación; "Marcar todas" deja la campana sin contador; `/seguimiento` lista la subasta.
- Riesgos/bloqueos: texto genérico "en una subasta" hasta que backend incluya `title` (handoff). LX-36 (revisión de seguridad del máximo proxy) queda para SEC.
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-38 (modal "Reportar").

## 2026-10-12T22:38:50-05:00: INICIO: LX-38
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: modal "Reportar" en subasta, publicación y perfil.
- Componentes/archivos modificados: alcance pedido por la humana ("sigamos").
- Contrato consumido: `POST /reports/` (`ReportInput`: `target_type` auction|listing|user, `reason` fraud|prohibited_item|misleading|other, `detail` ≤ 500; 10/día y uno por objeto), `GET /users/{id}/`; códigos `ALREADY_REPORTED`, `LIMIT_REACHED`, `RATE_LIMITED`, `NOT_FOUND`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: el detalle público no expone `listing_id` (no se puede reportar la publicación desde la interfaz).
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:44:55-05:00: CIERRE: LX-38
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-38.
- Componentes/archivos modificados (todo en `frontend/` salvo docs):
  - Nuevos: `src/components/ui/modal.tsx`, `src/features/reports/{api.ts,ReportButton.tsx}`, `src/packages/profile/PublicProfilePage.tsx` (`/usuarios/:id`, público), pruebas `src/features/reports/reports.test.tsx`.
  - Modificados: `src/packages/auction/AuctionDetailPage.tsx` (botón "Reportar subasta"; el vendedor enlaza a su perfil), `src/app/buildRoutes.tsx`, `README.md`.
  - Docs: `documentacion/06-ia/handoffs/backend.md` (exponer `listing_id` en el detalle para reportar publicaciones).
- Decisiones/supuestos:
  - Modal propio accesible (sin `alert/confirm` ni librerías nuevas): `role="dialog"`, `aria-modal`, foco atrapado, Escape y clic en el fondo cierran, foco vuelve al botón.
  - "Otro motivo" exige al menos 10 caracteres de detalle (solo UX; el backend no lo exige).
  - `ALREADY_REPORTED` se presenta como aviso informativo, no como error.
  - Visible solo con `report.create` (staff no la tiene), nunca sobre la propia subasta o el propio perfil, ni en borradores.
  - Perfil público: nombre, reputación y "en LANCEX desde"; nunca email (matriz de visibilidad). El listado de subastas del vendedor necesitaría un filtro por vendedor que el catálogo no tiene.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 15 archivos / 132 pruebas en verde (7 nuevas); `npm run build` OK; prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`): 8/8 OK: modal accesible; reporte real de la subasta de beto; segundo intento → "Ya reportaste esta subasta"; perfil público de beto sin email; reporte real del usuario; el moderador ve ambos reportes en `GET /moderation/reports/?status=open` y no ve el botón "Reportar".
- Riesgos/bloqueos: reportar publicación pendiente de `listing_id` (handoff).
- Handoff/siguiente paso: commit + PR (Fase 3 de frontend completa: LX-35 y LX-38). Siguiente FE según el plan: Fase 4 (LX-42, sobre cerrado).

## 2026-10-12T22:46:00-05:00: INICIO: LX-42
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: pantalla de oferta sellada (sin datos ajenos) y resultado con ranking.
- Componentes/archivos modificados: alcance pedido por la humana (Fase 4).
- Contrato consumido: `GET|PUT|DELETE /auctions/{id}/sealed-offer/` (PUT con `Idempotency-Key`; `{amount}` → `{amount, submitted_at, active_offer_count}`), `GET /auctions/{id}/bids/` en sellado (vacío antes del cierre; ranking `rank`, `amount`, `bidder`, `is_winner`, `bidder_identity` para el dueño), `GET /result/` (`offer_count`, `viewer.rank`); REGLAS §6.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-12T22:58:36-05:00: CIERRE: LX-42
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-42.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/features/auctions/{SealedOfferPanel,SealedRanking}.tsx`, pruebas `src/features/auctions/sealed.test.tsx`.
  - Modificados: `src/packages/auction/AuctionDetailPage.tsx` (panel de oferta en sellado activo; ranking en lugar del historial; "Ingresa para ofertar"), `src/packages/auction/AuctionResultPage.tsx` (ranking al cierre), `src/features/auctions/{api,types}.ts`, `README.md`.
- Decisiones/supuestos:
  - Solo se pide y muestra la oferta PROPIA y `active_offer_count`; sin indicador de liderazgo en sellado (PANTALLAS §3) aunque el backend envíe `viewer_is_leader`.
  - Reemplazar exige confirmación explicando que pierde prioridad en empate (REGLAS §6); retirar también se confirma.
  - `Idempotency-Key` nueva por intento y la misma al reintentar tras fallo de red (igual que las pujas).
  - El ranking se pinta tal como llega por audiencia; el frontend no ordena ni calcula ganador.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 16 archivos / 140 pruebas en verde (8 nuevas), estables en 3 corridas; `npm run build` OK; prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`), sobre cerrado real de 2 min 20 s, en dos fases: 11/11 OK: explicación visible; validación de oferta mínima; carla oferta $95; diego oferta $90 y la reemplaza por $120 con confirmación; carla ve "2 ofertas" por polling; el importe de diego no aparece en la página de carla; sin "Vas ganando/Te superaron"; al cierre el público ve $120 y 2 ofertas sin ranking; carla ve puesto 2 con "Tú" y "Postor 2"; beto (dueño) ve las identidades y el contacto de diego.
- Riesgos/bloqueos: ninguno. La revisión de no fuga en API/logs/auditoría es LX-43 (SEC).
- Handoff/siguiente paso: commit + PR. Siguiente FE según el plan: Fase 5 (LX-53, B2B: organizaciones, necesidades y subasta inversa).
