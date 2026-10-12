# ADR-0004: Entorno de ejecución, autenticación, tiempo real y librerías

- **Estado:** aceptada.
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX.

## Contexto

- Frontend y backend se ejecutan **en local** en la laptop de cada integrante. No hay hosting de aplicación.
- La nube se limita a **Supabase** (PostgreSQL y Storage) y **Firebase** (Firestore para logs).
- Los tres backends locales comparten **la misma base de datos**: tres relojes, tres procesos de cierre y tres fuentes de peticiones sobre los mismos datos.

## Decisiones

### 1. Topología

```text
Laptop de cada integrante                          Nube
┌─────────────────────────────────────┐     ┌────────────────────────────┐
│ Navegador → Vite :5173              │     │ Supabase                   │
│              │ proxy /api → :8000   │     │  ├─ PostgreSQL (esquema    │
│ Django :8000 ─────────────────────────────▶│  │   lancex, rol lancex_app)│
│   │ (pooler modo sesión, TLS)       │     │  └─ Storage (imágenes)     │
│   └─ QueueHandler ──────────────────────────▶ Firebase: Firestore logs  │
└─────────────────────────────────────┘     └────────────────────────────┘
```

### 2. Base de datos compartida

- Un proyecto Supabase, esquema `lancex`, rol de aplicación `lancex_app` (ADR-0003).
- Conexión por el **pooler en modo sesión** (IPv4). `CONN_MAX_AGE = 60` y `CONN_HEALTH_CHECKS = True`.
- **Reloj único:** toda decisión temporal usa `now()` o `clock_timestamp()` de PostgreSQL. Está prohibido comparar contra `timezone.now()` en reglas de negocio. El servicio `TimeSource` expone `db_now()`.
- **Cierre concurrente:** cualquiera de los tres backends puede ejecutar el job de cierre; la operación es idempotente y usa `SELECT ... FOR UPDATE SKIP LOCKED` (ADR-0005).
- **Datos de prueba manuales** en la base compartida se marcan con el prefijo `[DEV-<nombre>]` en títulos para no confundirse.
- Proyecto Supabase gratuito: se pausa tras un periodo sin actividad. Quien vea el proyecto pausado lo reactiva desde el dashboard.

### 3. Autenticación: sesión de Django + CSRF

- Modelo de usuario propio `accounts.User` (`AbstractBaseUser`, `managed = False`, tabla `lancex.app_user`). Login por email.
- `SESSION_ENGINE = "django.contrib.sessions.backends.db"` sobre la tabla `lancex.django_session` (creada por SQL). Sesiones revocables desde el servidor.
- DRF con `SessionAuthentication`. Sin JWT.
- El frontend llama siempre a rutas relativas `/api/...`; **Vite hace de proxy** a `http://localhost:8000`. Para el navegador todo es mismo origen, así que:
  - No se necesita CORS ni `django-cors-headers`.
  - Cookies `HttpOnly`, `SameSite=Lax`.
  - `CSRF_TRUSTED_ORIGINS = ["http://localhost:5173"]` (el proxy cambia el `Host`).
  - El frontend obtiene la cookie `csrftoken` con `GET /api/v1/auth/csrf/` y la envía en la cabecera `X-CSRFToken` en cada petición mutable.
- Hash de contraseñas: el predeterminado de Django (PBKDF2). Longitud mínima 10 y validadores de Django activos.
- Roles de plataforma: `user`, `moderator` y `admin` (columna `platform_role`), más roles contextuales por organización. Autorización por capacidades calculadas en cada petición: ver ADR-0006 y `ROLES-Y-PERMISOS.md`.
- Sesión con expiración absoluta de 12 h (`SESSION_COOKIE_AGE = 43200`), rotación de clave al iniciar sesión y revocación de todas las sesiones del usuario al suspenderlo, cambiarle el rol o cambiar su contraseña.
- Caché `DatabaseCache` sobre `lancex.django_cache` (creada por SQL) para que el throttling y el bloqueo de login se compartan entre los tres backends.
- **No se usa** `django.contrib.admin` ni `PermissionsMixin` (requerirían tablas de permisos). Para inspeccionar datos se usa el Table Editor de Supabase en modo lectura. Las acciones de administración de la plataforma son endpoints propios bajo `/api/v1/admin/`.
- Rate limiting con throttling de DRF: login 5/min por IP y bloqueo de 15 min tras 5 fallos por cuenta, registro 3/min por IP, pujas 30/min por usuario (y 1/s por usuario y subasta), reportes 10/día, resto 120/min por usuario.

### 4. Tiempo real: polling con versión

- Cada subasta tiene `version` (`bigint`) que se incrementa en cada cambio visible.
- `GET /api/v1/auctions/{id}/live/` devuelve el estado mínimo visible y un `ETag` con la versión. El cliente envía `If-None-Match`; si no hay cambios, responde `304`.
- Frecuencia: 2 s en la pantalla de detalle de una subasta activa; 15 s en el catálogo; sin polling en pestañas ocultas (`refetchIntervalInBackground: false`).
- Notificaciones internas (`notification`) se consultan con polling cada 30 s.
- Sin WebSockets, Redis ni Channels. Motivo: tres backends locales independientes no pueden compartir un canal de difusión sin un broker en la nube, y el polling con 304 es suficiente para el volumen del proyecto. Reevaluar solo si se despliega un backend único.

### 5. Trabajos en segundo plano

- Comando `python manage.py close_due_auctions [--loop SEGUNDOS]`. Cada integrante puede dejarlo corriendo con `--loop 5` en otra terminal.
- La corrección **no depende** de que el comando corra: el estado efectivo se calcula en cada lectura y las pujas tardías se rechazan siempre (ADR-0005). El comando solo materializa resultados y notificaciones.
- Sin Celery.

### 6. Imágenes: Supabase Storage

- Bucket privado `listing-images`. El navegador nunca recibe claves de Supabase.
- Flujo: el frontend pide `POST /api/v1/listings/{id}/images/upload-url/` → Django valida dueño, tipo (`image/jpeg`, `image/png`, `image/webp`) y tamaño (≤ 5 MB) y devuelve una URL firmada de subida → el navegador sube directo a Storage → `POST .../images/` confirma y registra la fila. Para mostrar, la API devuelve URLs firmadas de lectura con validez de 1 hora.
- `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` solo existen en el `.env` del backend.

### 7. Librerías (fijar versión exacta al inicializar)

**Backend:** Python 3.12, Django 5.2 LTS, djangorestframework, drf-spectacular (OpenAPI), psycopg 3 (`psycopg[binary]`), django-environ, firebase-admin, supabase-py o `httpx` para URLs firmadas de Storage, pytest, pytest-django, factory-boy, ruff.

**Frontend:** Node LTS, React 19, TypeScript estricto, Vite, React Router, TanStack Query (estado del servidor y polling), React Hook Form + Zod (formularios), Tailwind CSS + shadcn/ui (componentes), openapi-typescript (tipos desde el esquema de drf-spectacular), Vitest + Testing Library, Playwright.

**Prohibidas sin ADR nueva:** Redux u otro gestor de estado global (TanStack Query + estado local bastan), Axios (se usa `fetch` con un cliente propio), librerías de UI adicionales, Celery, Channels, django-cors-headers.

### 8. Calidad de código

- Backend: `ruff check` y `ruff format`; tipado gradual con anotaciones en servicios y políticas.
- Frontend: `eslint`, `tsc --noEmit`, `prettier`.
- GitHub Actions: lint + pruebas backend (con servicio PostgreSQL y SQL aplicado) + build y pruebas frontend en cada PR a `main`.

## Consecuencias

- (+) Cero costo de hosting y despliegue; cada integrante es autónomo.
- (+) Sesión + proxy elimina CORS, JWT y almacenamiento de tokens en el navegador.
- (-) La demo depende de una laptop; se ensaya en la máquina que se usará.
- (-) Latencia a Supabase en cada consulta (Ecuador → región del proyecto). Mitigación: consultas agregadas, `select_related`, índices y el endpoint `live/` liviano.
