# Configuración local

Cada integrante ejecuta frontend y backend en su laptop, conectados al proyecto Supabase compartido y a Firestore (ADR-0004). Las versiones exactas se fijan en `backend/requirements.txt` y `frontend/package-lock.json` al inicializar (tareas LX-04 y LX-07).

## Requisitos

- Git.
- Python 3.12.
- Node.js LTS.
- Supabase CLI (solo quien aplica migraciones la necesita para `db push`; todos para `migration new`).
- Docker Desktop (PostgreSQL local para pruebas).
- Acceso al proyecto Supabase y al proyecto Firebase (invitación del responsable de BD/arquitectura).

## Secretos: dónde viven

| Secreto | Quién lo tiene | Dónde |
|---|---|---|
| Contraseña de `lancex_app` | Los 3 | `backend/.env` (`DATABASE_URL`) |
| Contraseña de `postgres` | Solo responsable de BD | Solo al ejecutar `supabase db push` |
| JSON de cuenta de servicio de Firebase | Los 3 | Fuera del repo, por ejemplo `~/.lancex/firebase-sa.json`; ruta en `GOOGLE_APPLICATION_CREDENTIALS` |
| `SUPABASE_SERVICE_ROLE_KEY` (Storage) | Los 3 | `backend/.env` |

Se comparten por un gestor de contraseñas o un canal privado acordado, nunca por el repo, issues, capturas, el grupo de mensajería ni prompts de IA.

## Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate   |   Linux/macOS: source .venv/bin/activate
python -m pip install -r requirements.txt
copy .env.example .env               # o cp; completar valores
python manage.py check
python manage.py runserver 8000
# en otra terminal (opcional, materializa cierres):
python manage.py close_due_auctions --loop 5
```

**No** se ejecuta `migrate` ni `makemigrations` (ADR-0003). Si `check` advierte sobre tablas inexistentes, la causa es que falta aplicar una migración SQL en Supabase: avisar al responsable de BD.

Primera vez: verificar la conexión y el `search_path`:

```bash
python manage.py dbshell -- -c "SHOW search_path; SELECT current_user;"   # requiere psql instalado
# esperado: lancex, public | lancex_app
```

## Frontend

```bash
cd frontend
npm ci
copy .env.example .env
npm run dev                          # http://localhost:5173
```

`vite.config.ts` hace proxy de `/api` a `BACKEND_URL` (por defecto `http://localhost:8000`). El frontend nunca llama directamente a `:8000` ni a Supabase.

## Base de datos de pruebas

Ver `GESTION-DEL-ESQUEMA.md`:

```bash
docker run -d --name lancex-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:<VERSION>
./scripts/db/apply_local.sh          # Windows: .\scripts\db\apply_local.ps1
cd backend && pytest
```

## Datos de demostración

```bash
python manage.py seed_demo           # solo DML, idempotente
```

## Problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| No conecta a Supabase | Cadena de conexión directa (IPv6) | Usar la del pooler en modo sesión |
| `relation "auction" does not exist` | `search_path` sin `lancex` | Revisar `ALTER ROLE` y `OPTIONS` |
| `permission denied for table` | Falta `GRANT` en la migración | Migración correctiva (BD) |
| 403 `CSRF_FAILED` | Falta cabecera o `CSRF_TRUSTED_ORIGINS` | Llamar a `/auth/csrf/` y enviar `X-CSRFToken` |
| Proyecto Supabase pausado | Inactividad en plan gratuito | Reanudar desde el dashboard |
| Logs no llegan a Firestore | Credencial o `FIRESTORE_LOGS_ENABLED` | Revisar ruta del JSON; la app sigue funcionando |
