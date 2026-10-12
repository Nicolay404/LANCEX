#!/usr/bin/env bash
# Recrea la base de pruebas local y aplica bootstrap + supabase/migrations/*.sql en orden (LX-03).
# Uso:  ./scripts/db/apply_local.sh
# Por defecto usa el contenedor Docker "lancex-pg" (puerto 54329). En CI se define PSQL:
#   PSQL="psql -h localhost -p 54329 -U postgres" ./scripts/db/apply_local.sh
# NUNCA apuntar a Supabase: este script BORRA y recrea la base indicada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${LANCEX_TEST_DB:-lancex_test}"
CONTAINER="${LANCEX_PG_CONTAINER:-lancex-pg}"
PSQL="${PSQL:-docker exec -i $CONTAINER psql -U postgres}"

case "$DB" in
  *supabase*|postgres) echo "Base '$DB' no permitida para este script." >&2; exit 2 ;;
esac

echo "==> Recreando base $DB"
$PSQL -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE);"
$PSQL -d postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$DB\";"

run() { echo "==> $1"; $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q < "$1"; }

run "$ROOT/scripts/db/bootstrap_local.sql"
shopt -s nullglob
for f in "$ROOT"/supabase/migrations/*.sql; do run "$f"; done
run "$ROOT/scripts/db/local_after.sql"
echo "==> Listo: base $DB preparada."
