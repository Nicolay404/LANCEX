# Aplicar migraciones al Supabase compartido (guía para el rol de base de datos)

Proyecto: `lancex` · ref `sikzfznkirzpjpqsjfsd` · pooler de sesión `aws-1-us-west-2.pooler.supabase.com:5432`.
Contexto: [ADR-0003](../01-arquitectura/decisiones/ADR-0003-ESQUEMA-SQL-SIN-MIGRACIONES-DJANGO.md), [ADR-0007](../01-arquitectura/decisiones/ADR-0007-RLS-CON-POLITICA-PARA-LANCEX-APP.md), [GESTION-DEL-ESQUEMA.md](GESTION-DEL-ESQUEMA.md).

## 0. Requisitos (una vez)

1. Aceptar la invitación al proyecto en Supabase.
2. Pedir la contraseña de `postgres` por el canal privado y guardarla en el gestor de contraseñas. **Nunca** en archivos, chats ni capturas.
3. Instalar la Supabase CLI. En Windows, la forma más simple:

   ```powershell
   # con Scoop (https://scoop.sh)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   supabase --version
   ```

4. `supabase login` (abre el navegador).

## 1. Actualizar tu rama y revisar el SQL

```powershell
git checkout main
git pull
# Llevar lo de main a tu rama de rol:
git checkout db-lancex
git merge main
git push origin db-lancex
```

Revisa `supabase/migrations/20261011180000_baseline_lancex.sql` contra `MODELO-DE-DATOS-INICIAL.md`. Para probarlo en tu PC (Docker Desktop abierto):

```powershell
docker run -d --name lancex-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:17
.\scripts\db\apply_local.ps1
```

## 2. Aplicar al proyecto compartido (solo desde `main`)

```powershell
git checkout main
git pull
.\scripts\db\push_supabase.ps1
```

El script verifica que estés en `main` actualizado, vincula el proyecto, muestra un *dry-run* y **solo aplica si escribes `APLICAR`**. La CLI te pedirá la contraseña de `postgres`.

## 3. Contraseña del rol de la aplicación

En el dashboard → **SQL Editor**:

```sql
ALTER ROLE lancex_app WITH PASSWORD '<genera una nueva y larga en el gestor>';
```

Compártela por el canal privado. Cada integrante la pone en su `backend/.env`:

```env
DATABASE_URL=postgresql://lancex_app.sikzfznkirzpjpqsjfsd:<contraseña>@aws-1-us-west-2.pooler.supabase.com:5432/postgres
```

Si la contraseña tiene `@ : / # ? %`, codifícala (por ejemplo `@` → `%40`), o genera una solo con letras y números.

## 4. Verificar

En el SQL Editor:

```sql
SET ROLE lancex_app;
SHOW search_path;                       -- lancex, public
SELECT count(*) FROM lancex.app_user;   -- 0, sin error de permisos
RESET ROLE;
```

Desde el backend: `python manage.py check --database default`.

Registrar en `documentacion/06-ia/bitacoras/database.md`: fecha/hora real, salida de `supabase migration list` y resultado de la verificación.

## Nunca

- Ejecutar SQL de cambios de esquema a mano en el SQL Editor (solo el `ALTER ROLE ... PASSWORD` de arriba).
- Editar una migración ya aplicada: se crea una nueva con `supabase migration new <nombre>`.
- Aplicar desde una rama que no sea `main`.
