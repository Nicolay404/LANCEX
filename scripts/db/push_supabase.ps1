# Aplica las migraciones de supabase/migrations al proyecto Supabase COMPARTIDO.
# Solo lo ejecuta el responsable de base de datos, desde `main` actualizado (ADR-0003).
# Uso (desde la raíz del repo):  .\scripts\db\push_supabase.ps1
# La CLI pedirá la contraseña de `postgres` (nunca se guarda en archivos).
$ErrorActionPreference = "Stop"
$ProjectRef = "sikzfznkirzpjpqsjfsd"

function Step([string]$Text) { Write-Host "`n==> $Text" -ForegroundColor Cyan }
function Fail([string]$Text) { Write-Host "ERROR: $Text" -ForegroundColor Red; exit 1 }

Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..\.."))

Step "Comprobando herramientas"
if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Fail "No se encontró la Supabase CLI. Instálala: https://supabase.com/docs/guides/local-development/cli/getting-started"
}
supabase --version

Step "Comprobando que estás en main actualizado"
git fetch origin --quiet
$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne "main") { Fail "Estás en '$branch'. Ejecuta: git checkout main; git pull" }
if (git status --porcelain -- supabase) { Fail "Hay cambios sin commit en supabase/. Solo se aplica lo que está en main." }
$behind = (git rev-list --count HEAD..origin/main).Trim()
if ($behind -ne "0") { Fail "Tu main está $behind commit(s) atrás. Ejecuta: git pull" }

Step "Inicializando y vinculando el proyecto (solo la primera vez)"
if (-not (Test-Path "supabase\config.toml")) { supabase init }
supabase link --project-ref $ProjectRef
if ($LASTEXITCODE -ne 0) { Fail "No se pudo vincular el proyecto." }

Step "Simulación (dry-run): esto es lo que se aplicaría"
supabase db push --dry-run
if ($LASTEXITCODE -ne 0) { Fail "Falló el dry-run." }

$answer = Read-Host "`nEscribe APLICAR para ejecutar sobre el proyecto compartido (cualquier otra cosa cancela)"
if ($answer -ne "APLICAR") { Write-Host "Cancelado. No se aplicó nada."; exit 0 }

Step "Aplicando migraciones"
supabase db push
if ($LASTEXITCODE -ne 0) { Fail "Falló db push. Revisa el error; NO edites migraciones aplicadas." }

Step "Historial de migraciones (copiar a documentacion/06-ia/bitacoras/database.md)"
supabase migration list

Write-Host "`nSiguiente paso: en el SQL Editor del dashboard ejecuta" -ForegroundColor Yellow
Write-Host "  ALTER ROLE lancex_app WITH PASSWORD '<contraseña nueva del gestor>';" -ForegroundColor Yellow
Write-Host "y compártela por el canal privado del equipo."
