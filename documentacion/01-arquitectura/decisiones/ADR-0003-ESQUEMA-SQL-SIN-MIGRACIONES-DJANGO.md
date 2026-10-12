# ADR-0003: Esquema gestionado en SQL, sin migraciones de Django

- **Estado:** aceptada.
- **Fecha:** 2026-10-11.
- **Decisores:** equipo LANCEX (definida por arquitectura; se reabre solo con una ADR nueva).
- **Reemplaza:** la mención "Django ORM y migraciones versionadas" de ADR-0001, ADR-0002 y documentos previos.

## Contexto

La base de datos vive en un único proyecto Supabase compartido por los tres integrantes, y cada uno ejecuta su backend Django en local. Si cada backend ejecuta `makemigrations`/`migrate` desde su rama, la tabla `django_migrations` y el esquema real se desincronizan y una persona puede romper la base de las otras dos. Además, queremos que el esquema (restricciones, triggers, grants, RLS) sea visible y revisable como SQL, sin depender del framework.

## Decisión

1. **La fuente de verdad del esquema son archivos SQL versionados** en `supabase/migrations/`, creados y aplicados con la **Supabase CLI**.
2. **Django no crea ni modifica el esquema.** Todos los modelos de LANCEX usan `class Meta: managed = False` y un `db_table` explícito que coincide con la tabla SQL.
3. **Las apps de LANCEX no tienen carpeta `migrations/`.** En `settings` se desactivan las migraciones de todas las apps:

   ```python
   MIGRATION_MODULES = {app.rsplit(".", 1)[-1]: None for app in INSTALLED_APPS}
   ```

4. **Prohibido** ejecutar contra cualquier base compartida: `makemigrations`, `migrate`, `flush`, `sqlflush`, `loaddata` sobre tablas reales ni `createsuperuser`. Estos comandos tampoco se usan para preparar la base de pruebas.
5. Las tablas que Django necesita por sí mismo (por ejemplo `django_session`) también se crean con SQL, copiando la estructura exacta que espera Django.
6. Se usa **un esquema PostgreSQL propio, `lancex`**, no `public`. La Data API de Supabase solo expone los esquemas configurados (por defecto `public`), así que las tablas del dominio no quedan expuestas al navegador.
7. **Dos roles de base de datos:**
   - `postgres` (propietario): solo para aplicar migraciones SQL. Su contraseña la usa únicamente quien ejecuta `supabase db push`.
   - `lancex_app`: rol con el que se conecta Django. Solo DML (`SELECT/INSERT/UPDATE/DELETE` según la tabla), **sin DDL**. Esto impide a nivel de base que Django o una IA alteren el esquema por accidente.
8. Las pruebas automatizadas usan un **PostgreSQL local efímero** (Docker) al que se le aplican los mismos archivos SQL, en orden. Ver `documentacion/07-operacion/GESTION-DEL-ESQUEMA.md`.

## Reglas para escribir migraciones SQL

- Un archivo nuevo por cambio: `supabase migration new <descripcion_corta>`. Nombre en `snake_case`.
- **Nunca editar una migración que ya se aplicó** en el proyecto compartido. Para corregir, se crea otra.
- SQL **portable a PostgreSQL estándar**: no depender de esquemas internos de Supabase (`auth`, `storage`) para que el mismo archivo funcione en local y en CI. Si se necesita mencionar roles de Supabase (`anon`, `authenticated`), el script local de arranque los crea vacíos.
- Estados y tipos enumerados como `text` + `CHECK`, no `CREATE TYPE ... AS ENUM` (más fácil de evolucionar).
- Dinero en `numeric(12,2)`; instantes en `timestamptz`; identificadores `uuid` con `gen_random_uuid()`.
- Cada tabla nueva incluye en la misma migración: comentarios (`COMMENT ON`), índices necesarios, `GRANT` explícitos a `lancex_app` y `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` sin políticas (defensa en profundidad).
- `audit_event` es append-only: `lancex_app` solo tiene `INSERT, SELECT` y un trigger rechaza `UPDATE/DELETE`.
- Cambios destructivos (borrar columna o tabla, cambiar tipo) se hacen en dos pasos: primero el código deja de usarla, luego una migración posterior la elimina.

## Flujo de un cambio de esquema

1. Rama de tarea (`feat/db/<issue>-<tema>`).
2. `supabase migration new ...` y escribir el SQL.
3. Aplicarlo en el PostgreSQL local y correr las pruebas.
4. Actualizar en el mismo PR: modelo Django (`managed = False`), `MODELO-DE-DATOS-INICIAL.md` y, si cambia algo visible, el contrato de API.
5. Revisión obligatoria de una persona de backend y otra de base de datos.
6. Tras el merge a `main`, **solo el responsable de base de datos** ejecuta `supabase db push` contra el proyecto compartido y registra el resultado en su bitácora.

## Alternativas consideradas

- **Migraciones de Django contra la base compartida:** descartada por los conflictos entre ramas descritos arriba y porque oculta triggers, grants y RLS.
- **Migraciones de Django solo para apps de Django (`auth`, `sessions`):** descartada para no tener dos sistemas de migración conviviendo.
- **Un proyecto Supabase por persona:** descartada; el equipo quiere un único lugar con datos compartidos.
- **Herramientas tipo Alembic o Flyway:** funcionarían, pero la Supabase CLI ya registra el historial en el propio proyecto y no añade otra dependencia.

## Consecuencias

- (+) El esquema es explícito, revisable y no depende de qué rama tenga cada persona.
- (+) `lancex_app` sin DDL convierte la regla en una restricción técnica, no solo en una norma.
- (-) Los modelos Django pueden desviarse del SQL. Mitigación: prueba de contrato que hace `SELECT` de todas las columnas de cada modelo contra la base de pruebas (ver `PRUEBAS-Y-SEGURIDAD.md`).
- (-) El runner de pruebas no puede crear tablas a partir de modelos `managed = False`. Mitigación: se sobrescribe el fixture `django_db_setup` de `pytest-django` para usar la base local ya preparada con SQL.
- (-) No se usa `django.contrib.admin`; el equipo inspecciona datos con el Table Editor de Supabase (ver ADR-0004).
