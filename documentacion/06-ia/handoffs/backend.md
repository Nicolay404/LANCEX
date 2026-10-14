# Handoff: Backend

## Pendiente inicial

- Las reglas están aprobadas en `REGLAS-DE-SUBASTAS.md`; el dominio puro (`auctions/domain/`) puede empezar sin base de datos.
- Seguir la estructura de módulos y el esqueleto de `place_bid` / `close_auction` de ADR-0005.
- **No crear migraciones de Django.** Si falta una columna, crear migración SQL nueva y dejar handoff a BD.
- Toda hora de negocio desde `TimeSource.db_now()`.
- Mantener drf-spectacular alineado con `CONTRATO-API-INICIAL.md`.

## Handoffs activos

- Fecha/hora: 2026-10-13T19:09:56-05:00
- Issue/PR: respuesta a los handoffs de Frontend del 2026-10-13 (rendimiento, LX-74, LX-53)
- Para rol: Backend (ARQ) — CERRADO
- Estado: resuelto en la rama `feat/architect/cuenta-y-actividad` (sin commit aún)
- Contexto: los tres puntos están atendidos; detalle en `handoffs/frontend.md` y en la bitácora de arquitectura. La región de Supabase y el uso de Docker quedan para BD (`handoffs/database.md`).
- Archivos, tablas o endpoints afectados: ver bitácora de arquitectura.
- Acción requerida: ninguna para Backend.
- Cómo validar: `tests/core/test_query_budget.py`, `tests/auctions/test_lx53_reverse_visibility.py`.

- Fecha/hora: 2026-10-13T13:31:07-05:00
- Issue/PR: rendimiento con Supabase (detectado por Frontend; rama `frontend-lancex`)
- Para rol: Backend (ARQ) y BD
- Estado: requiere revisión (la app funciona, pero cada pantalla tarda varios segundos contra Supabase)
- Contexto: con el backend local de Maria apuntando al pooler de Supabase (`aws-1-us-west-2`, ~150–200 ms por ida y vuelta desde Ecuador), `GET /api/v1/auctions/` anónimo tardó **6.8 s** (`Measure-Command`). Medido en Postgres local con `CaptureQueriesContext` (seed demo): `/categories/` 13 consultas, `/auctions/` 21 (anónimo) y 15 (con sesión), `/auctions/{id}/` 16, `/live/` 10, `/auth/me/` 12, `/me/summary/` 26, `/notifications/?unread=true` 10. **12 de las 13 consultas de `/categories/` son del rate limiting**: `CACHES` usa `DatabaseCache` y cada throttle (`anon` y `user`) hace SELECT + COUNT + BEGIN + SELECT + UPDATE + COMMIT contra `django_cache`. Con ~200 ms por consulta, solo el throttling suma ~2.4 s por petición; además `runserver` abre un hilo por petición, así que `CONN_MAX_AGE` casi no reutiliza conexiones y cada petición paga otra vez TLS + autenticación en el pooler.
- Archivos, tablas o endpoints afectados: `config/settings/*` (`CACHES`, `DEFAULT_THROTTLE_*`, `CONN_MAX_AGE`), tabla `django_cache`, presentadores con consultas por fila (`/auctions/`, `/me/summary/`).
- Acción requerida (a decidir por ARQ/BD): (1) para el throttling, un caché que no viaje a la base (p. ej. `LocMemCache` en desarrollo: el límite queda por proceso, suficiente con 3 laptops) o dejar el `DatabaseCache` solo para lo que deba compartirse; (2) revisar N+1 en el catálogo y el resumen; (3) BD: valorar mover el proyecto a una región cercana (São Paulo, `sa-east-1`) y que el desarrollo diario use el Postgres local de Docker, dejando Supabase para pruebas de integración. Frontend no cambia nada de esto.
- Cómo validar: `Measure-Command { Invoke-WebRequest http://localhost:8000/api/v1/auctions/ -UseBasicParsing }` contra Supabase antes y después; y el conteo de consultas con `django.test.utils.CaptureQueriesContext` (`/categories/` debería quedar en 1–2).

- Fecha/hora: 2026-10-13T13:27:12-05:00
- Issue/PR: LX-74 (rama `frontend-lancex`)
- Para rol: Backend (ARQ, dueño de `.github/workflows/ci.yml` por LX-09)
- Estado: requiere revisión (no bloquea; las E2E ya corren en local con `npm run e2e`)
- Contexto: el frontend tiene E2E Playwright de las 4 modalidades contra el backend real (`frontend/e2e/`, unos 6 min). Para que corran en CI hace falta un job que levante Postgres + esquema + `seed_demo` + `runserver` + `close_due_auctions` y luego `npm run e2e`. Frontend no edita `ci.yml`.
- Archivos, tablas o endpoints afectados: `.github/workflows/ci.yml` (job nuevo). Propuesta probada en local con los mismos comandos:
  ```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_USER: postgres, POSTGRES_PASSWORD: postgres, POSTGRES_DB: lancex_test }
        ports: ["54329:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres" --health-interval 5s --health-timeout 5s --health-retries 10
    env:
      PGPASSWORD: postgres
      DJANGO_SETTINGS_MODULE: config.settings.dev
      DJANGO_SECRET_KEY: ci-only-not-secret
      DATABASE_URL: postgres://lancex_app:lancex_app@localhost:54329/lancex_test
      DB_SSLMODE: disable
      DJANGO_ALLOWED_HOSTS: localhost,127.0.0.1
      CSRF_TRUSTED_ORIGINS: http://localhost:5173
      FIRESTORE_LOGS_ENABLED: "false"
      DEV_NAME: ci
      LANCEX_DEMO_PASSWORD: Ci-Demo-${{ github.run_id }}!
      E2E_DEMO_PASSWORD: Ci-Demo-${{ github.run_id }}!
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12", cache: pip, cache-dependency-path: backend/requirements.txt }
      - run: python -m pip install -r backend/requirements.txt
      - name: Esquema
        env: { PSQL: psql -h localhost -p 54329 -U postgres }
        run: bash ./scripts/db/apply_local.sh
      - name: Backend en segundo plano
        working-directory: backend
        run: |
          python manage.py seed_demo
          nohup python manage.py runserver 8000 > ../django.log 2>&1 &
          nohup python manage.py close_due_auctions --loop 5 > ../closer.log 2>&1 &
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - name: E2E
        working-directory: frontend
        run: |
          npm ci
          npx playwright install --with-deps chromium
          npm run e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-report
          path: |
            frontend/playwright-report
            frontend/test-results
            django.log
            closer.log
  ```
- Acción requerida: revisar y agregar el job (ajustar `needs` o dejarlo solo en `push` a `main` si 6 min por PR es mucho). No requiere secretos ni Supabase.
- Cómo validar: el job termina con `4 passed`; en local, los comandos del README del frontend (sección "E2E con Playwright").

- Fecha/hora: 2026-10-13T08:14:16-05:00
- Issue/PR: LX-53 (rama `frontend-lancex`)
- Para rol: Backend (ARQ)
- Estado: requiere revisión (no bloquea)
- Contexto: (1) La búsqueda del catálogo `GET /auctions/?q=` solo filtra por `listing__title`, así que una subasta inversa nunca aparece al buscar por el título de su necesidad. (2) `auction.status` en `GET /procurement-requests/{id}/`, `GET /organizations/{id}/procurement-requests/` y `GET /organizations/{id}/registrations/` es el estado guardado, no el efectivo (una inversa ya empezada sigue diciendo `scheduled` hasta que el job la materializa); el frontend no lo muestra y enlaza al detalle.
- Archivos, tablas o endpoints afectados: `apps/auctions/services/queries.py` (`catalog`, filtro `q`), `apps/catalog/services/procurement.py` (`auction_info`), `apps/auctions/api/me_views.py` (`OrganizationRegistrationsView`).
- Acción requerida: decidir si `q` busca también en `procurement_request__title` y si esos `status` deben ser el efectivo (`evaluate(...)`). Si cambian, avisar a Frontend para mostrar el estado.
- Cómo validar: con `seed_demo`, `GET /auctions/?q=Resmas` devuelve la inversa demo; tras `starts_at`, `GET /organizations/{id}/registrations/` trae `active`.

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

