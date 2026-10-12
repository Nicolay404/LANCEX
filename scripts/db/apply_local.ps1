# Recrea la base de pruebas local y aplica bootstrap + supabase/migrations/*.sql en orden (LX-03).
# Uso:  .\scripts\db\apply_local.ps1
# Requiere el contenedor Docker "lancex-pg":
#   docker run -d --name lancex-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:17
# NUNCA apuntar a Supabase: este script BORRA y recrea la base indicada.
$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$Db = if ($env:LANCEX_TEST_DB) { $env:LANCEX_TEST_DB } else { "lancex_test" }
$Container = if ($env:LANCEX_PG_CONTAINER) { $env:LANCEX_PG_CONTAINER } else { "lancex-pg" }

if ($Db -eq "postgres" -or $Db -like "*supabase*") { throw "Base '$Db' no permitida para este script." }

function Invoke-Psql([string]$Database, [string]$Sql) {
    docker exec -i $Container psql -U postgres -d $Database -v ON_ERROR_STOP=1 -q -c $Sql
    if ($LASTEXITCODE -ne 0) { throw "psql falló: $Sql" }
}

function Invoke-SqlFile([string]$Path) {
    Write-Host "==> $Path"
    Get-Content -Raw -Encoding UTF8 $Path | docker exec -i $Container psql -U postgres -d $Db -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw "Falló al aplicar $Path" }
}

Write-Host "==> Recreando base $Db"
Invoke-Psql "postgres" "DROP DATABASE IF EXISTS `"$Db`" WITH (FORCE);"
Invoke-Psql "postgres" "CREATE DATABASE `"$Db`";"

Invoke-SqlFile (Join-Path $Root "scripts\db\bootstrap_local.sql")
Get-ChildItem (Join-Path $Root "supabase\migrations") -Filter *.sql | Sort-Object Name | ForEach-Object {
    Invoke-SqlFile $_.FullName
}
Invoke-SqlFile (Join-Path $Root "scripts\db\local_after.sql")
Write-Host "==> Listo: base $Db preparada."
