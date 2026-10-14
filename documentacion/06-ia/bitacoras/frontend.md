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

## 2026-10-12T23:05:00-05:00: INICIO: LX-62
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: indicador de fase de vela, precio provisional y pantalla de verificación.
- Componentes/archivos modificados: alcance pedido por la humana.
- Contrato consumido: `candle` del detalle (`window_start`, `window_s`, `commitment`, `in_window`, `price_is_provisional`, `notice`, `close_at`), `counted` del historial, `GET /auctions/{id}/candle-proof/` (`409 NOT_REVEALED_YET` antes del cierre, `MECHANISM_MISMATCH` sin vela); algoritmo de `apps/auctions/domain/closing/candle.py` y `scripts/verify_candle.py`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: fechas del backend con microsegundos (JS `Date` solo ms).
- Handoff/siguiente paso: implementar.

## 2026-10-12T23:31:59-05:00: CIERRE: LX-62
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana)
- Objetivo: LX-62.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/lib/candleVerify.ts` (+ pruebas), `src/features/auctions/{CandlePhase.tsx,candleWindow.ts}`, `src/packages/candle/CandleVerifyPage.tsx` (`/subastas/:id/verificar-vela`, público, lazy) y sus pruebas.
  - Modificados: `src/packages/auction/AuctionDetailPage.tsx` (fase de vela, precio provisional, "Termina a más tardar en", "Vas primero por ahora"), `src/features/auctions/BidHistory.tsx` ("No contó"), `src/packages/auction/AuctionResultPage.tsx` (enlace a verificar), `src/lib/serverClock.ts` (`useServerNow`), `src/app/buildRoutes.tsx`, `README.md`.
- Decisiones/supuestos:
  - La verificación no confía en el servidor: recalcula con los datos revelados y además compara el compromiso de la prueba con el que se mostró públicamente antes del cierre.
  - Comparación en microsegundos con BigInt (`isoToMicros`) para coincidir exactamente con Python.
  - La entrada a la ventana se calcula con la hora del servidor cada segundo (no con `in_window` del momento de la carga).
  - En la ventana, el líder ve un aviso de que su primer lugar es provisional (no "Vas ganando").
- Pruebas ejecutadas y resultado real:
  - Vector generado con el dominio real del backend (`commitment_of`, `close_instant`): el navegador reproduce compromiso e instante exactos y detecta semilla alterada, instante alterado en 1 µs y compromiso publicado distinto.
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc --noEmit` y `tsc -b --noEmit` OK; `npm test -- --run` 18 archivos / 150 pruebas en verde (10 nuevas); `npm run build` OK (`CandleVerifyPage` en chunk propio); prettier OK.
  - E2E Chromium contra backend real (Postgres local + `seed_demo`), subasta por vela real de 5 min 40 s con ventana de 5 min, en dos fases: 8/8 OK: fase normal con cuenta regresiva y "Termina a más tardar en"; compromiso visible; carla puja antes de la ventana; al entrar a la ventana aparecen "Fase de vela" y "Precio provisional" sin recargar; diego puja dentro de la ventana; tras el cierre, la página de verificación confirma las 3 comprobaciones con la semilla real revelada (instante 04:24:31.465508Z); historial sin pujas "No contó" porque ambas fueron anteriores al instante (el caso "No contó" está cubierto en pruebas de componente).
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-53 (B2B).

## 2026-10-13T07:26:20-05:00: INICIO: LX-53
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: B2B: organizaciones, miembros, necesidades, subasta inversa, inscripción/calificación de proveedores y sala de ofertas.
- Componentes/archivos modificados: alcance pedido por la humana.
- Contrato consumido: handoffs a Frontend de LX-50/51/54 (2026-10-12T20:13), cierre de huecos por rol (2026-10-12T23:55) y auditoría (2026-10-13T00:03).
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno al inicio.
- Handoff/siguiente paso: implementar.

## 2026-10-13T08:14:16-05:00: CIERRE: LX-53
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana). Base: HEAD `8bdaf6f` (incluye `f0355a5` y `5759fa6`).
- Objetivo: LX-53.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/features/organizations/{types,api,OrganizationForm}`, `src/features/reverse/{types,api,format,orgs,NeedSummary,ReverseOfferPanel}` + `b2b.test.tsx`, `src/packages/org/{OrganizationsPage,OrgOverview,MembersPage,OrgProfilePage}.tsx`, `src/packages/org-buyer/{NewNeedPage,NeedPage,QualificationPage}.tsx`, `src/packages/org-supplier/RegistrationPage.tsx`.
  - Modificados: `src/packages/org/OrgHomePage.tsx` (pestañas y subrutas por capacidades de la organización), `src/packages/org-buyer/BuyerSection.tsx`, `src/packages/org-supplier/SupplierSection.tsx`, `src/packages/auction/AuctionDetailPage.tsx` (ficha de la necesidad, aviso legal, reglas de la inversa, sala de oferta, "Calificar proveedores"), `src/features/auctions/{AuctionList,AuctionCard,BidHistory,api,types}` (`mechanism`/`organization`, `registrations_pending`, historial de ofertas inversas), `src/features/notifications/{api,messages}.ts` (`organization_verified`/`organization_rejected`), `src/lib/money.ts` (`reverseTotal`, `isValidUnitPriceInput`), `src/app/{buildRoutes,AppLayout}.tsx` (`/organizaciones`), `src/app/routing.test.tsx`, `README.md`.
- Decisiones/supuestos:
  - Rutas: `/organizaciones`; `/org/:orgId` (resumen), `/miembros`, `/perfil`, `/compras` (necesidades, `necesidades/nueva`, `necesidades/:id`, `subastas/:id/calificacion`), `/oportunidades` (`inscripciones`, `:id/inscripcion`). Cada subruta existe solo con la capacidad de ESA organización; lo demás es 404. Una organización pendiente no ve Compras ni Oportunidades.
  - Sala: vista previa del total con BigInt igual que el backend; antes de enviar se pide el total oficial (`reverse-quote`) y se confirma; cambiar un valor obliga a recalcular. `Idempotency-Key` nueva por intento, reutilizada solo tras fallo de red.
  - No se muestran estados guardados de subasta que pueden no ser el efectivo (`auction.status` en necesidades e inscripciones): se enlaza al detalle.
  - Transferir propiedad: la contraseña solo vive en el estado del formulario y se borra tras el intento.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc -b --noEmit` OK; `npm test -- --run` 19 archivos / 162 pruebas en verde (12 nuevas en `b2b.test.tsx`); `npm run build` OK (`OrgHomePage`, `OrganizationsPage`, `BuyerSection`, `SupplierSection` en chunks propios); prettier OK.
  - E2E Chromium contra el backend real de HEAD `8bdaf6f` (Postgres local, migraciones de `supabase/migrations` + `seed_demo`), 17/17 OK: ana registra organización (pendiente, sin Compras/Oportunidades), agrega a beto, `ALREADY_MEMBER` al repetir; carla publica necesidad con requisito, crea y publica la inversa (inicio +4 min); diego se inscribe declarando cumplimiento; el panel de compras lista la necesidad y "1 inscripción por revisar"; carla admite; antes del inicio diego ve "Admitida"; al empezar aparece el formulario sin recargar; total sobre el presupuesto se avisa sin enviar; `reverse-quote` confirma $995,00 (24.5 × 40 + 15) y la oferta se acepta; historial con desglose propio; ofertar siendo líder muestra `ALREADY_LEADING`; "Mis inscripciones" y "Oportunidades" muestran Admitida; carla ve "Proveedor 1" sin desglose ni formulario. (Una corrida intermedia chocó con el límite de 5 logins/min y con el throttle de pujas al ofertar dos veces en el mismo segundo: se separaron los pasos.)
- Riesgos/bloqueos: ninguno bloqueante; dos observaciones para ARQ en `handoffs/backend.md`.
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-73 (imágenes, liquidación y calificación, admin) y LX-78 (moderación, incluye verificación de organizaciones).

## 2026-10-13T09:42:15-05:00: INICIO: pendientes de ARQ (vistas personales)
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: conectar lo del handoff a Frontend de 2026-10-12T23:30 (`/mis-publicaciones`, `/panel`, `/mis-pujas`, `/cuenta`, perfil público, "Reportar publicación", `watchers_count`) y el texto de `report_resolved` (handoff de 23:55).
- Componentes/archivos modificados: alcance pedido por la humana.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-13T09:59:23-05:00: CIERRE: pendientes de ARQ (vistas personales)
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: pendientes de ARQ.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/features/me/{types,api}.ts` y `me.test.tsx`.
  - Modificados: `src/packages/listings/MyListingsPage.tsx`, `src/packages/user/UserPanelPage.tsx`, `src/packages/my-auctions/MyBidsPage.tsx` (+ `lx29.test.tsx`), `src/packages/account/AccountPage.tsx`, `src/packages/profile/PublicProfilePage.tsx`, `src/packages/auction/AuctionDetailPage.tsx`, `src/features/listings/{api,types}.ts`, `src/features/auctions/{AuctionList,api,types}.ts(x)` (`seller`, `listing_id`, `watchers_count`), `src/features/auth/api.ts` (`updateProfile` parcial), `src/api/types.ts` (`bio`, `location_city`), `src/features/notifications/{api,messages}.ts`, `README.md`.
- Decisiones/supuestos:
  - El resumen de operaciones muestra siempre `operations.notice`: LANCEX no procesa pagos ni guarda saldos.
  - `/mis-pujas` solo pinta datos propios (`my_last_bid`, `my_proxy_max`, `my_sealed_offer`); las terminadas enlazan al resultado.
  - Perfil: PATCH solo de lo cambiado; borrar presentación o ciudad envía `null`. Sesiones: se muestra el id derivado, nunca la clave.
  - Estados guardados de `latest_auction` no se muestran como estado: se enlaza al detalle.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc -b --noEmit` OK; `npm test -- --run` 20 archivos / 168 pruebas en verde (6 nuevas, 1 adaptada); `npm run build` OK; prettier OK.
  - E2E Chromium contra el backend de HEAD `8bdaf6f` (Postgres local + `seed_demo`, no Supabase), 11/11 OK: beto ve sus publicaciones demo desde `GET /listings/`; puja en una subasta de ana; "Reportar publicación" envía el reporte; `/panel` muestra "Vas ganando: 1" y el aviso de operaciones; `/mis-pujas` muestra "Vas ganando" y su última puja; guarda presentación y ciudad; con dos sesiones abiertas, "Cerrar sesión en los demás dispositivos" deja solo la actual y la otra pierde el acceso; el registro muestra "Pujaste por …"; el perfil público muestra presentación, ciudad y sus subastas; la dueña ve cuántas personas siguen su subasta y no puede reportarla.
- Riesgos/bloqueos: ninguno. Imágenes (LX-73) siguen esperando el bucket `listing-images`.
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-78 (moderación) o LX-73 (liquidación, calificación y admin).

## 2026-10-13T10:03:40-05:00: INICIO: LX-78
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: paquete de moderación (bandeja, verificación de organizaciones, reportes, vista interna de subasta, ficha de usuario).
- Componentes/archivos modificados: alcance pedido por la humana.
- Contrato consumido: `/moderation/summary|reports|reports/{id}/resolve|auctions/{id}|auctions/{id}/cancel|users/{id}|users/{id}/suspend|organizations|organizations/{id}|organizations/{id}/decision/` (LX-77 y handoff 2026-10-12T23:55).
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: implementar.

## 2026-10-13T10:12:24-05:00: CIERRE: LX-78
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: LX-78.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/features/moderation/{types,api}.ts` + `moderation.test.tsx`; `src/packages/moderation/{Inbox,OrganizationsReviewPage,ReportsPage,AuctionModerationPage,UserFilePage,shared}.tsx`.
  - Modificados: `src/packages/moderation/ModerationHomePage.tsx` (subrutas por capacidad), `src/packages/auction/AuctionDetailPage.tsx` (enlace "Vista de moderación"), `src/app/routing.test.tsx`, `README.md`.
- Decisiones/supuestos:
  - Toda acción de staff pide motivo o nota (≥ 3) y confirmación; el backend la registra en auditoría.
  - Resolver un reporte: "descartar" envía `dismissed` + `none`; cancelar subasta o suspender envía `actioned`. Cancelar solo se ofrece en reportes de subastas.
  - No se ofrece suspender lo que el backend rechazará (a uno mismo, a un admin, ni a un moderador si quien actúa no es admin); el backend lo valida igual.
  - Se pinta solo lo que manda el backend: nunca máximos automáticos; ofertas selladas solo tras la revelación.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc -b --noEmit` OK; `npm test -- --run` 21 archivos / 174 pruebas en verde (6 nuevas, 1 adaptada); `npm run build` OK (`ModerationHomePage` en chunk propio); prettier OK.
  - E2E Chromium como `moderador@demo` contra el backend de HEAD `8bdaf6f` (Postgres local + `seed_demo`), 11/11 OK: bandeja con organizaciones pendientes y reportes abiertos; ficha de organización con miembros y email; verificación con nota; vista de moderación de la subasta reportada con auditoría; reporte de subasta descartado; reporte de usuario resuelto suspendiendo a diego; ficha de diego "Suspendida" sin botón de suspender; diego recibe `403 ACCOUNT_SUSPENDED` al iniciar sesión; el moderador cancela una subasta con motivo y el detalle público la muestra cancelada.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR. Siguiente FE: LX-73 (liquidación y calificación, administración; imágenes cuando exista el bucket).

## 2026-10-13T12:36:38-05:00: INICIO: LX-73
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: liquidación y calificación tras el cierre, imágenes de publicaciones y paquete de administración.
- Componentes/archivos modificados: alcance pedido por la humana.
- Contrato consumido: `PATCH /auctions/{id}/settlement/`, `POST /auctions/{id}/rating/`, `viewer.can_rate|my_rating` y `winner_pseudonym` del resultado, `/listings/{id}/images/*`, `/admin/users|users/{id}/reactivate|users/{id}/role|categories|categories/{id}|audit-events|system-health/`.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: el bucket `listing-images` aún no existe en Supabase (BD).
- Handoff/siguiente paso: implementar.

## 2026-10-13T12:50:08-05:00: CIERRE: LX-73
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: LX-73.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/packages/auction/RatePage.tsx` (`/calificar/:auctionId`, lazy), `src/features/listings/{ListingImages.tsx,upload.ts}`, `src/features/admin/api.ts` + `lx73.test.tsx`, `src/packages/admin/{UsersPage,CategoriesPage,AuditPage,SystemHealthPage}.tsx`.
  - Modificados: `src/packages/admin/AdminHomePage.tsx` (subrutas por capacidad; `/admin` lleva a la primera disponible), `src/packages/auction/AuctionResultPage.tsx` (ganador seudonimizado, liquidación, calificar), `src/packages/listings/EditListingPage.tsx` (imágenes), `src/features/{auctions,listings}/api.ts`, `src/features/auctions/types.ts`, `src/app/buildRoutes.tsx`, `README.md`.
- Decisiones/supuestos:
  - Liquidación y calificación son definitivas: se confirman antes de enviar; "no se concretó" exige motivo.
  - La subida va directo del navegador a la URL firmada (sin cookies, sin CSRF, sin claves) y el backend verifica los metadatos reales al confirmar.
  - Cambio de rol: la contraseña del admin solo vive en el formulario y se borra tras el intento; el backend aplica último admin, `OPEN_ACTIVITY` y step-up.
  - Auditoría: fechas en `datetime-local` (hora de Ecuador) convertidas a ISO con `-05:00`.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc -b --noEmit` OK; `npm test -- --run` 22 archivos / 181 pruebas en verde (7 nuevas); `npm run build` OK (`AdminHomePage` y `RatePage` en chunks propios); prettier OK.
  - E2E Chromium contra el backend de HEAD `8bdaf6f` (Postgres local + `seed_demo`), 11/11 OK: admin reactiva a diego y diego vuelve a entrar; categoría "Música E2E" con slug `musica-e2e` creada y desactivada; salud del sistema con el latido de `close_due_auctions`; tras el cierre real de una subasta de beto ganada por carla, beto registra "Concretada" y califica a carla (5) sin poder repetir; carla no ve la liquidación y califica a beto (4); la reputación de beto se actualiza; la auditoría filtrada muestra los 2 `rating_submitted`. (Una corrida chocó con el límite de 5 logins/min; se reordenaron los pasos.)
  - Imágenes: solo pruebas de componente (flujo de 3 pasos, validación de tipo y `STORAGE_UNAVAILABLE`); sin E2E real porque el bucket `listing-images` no existe todavía.
- Riesgos/bloqueos: subida real de imágenes pendiente de que BD cree el bucket privado `listing-images` y comparta `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
- Handoff/siguiente paso: commit + PR. Pendientes FE: LX-74 (E2E Playwright en CI) y probar imágenes cuando exista el bucket.

## 2026-10-13T13:00:43-05:00: VERIFICACIÓN: LX-73 imágenes contra Supabase
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit.
- Objetivo: probar la subida real de imágenes ahora que BD creó el bucket privado `listing-images`.
- Componentes/archivos modificados: ninguno en el código. Maria configuró `SUPABASE_URL` (sin `/rest/v1`), `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_IMAGES_BUCKET` en su `backend/.env` (no versionado; claves no compartidas en el chat).
- Pruebas ejecutadas y resultado real (laptop de Maria, backend contra Supabase compartido):
  - `python manage.py shell -c "...get_storage().signed_upload_url('healthcheck/prueba.png')..."` → `POST /storage/v1/object/upload/sign/listing-images/...` 200 y `Storage OK`. (Un primer intento dio 404 porque la URL incluía `/rest/v1`.)
  - En la app, como Ana: nueva publicación → imagen subida desde "Editar" → `/mis-publicaciones` muestra la portada con la URL firmada de lectura.
- Riesgos/bloqueos: queda en `listing-images/healthcheck/` el objeto de la prueba de firma, si llegó a crearse (la firma por sí sola no sube archivo).
- Handoff/siguiente paso: ninguno para BD. Siguiente FE: LX-74 (E2E en CI).

## 2026-10-13T13:02:00-05:00: INICIO: LX-74 y vista de solo lectura de publicaciones
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: E2E Playwright de los recorridos principales de cada modalidad (PLAN LX-74, PRUEBAS-Y-SEGURIDAD §7) y abrir en solo lectura las publicaciones bloqueadas por una subasta.
- Componentes/archivos modificados: alcance pedido por la humana. `.github/workflows/ci.yml` es de ARQ (LX-09): no se toca, se deja handoff.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: límites del backend (login 5/min por IP, 120 peticiones/min por usuario) con pruebas en paralelo.
- Handoff/siguiente paso: implementar.

## 2026-10-13T13:27:12-05:00: CIERRE: LX-74 y vista de solo lectura de publicaciones
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: LX-74 + mejora de `/mis-publicaciones`.
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `playwright.config.ts`, `tsconfig.e2e.json`, `.gitignore` (sesiones y reportes de Playwright), `e2e/{global-setup,support}.ts`, `e2e/{ascending,sealed,candle,reverse}.spec.ts`.
  - Modificados: `package.json` / `package-lock.json` (`@playwright/test` 1.63.0 exacta; script `e2e`), `vite.config.ts` (Vitest solo corre `src/**/*.test.*`), `tsconfig.json` (referencia a `tsconfig.e2e.json`), `.prettierignore`, `src/packages/listings/MyListingsPage.tsx` (título enlazado y botón "Ver" en publicaciones bloqueadas; la página de edición ya las muestra en solo lectura), `src/features/me/me.test.tsx`, `README.md`.
- Decisiones/supuestos:
  - Preparación por API (crear publicación/subasta) e interacción por la interfaz (pujar, ofertar, inscribirse, calificar, liquidar, verificar); cada prueba espera el cierre real del job.
  - Un login por usuario en `global-setup` (límite de 5/min por IP); esperas anónimas y páginas en blanco mientras se espera (límite de 120/min por usuario).
  - Las pruebas no tocan Supabase ni secretos: contraseña demo por variable de entorno.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `npm run lint` 0 errores/avisos; `tsc -b --noEmit` OK (incluye `e2e/`); `npm test -- --run` 22 archivos / 181 pruebas en verde; `npm run build` OK; prettier OK.
  - `npm run e2e` contra el backend de HEAD `8bdaf6f` (Postgres local + `seed_demo` + `runserver` + `close_due_auctions --loop 5`), dos corridas seguidas: **4/4 en verde en 5.7 min** cada una (sellado 2.4–2.5 min, ascendente 2.6–2.7 min, inversa 4.3 min, vela 5.5 min). Una primera corrida falló 2/4 por `429 RATE_LIMITED` (polling de varias páginas del mismo usuario); se corrigió con las esperas anónimas y las páginas en blanco.
- Riesgos/bloqueos: el job de CI depende de ARQ (handoff en `handoffs/backend.md`).
- Handoff/siguiente paso: commit + PR. Frontend del plan completo.

## 2026-10-13T13:35:00-05:00: INICIO: rediseño visual UX/UI
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`
- Objetivo: rediseño visual a partir de una referencia de plantilla de subastas aportada por la humana (héroe verde oliva, CTA naranja, palabra destacada en serif itálica, tarjetas con "Lote #" y cuenta regresiva en bloques). Alcance elegido: base + pantallas clave; modo oscuro automático.
- Componentes/archivos modificados: solo presentación en `frontend/`; sin cambios de API, rutas ni reglas.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: cambios de texto/estructura pueden romper pruebas que buscan por texto.
- Handoff/siguiente paso: implementar.

## 2026-10-13T13:54:46-05:00: CIERRE: rediseño visual UX/UI
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: rediseño visual (base + pantallas clave, modo oscuro automático).
- Componentes/archivos modificados (todo en `frontend/`):
  - Nuevos: `src/components/Logo.tsx`, `src/features/auctions/{Hero,CountdownChips}.tsx`, `src/features/auctions/{auctionArt,useRemaining}.ts`, `src/packages/auction/Gallery.tsx`.
  - Modificados: `src/index.css` (tokens de color verde/naranja, modo oscuro por `prefers-color-scheme`, tipografías, `.accent-word`, movimiento reducido), `src/components/ui/{alert,button,input,modal,native-select,textarea}.tsx`, `src/app/AppLayout.tsx` (cabecera fija con logo y pie de marca), `src/features/notifications/NotificationBell.tsx`, `src/features/auctions/{AuctionCard,CatalogPage,StatusBadge}.tsx`, `labels.ts`, `src/features/auth/AuthCard.tsx`, `src/packages/auction/AuctionDetailPage.tsx`, `src/packages/user/UserPanelPage.tsx`, `package.json` / `package-lock.json` (`@fontsource-variable/plus-jakarta-sans` y `@fontsource/dm-serif-display` 5.3.0, autoalojadas: sin CDN externo).
- Decisiones/supuestos:
  - Sin fotos reales en la referencia del catálogo: las tarjetas sin portada usan un degradado e icono por modalidad.
  - La cuenta regresiva en bloques sigue usando la hora del servidor; los bloques son `aria-hidden` y el texto accesible es uno solo.
  - Contraste AA del texto blanco sobre naranja y verde; acento lima con color fijo para que no se pierda en modo oscuro.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `tsc -b --noEmit` OK; `npm run lint` OK; prettier OK; Vitest 22 archivos / 181 pruebas en verde; `npm run build` OK.
  - `npm run e2e` contra backend local (HEAD `8bdaf6f`): 4/4 en verde (5.7 min).
  - Capturas en claro y oscuro de catálogo, ingreso, detalle y panel revisadas.
- Riesgos/bloqueos: hay que correr `npm install` para las tipografías nuevas.
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T07:13:34-05:00: INICIO: rediseño oscuro premium (negro y azul eléctrico)
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, base `b8039ba`
- Objetivo: llevar la interfaz a la nueva referencia de la humana (tema oscuro premium: #0D0D0D, #1E1E1E, azul #0052FF y blanco). Decisiones de la humana: mantener la marca LANCEX con la X, solo modo oscuro, y agregar en la portada banners destacados, píldoras por categoría y "Cómo funciona". Testimonios y blog no se agregan: no hay datos reales en el backend.
- Componentes/archivos modificados: solo presentación en `frontend/`; sin cambios de API, rutas ni reglas.
- Pruebas ejecutadas y resultado real: pendiente.
- Riesgos/bloqueos: la portada hace dos consultas extra al catálogo (activas y por categoría).
- Handoff/siguiente paso: implementar.

## 2026-10-14T07:31:02-05:00: CIERRE: rediseño oscuro premium (negro y azul eléctrico)
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: tema oscuro negro/azul y portada ampliada.
- Componentes/archivos modificados (todo en `frontend/src/`):
  - Nuevos: `features/auctions/HomeShowcase.tsx` (destacadas con cuenta regresiva, en vivo, en vivo por categoría con píldoras de `/categories/`, cómo funciona), `features/auctions/TimerPill.tsx` (reloj HH:MM:SS con la hora del servidor).
  - Modificados: `index.css` (tokens solo oscuros, `--link` para texto azul legible, retícula `.grid-surface`), `components/Logo.tsx` (X blanca y azul), `components/ui/{button,alert}.tsx`, `app/AppLayout.tsx` (cabecera con "Crear subasta" según `auction.create_personal`, pie negro), `features/auctions/{Hero,AuctionCard,CatalogPage,StatusBadge,auctionArt,labels}`, `features/auth/AuthCard.tsx`, `features/me/types.ts` y colores claros sueltos en `CandlePhase`, `ProxyLimitPanel`, `SealedRanking`, `AuctionDetailPage`, `AuctionResultPage`, `QualificationPage`, `NotificationsPage`, `UserPanelPage`, `UsersPage`, `SystemHealthPage`, `Inbox`, `UserFilePage`.
  - Prueba: `features/auctions/auctions.test.tsx` (el catálogo se revisa dentro de su región; nueva prueba de la portada).
- Decisiones/supuestos:
  - `text-primary` pasa a `text-link` (#6B97FF): el azul #0052FF como texto sobre negro no llega a AA; se usa solo como relleno de botones (blanco sobre #0052FF ≈ 6,5:1).
  - El badge de estado activo dice "En vivo"; el filtro "Estado" sigue con las etiquetas de siempre.
  - Sin fotos en el catálogo (el contrato no las trae): las tarjetas usan arte por modalidad.
- Pruebas ejecutadas y resultado real:
  - Cloud, Node 22.22.0: `tsc -b --noEmit` OK; `npm run lint` OK; prettier OK; Vitest 22 archivos / 182 pruebas en verde; `npm run build` OK.
  - `npm run e2e` contra backend local (HEAD `8bdaf6f`, `seed_demo`): 4/4 en verde (5.6 min).
  - Capturas revisadas: portada completa, detalle, ingreso y panel.
- Riesgos/bloqueos: ninguno nuevo.
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T07:45:23-05:00: CIERRE: logo oficial de LANCEX
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: usar el logo entregado por la humana (X de trazos paralelos azul marino y azul).
- Componentes/archivos modificados: `frontend/src/components/Logo.tsx` (versión vectorial del logo; nuevo `LogoMark` y opción `showName`), `frontend/public/favicon.svg` (ícono de pestaña sobre fondo negro). Los trazos azul marino del original van en blanco por el tema oscuro.
- Pruebas ejecutadas y resultado real: `npm run lint` OK; Vitest 182/182 en verde; `npm run build` OK; capturas de cabecera e ingreso revisadas.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T12:43:56-05:00: CIERRE: fotos ilustrativas por categoría
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: mostrar fotos por enlace (decisión de la humana: foto por categoría).
- Componentes/archivos modificados (`frontend/src/`): nuevo `features/auctions/categoryPhotos.ts` (fotos de Unsplash por categoría, enlazadas a su CDN); `AuctionCard`, `Hero` (mosaico con fotos), `HomeShowcase` (foto en los banners) y `packages/auction/Gallery.tsx` (sin fotos propias muestra la de la categoría con la leyenda "Imagen ilustrativa de la categoría"; con fotos propias usa siempre las de la publicación).
- Decisiones/supuestos: `GET /auctions/` no trae fotos, así que en tarjetas y banners la foto es de la categoría (la inversa sin categoría usa la de insumos). Las fotos se cargan con `referrerPolicy="no-referrer"` y `loading="lazy"`.
- Pruebas ejecutadas y resultado real: prettier y lint OK; Vitest 182/182 en verde; `npm run build` OK; capturas de portada y detalle revisadas (fotos servidas desde el navegador de la humana porque el entorno cloud no llega a Unsplash).
- Riesgos/bloqueos: la foto de categoría puede no coincidir con el artículo (p. ej. bicicleta en Vehículos). Para fotos reales en el catálogo haría falta que `GET /auctions/` devuelva la portada de la publicación (pedido a backend, no hecho).
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T12:50:04-05:00: CIERRE: diseño a ancho completo
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: que cabecera, contenido y pie ocupen casi todo el ancho de la pantalla.
- Componentes/archivos modificados (`frontend/src/`): `app/AppLayout.tsx` (contenedores de `max-w-7xl` a `max-w-[1920px]` con márgenes laterales de 16 a 56 px según el ancho), `index.css` (punto de quiebre `3xl` en 112rem) y `features/auctions/CatalogPage.tsx` (6 columnas en el catálogo desde `3xl`).
- Pruebas ejecutadas y resultado real: typecheck, lint y prettier OK; Vitest 182/182 en verde; `npm run build` OK; capturas a 1366 y 1920 px revisadas.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T15:25:03-05:00: CIERRE: cabecera más grande
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: agrandar la cabecera.
- Componentes/archivos modificados (`frontend/src/`): `app/AppLayout.tsx` (alto 80 px, menú a 15 px, botones, selector de contexto y "Salir" de 44 px), `components/Logo.tsx` (tamaño `lg` para la cabecera: símbolo de 40 px y nombre en `text-2xl`), `features/notifications/NotificationBell.tsx` (campana de 44 px).
- Pruebas ejecutadas y resultado real: lint y prettier OK; Vitest 182/182 en verde; `npm run build` OK; capturas de la cabecera con sesión a 1400 y 1920 px, en una sola línea.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T15:36:07-05:00: CIERRE: portada distinta con sesión iniciada
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: con sesión iniciada, reemplazar el héroe "Descubre y puja en subastas exclusivas" por otro diseño.
- Componentes/archivos modificados (`frontend/src/features/auctions/`): nuevo `WelcomePanel.tsx` (saludo según la hora con el nombre, accesos según capacidades: Crear subasta, Mis pujas, Mis publicaciones, Explorar en vivo; y cuatro cifras de `GET /me/summary/` solo con `bid.place`: vas ganando, te superaron, mis subastas activas, avisos sin leer); `Hero.tsx` (con sesión muestra `WelcomePanel`; el héroe queda para visitantes); `auctions.test.tsx` (prueba nueva).
- Pruebas ejecutadas y resultado real: typecheck, lint y prettier OK; Vitest 183/183 en verde; `npm run build` OK; capturas con sesión a 1400 y 1920 px revisadas.
- Riesgos/bloqueos: ninguno (reutiliza la misma consulta del panel, misma clave de caché).
- Handoff/siguiente paso: commit + PR.

## 2026-10-14T15:43:20-05:00: CIERRE: rediseño de Mi actividad (`/panel`)
- Humano responsable: Maria (FE)
- Herramienta/modelo IA (si se conoce): Claude (Cowork), modelo configurado claude-opus-5-5
- Rama y commit: `frontend-lancex`, sin commit (lo hace la humana).
- Objetivo: mejorar la interfaz de Mi actividad.
- Componentes/archivos modificados: `frontend/src/packages/user/UserPanelPage.tsx` (encabezado con accesos a Mis pujas y Mis subastas; aviso destacado de notificaciones sin leer; tarjetas "Mis pujas" y "Mis subastas" con cifras con icono y color; resumen de operaciones con montos grandes, etiqueta de liquidaciones pendientes y la nota informativa; secciones "Subastas que sigo" y "Mis subastas en vivo" con 4 tarjetas y estados vacíos con enlace). Mismos datos y endpoints (`/me/summary/`, catálogo con `mine`).
- Pruebas ejecutadas y resultado real: typecheck y lint OK; Vitest 183/183 en verde (las pruebas de `/panel` siguen pasando sin cambios); `npm run build` OK; captura a 1600 px revisada.
- Riesgos/bloqueos: ninguno.
- Handoff/siguiente paso: commit + PR.
