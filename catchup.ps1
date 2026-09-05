# ============================================================================
#  CATCHUP: Offline Messages Recovery
# ----------------------------------------------------------------------------
#  Usage:
#    .\catchup.ps1            -> recovery run
#    .\catchup.ps1 -DryRun    -> dry run audit
#    .\catchup.ps1 -Force     -> bypass lockfile
# ============================================================================

param(
    [switch]$DryRun,
    [switch]$Force,
    [int]$MaxChats = 20
)

$ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$EngineScript = Join-Path $ProjectDir "scripts\catchup_engine.js"

if (-not (Test-Path $EngineScript)) {
    Write-Error "Catchup engine script not found: $EngineScript"
    exit 1
}

$argsList = @()
if ($DryRun) { $argsList += "--dry-run" }
if ($Force)  { $argsList += "--force" }
if ($MaxChats -gt 0) { $argsList += "--max-chats"; $argsList += "$MaxChats" }

& node "$EngineScript" @argsList
exit $LASTEXITCODE
