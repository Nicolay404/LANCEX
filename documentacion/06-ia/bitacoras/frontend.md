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
