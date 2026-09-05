# ============================================================================
#  WhatsApp AI Sales Agent - Automatic Boot Script
# ----------------------------------------------------------------------------
#  Starts in order:
#     1) Docker Desktop (and waits for engine response)
#     2) n8n + WAHA containers (docker compose up -d)
#     3) Engram long-term memory server (host port 7437)
#
#  IDEMPOTENT: Safe to run repeatedly (checks if already running).
# ============================================================================

$ProjectDir = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$LogFile    = Join-Path $ProjectDir "boot.log"
$EngramPort = if ($env:ENGRAM_PORT) { [int]$env:ENGRAM_PORT } else { 7437 }
$DockerExe  = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

Log "=== Starting WhatsApp AI Agent Ecosystem ==="

# 1) Docker Desktop
try {
    if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
        if (Test-Path $DockerExe) {
            Log "Starting Docker Desktop..."
            Start-Process -FilePath $DockerExe -WindowStyle Hidden
        } else {
            Log "NOTICE: Docker Desktop.exe not found at $DockerExe"
        }
    } else {
        Log "Docker Desktop is already running."
    }

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 3
    }
    if ($ready) { Log "Docker Engine READY." } else { Log "ERROR: Docker engine did not respond after ~180s." }
} catch {
    Log "ERROR starting Docker: $($_.Exception.Message)"
}

# 2) Containers WAHA + n8n
try {
    Set-Location $ProjectDir
    $vol = docker volume inspect n8n_data 2>$null
    if (-not $vol) {
        Log "Creating external volume n8n_data..."
        docker volume create n8n_data | Out-Null
    }

    Log "Starting WAHA..."
    docker compose up -d waha 2>$null
    if ($LASTEXITCODE -eq 0) { Log "WAHA: OK" } else { Log "WAHA: Failed (exit $LASTEXITCODE)" }

    Log "Starting n8n..."
    docker compose up -d n8n 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log "n8n build failed. Trying without build..."
        docker compose up -d --no-build n8n 2>$null
        if ($LASTEXITCODE -eq 0) { Log "n8n: OK (previous image)" }
        else { Log "n8n: Failed (exit $LASTEXITCODE)" }
    } else {
        Log "n8n: OK"
    }
} catch {
    Log "ERROR in docker compose: $($_.Exception.Message)"
}

# 3) Engram Server
try {
    $listening = Get-NetTCPConnection -LocalPort $EngramPort -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Log "Engram already listening on port $EngramPort."
    } else {
        $env:ENGRAM_DATA_DIR = "$env:USERPROFILE\.engram"
        $engramCmd = (Get-Command engram -ErrorAction SilentlyContinue).Source
        if (-not $engramCmd) { $engramCmd = "$env:USERPROFILE\.engram\bin\engram.exe" }
        if (Test-Path $engramCmd) {
            Log "Starting Engram on port $EngramPort..."
            Start-Process -FilePath $engramCmd -ArgumentList "serve", "$EngramPort" -WindowStyle Hidden
        } else {
            Log "NOTICE: Engram binary not found at ($engramCmd)."
        }
    }
} catch {
    Log "ERROR starting Engram: $($_.Exception.Message)"
}

# 4) Catchup pending messages
try {
    $catchupVbs = Join-Path $ProjectDir "catchup.vbs"
    if (Test-Path $catchupVbs) {
        Log "Launching background message catchup..."
        Start-Process -FilePath "wscript.exe" -ArgumentList "`"$catchupVbs`""
    }
} catch {
    Log "ERROR launching catchup: $($_.Exception.Message)"
}

# 4.5) Watchdog
try {
    $watchdogScript = Join-Path $ProjectDir "waha_watchdog.ps1"
    if (Test-Path $watchdogScript) {
        Log "Running WAHA watchdog..."
        & $watchdogScript
    }
} catch {
    Log "ERROR running watchdog: $($_.Exception.Message)"
}

# 5) Summary
Start-Sleep -Seconds 4
try {
    $names = (docker ps --format "{{.Names}} ({{.Status}})") -join " | "
    Log "Active containers: $names"
} catch {}
Log "=== Boot complete ==="
