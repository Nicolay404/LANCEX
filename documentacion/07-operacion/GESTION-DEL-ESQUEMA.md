# Gestión del esquema de base de datos (SQL + Supabase CLI)

Decisión de origen: [ADR-0003](../01-arquitectura/decisiones/ADR-0003-ESQUEMA-SQL-SIN-MIGRACIONES-DJANGO.md). **En LANCEX no se usan migraciones de Django.**

## Estructura en el repositorio

```text
lancex/
├── supabase/
│   ├── config.toml              # generado por `supabase init`
│   └── migrations/
│       ├── 20261011180000_baseline_lancex.sql
│       └── ...                  # un archivo por cambio, nunca se edita uno aplicado
├── scripts/db/
│   ├── bootstrap_local.sql      # crea roles anon/authenticated/lancex_app en Postgres local
│   └── apply_local.(sh|ps1)     # aplica supabase/migrations/*.sql en orden al Postgres local
└── backend/                     # Django: modelos managed = False, sin carpetas migrations/
```

## Preparación (una sola vez por persona)

1. Instalar la Supabase CLI (ver referencias) y Docker Desktop (solo para el Postgres de pruebas).
2. En la raíz del repo: `supabase login` y `supabase link --project-ref <REF_DEL_PROYECTO>`.
3. Pedir al responsable de base de datos la contraseña de `lancex_app` por el canal privado acordado (gestor de contraseñas). La contraseña de `postgres` solo la tiene quien aplica migraciones.

## Crear y aplicar un cambio de esquema

```bash
# 1. Crear el archivo
supabase migration new agrega_watchlist

# 2. Probar en Postgres local (base efímera)
docker run -d --name lancex-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:<MISMA_VERSION_MAYOR_QUE_SUPABASE>
./scripts/db/apply_local.sh            # bootstrap + todas las migraciones en orden
cd backend && pytest

# 3. PR con: SQL + modelo Django (managed = False) + MODELO-DE-DATOS-INICIAL.md

# 4. Tras merge a main (solo responsable de BD)
supabase db push --dry-run
supabase db push
supabase migration list                # registrar salida en la bitácora de database
```

La versión mayor de PostgreSQL del proyecto se consulta en el dashboard de Supabase; el contenedor local debe usar la misma.

## Lo que NUNCA se hace

| Comando / acción | Motivo |
|---|---|
| `python manage.py makemigrations` / `migrate` | El esquema no lo gestiona Django. |
| `python manage.py flush` / `sqlflush` | Borra datos compartidos. |
| Editar tablas desde el Table Editor de Supabase | Cambio invisible para Git; se pierde la reproducibilidad. Solo lectura y carga de datos de demo. |
| Editar una migración ya aplicada | Rompe el historial de `supabase_migrations`. |
| Usar la contraseña de `postgres` en el `.env` de Django | Django debe conectarse como `lancex_app` (sin DDL). |
| Pruebas automatizadas contra el proyecto compartido | Choques entre personas y borrado de datos. |

## Conexión de Django

- Usar la cadena del **pooler (Supavisor) en modo sesión** que aparece en el botón *Connect* del dashboard. La conexión directa es IPv6 y muchas redes domésticas no la soportan.
- Usuario con el formato que indique el dashboard para roles propios (habitualmente `lancex_app.<REF_DEL_PROYECTO>`).
- `search_path` = `lancex,public`. Se fija en la migración base con `ALTER ROLE lancex_app SET search_path = lancex, public;` y también en `OPTIONS` de Django. Verificar en la primera conexión con `SHOW search_path;`.
- Toda hora de negocio se toma de PostgreSQL (`now()` / `clock_timestamp()`), nunca del reloj de la laptop.

## Pruebas con modelos `managed = False`

`pytest-django` no puede crear tablas para modelos no gestionados. Se sobrescribe el fixture para usar la base local ya preparada con SQL:

```python
# backend/conftest.py
import pytest

@pytest.fixture(scope="session")
def django_db_setup():
    """La base de pruebas ya existe: la crea scripts/db/apply_local con los SQL de supabase/migrations."""
    pass
```

`DATABASES` en `config/settings/test.py` apunta a `TEST_DATABASE_URL` (Postgres local). Las pruebas que necesitan commits reales (concurrencia) usan `transaction=True` y limpian sus propios datos.

**Plan B si alguien no tiene Docker el lunes:** crear su base de pruebas en un esquema propio del proyecto Supabase (`lancex_test_<nombre>`) aplicando los SQL con `search_path` a ese esquema. Es solo temporal: los tests de concurrencia serán más lentos por la latencia.

## Prueba de deriva modelo ↔ SQL (obligatoria en CI)

Para cada modelo de LANCEX se ejecuta un `SELECT` de todas sus columnas con `LIMIT 1`. Si un campo del modelo no existe en la tabla, la prueba falla. CI también falla si aparece cualquier carpeta `migrations/` dentro de `backend/apps/`.

## Estado de la implementación (LX-02 / LX-03)

- Migración base: `supabase/migrations/20261011180000_baseline_lancex.sql` (20 tablas, RLS en todas con política solo para `lancex_app`, ver ADR-0007).
- Postgres local de pruebas:

  ```powershell
  docker run -d --name lancex-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:17
  .\scripts\db\apply_local.ps1        # Linux/macOS/Git Bash: ./scripts/db/apply_local.sh
  cd backend; $env:LANCEX_REQUIRE_DB="1"; python -m pytest
  ```

  `apply_local` **borra y recrea** `lancex_test`, aplica `bootstrap_local.sql`, todas las migraciones y `local_after.sql` (contraseña local `lancex_app`, solo para pruebas). Las pruebas se conectan como `lancex_app` para validar también los grants.
- **Contraseña de `lancex_app` en Supabase:** la migración crea el rol sin contraseña. Tras `supabase db push`, el responsable de BD la fija en el SQL Editor del dashboard (nunca en Git):

  ```sql
  ALTER ROLE lancex_app WITH PASSWORD '<generada en el gestor de contraseñas>';
  ```

  y la comparte por el canal privado. Cada integrante la pone en `DATABASE_URL` de su `backend/.env` con el usuario `lancex_app.<ref>` y el host del *session pooler*.
