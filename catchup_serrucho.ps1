# ============================================================================
#  RECUPERACION DE MENSAJES PENDIENTES  (Agente "Perucho" - El Serrucho)
# ----------------------------------------------------------------------------
#  Invoca el motor autónomo de catchup (scripts/catchup_engine.js) con
#  verificación dual (WAHA + Supabase), deduplicación y protección anti-spam.
#
#  Uso:
#    .\catchup_serrucho.ps1            -> recuperación real
#    .\catchup_serrucho.ps1 -DryRun    -> prueba en seco (solo audita)
#    .\catchup_serrucho.ps1 -Force     -> fuerza ejecución saltando lockfile
# ============================================================================

param(
    [switch]$DryRun,
    [switch]$Force,
    [int]$MaxChats = 20
)

$ProjectDir = "C:\Proyect\whatsapp-agent"
$EngineScript = Join-Path $ProjectDir "scripts\catchup_engine.js"

if (-not (Test-Path $EngineScript)) {
    Write-Error "No se encontró el script del motor: $EngineScript"
    exit 1
}

$argsList = @()
if ($DryRun) { $argsList += "--dry-run" }
if ($Force)  { $argsList += "--force" }
if ($MaxChats -gt 0) { $argsList += "--max-chats"; $argsList += "$MaxChats" }

& node "$EngineScript" @argsList
exit $LASTEXITCODE
