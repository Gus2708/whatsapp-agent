# -- Watchdog del ecosistema WhatsApp (WAHA + n8n + Catchup Autónomo) --------
# Verifica cada ejecución que:
#   1) La sesión WAHA "default" esté en WORKING (si falla, la recupera).
#   2) n8n esté activo y respondiendo en /healthz (si cae, lo recupera).
#   3) No existan mensajes desatendidos: dispara el motor de recuperación
#      automática de mensajes (catchup) tras cualquier caída o en barridos
#      periódicos cada 15 min.
#
# Se ejecuta cada 3 min mediante el Programador de tareas de Windows (oculto).

$ProjectDir = "C:\Proyect\whatsapp-agent"
$envFile    = Join-Path $ProjectDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
  }
}

$ApiKey    = $env:WAHA_API_KEY
$Base      = "http://localhost:3000"
$N8nBase   = "http://localhost:5678"
$Session   = "default"
$LogFile   = Join-Path $ProjectDir "waha_watchdog.log"
$headers   = @{ "X-Api-Key" = $ApiKey; "Content-Type" = "application/json" }
$StateFile = Join-Path $ProjectDir "waha_watchdog_state.json"

function Write-Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Get-State {
  if (Test-Path $StateFile) {
    try { return (Get-Content $StateFile -Raw | ConvertFrom-Json) } catch {}
  }
  return [pscustomobject]@{
    lastSendFix          = $null
    failedStreak         = 0
    lastContainerRestart = $null
    lastPeriodicCatchup  = $null
    lastN8nRestart       = $null
  }
}

function Save-State($st) {
  try { ($st | ConvertTo-Json -Compress) | Set-Content -Path $StateFile -Encoding utf8 } catch {}
}

function Set-Field($st, $name, $value) {
  if ($st.PSObject.Properties.Name -contains $name) { $st.$name = $value }
  else { $st | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
}

function Restart-Session {
  foreach ($act in @("stop","start")) {
    try { Invoke-RestMethod -Uri "$Base/api/sessions/$Session/$act" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null } catch {}
    Start-Sleep -Seconds 4
  }
}

function Trigger-Catchup([string]$reason) {
  Write-Log "Disparando recuperación de mensajes pendientes (motivo: $reason)..."
  try {
    $catchupVbs = Join-Path $ProjectDir "catchup_serrucho.vbs"
    if (Test-Path $catchupVbs) {
      Start-Process -FilePath "wscript.exe" -ArgumentList "`"$catchupVbs`""
    } else {
      $engineScript = Join-Path $ProjectDir "scripts\catchup_engine.js"
      Start-Process -FilePath "node" -ArgumentList "`"$engineScript`"" -WindowStyle Hidden
    }
  } catch {
    Write-Log "ERROR disparando catchup: $($_.Exception.Message)"
  }
}

# --- Chequeo de Salud de n8n ------------------------------------------------
$n8nHealthy = $false
try {
  $n8nRes = Invoke-RestMethod -Uri "$N8nBase/healthz" -TimeoutSec 6
  if ($n8nRes.status -eq "ok") { $n8nHealthy = $true }
} catch {}

$st = Get-State

if (-not $n8nHealthy) {
  Write-Log "AVISO: n8n no responde en $N8nBase/healthz. Verificando contenedor..."
  $lastN8n = $null
  if ($st.lastN8nRestart) { try { $lastN8n = [datetime]$st.lastN8nRestart } catch {} }
  if (-not $lastN8n -or ((Get-Date) - $lastN8n).TotalMinutes -ge 5) {
    Write-Log "Reiniciando contenedor n8n_serrucho..."
    try {
      docker restart n8n_serrucho 2>&1 | Out-Null
      Set-Field $st "lastN8nRestart" ((Get-Date).ToString("o"))
      Save-State $st
      Start-Sleep -Seconds 12
      try {
        $n8nRes2 = Invoke-RestMethod -Uri "$N8nBase/healthz" -TimeoutSec 8
        if ($n8nRes2.status -eq "ok") {
          Write-Log "n8n recuperado con éxito tras reinicio de contenedor."
          Trigger-Catchup "Recuperación de n8n caído"
        }
      } catch {}
    } catch {
      Write-Log "ERROR reiniciando contenedor n8n: $($_.Exception.Message)"
    }
  } else {
    Write-Log "Reinicio de n8n en cooldown (<5 min)."
  }
}

# --- Chequeo de WAHA --------------------------------------------------------
try {
  $s = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
  
  if ($s.status -eq "WORKING") {
    $wasDown = ($st.failedStreak -ne 0)
    if ($wasDown) {
      Write-Log "Sesión WAHA recuperada a WORKING tras $st.failedStreak fallos previos."
      Set-Field $st "failedStreak" 0
      Save-State $st
      # Disparar catchup por recuperación de caída
      Trigger-Catchup "Sesión WAHA recuperada tras caída"
    }

    # Revisar rechazos de envío (error 479 'stanza rejected / stale device session')
    $CooldownMin = 15
    $rejects = 0
    try {
      $logs = docker logs waha_serrucho --since 5m 2>&1
      $rejects = @($logs | Select-String -Pattern "smax-invalid \(479\)|stanza rejected by server" | Where-Object { $_.Line -notmatch "broadcast" }).Count
    } catch {}

    if ($rejects -ge 2) {
      $lastFix = $null
      if ($st.lastSendFix) { try { $lastFix = [datetime]$st.lastSendFix } catch {} }
      if ($lastFix -and ((Get-Date) - $lastFix).TotalMinutes -lt $CooldownMin) {
        Write-Log "Detectados $rejects rechazos (479) pero en cooldown (<$CooldownMin min)."
        exit 0
      }
      Write-Log "Detectados $rejects rechazos (479 'stale device session'). Reiniciando sesión..."
      Restart-Session
      Set-Field $st "lastSendFix" ((Get-Date).ToString("o"))
      Save-State $st
      Start-Sleep -Seconds 6
      try {
        $s3 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
        Write-Log "Sesión reiniciada. Estado: $($s3.status)"
        if ($s3.status -eq "WORKING") {
          Trigger-Catchup "Recuperación tras sesión stale (479)"
        }
      } catch {}
      exit 0
    }

    # --- Barrido periódico de mensajes desatendidos (cada 15 min) ------------
    $lastPeriodic = $null
    if ($st.lastPeriodicCatchup) { try { $lastPeriodic = [datetime]$st.lastPeriodicCatchup } catch {} }
    if (-not $lastPeriodic -or ((Get-Date) - $lastPeriodic).TotalMinutes -ge 15) {
      Set-Field $st "lastPeriodicCatchup" ((Get-Date).ToString("o"))
      Save-State $st
      Trigger-Catchup "Barrido periódico (cada 15 min)"
    }

    exit 0
  }

  if ($s.status -eq "SCAN_QR_CODE") {
    Write-Log "Sesión esperando escaneo de QR -- no se interviene (http://localhost:3000)."
    exit 0
  }

  if ($s.status -in @("STARTING","STARTED")) {
    exit 0
  }

  # FAILED / STOPPED:
  $streak = [int]$st.failedStreak + 1
  Set-Field $st "failedStreak" $streak

  if ($streak -ge 3) {
    $lastCR = $null
    if ($st.lastContainerRestart) { try { $lastCR = [datetime]$st.lastContainerRestart } catch {} }
    if ($lastCR -and ((Get-Date) - $lastCR).TotalMinutes -lt 10) {
      Write-Log "Sesión '$($s.status)' (racha $streak), reinicio de contenedor en cooldown. Stop/start..."
      Restart-Session
      Save-State $st
      exit 0
    }
    Write-Log "Sesión '$($s.status)' por $streak corridas seguidas. Reiniciando contenedor WAHA..."
    try { docker restart waha_serrucho 2>&1 | Out-Null } catch { Write-Log "docker restart fallo: $($_.Exception.Message)" }
    Set-Field $st "lastContainerRestart" ((Get-Date).ToString("o"))
    Set-Field $st "failedStreak" 0
    Save-State $st
    Start-Sleep -Seconds 15
    try {
      $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
      Write-Log "Estado tras reinicio de contenedor: $($s2.status)"
      if ($s2.status -eq "WORKING") {
        Trigger-Catchup "Recuperación tras reinicio de contenedor WAHA"
      }
    } catch {}
    exit 0
  }

  Write-Log "Sesión en estado '$($s.status)' (racha $streak). Recuperando con stop/start..."
  Restart-Session
  Save-State $st
  Start-Sleep -Seconds 6
  try {
    $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
    Write-Log "Estado tras recuperación: $($s2.status)"
    if ($s2.status -eq "WORKING") {
      Trigger-Catchup "Recuperación tras stop/start"
    }
  } catch {}

} catch {
  Write-Log "ERROR consultando WAHA (contenedor caído?): $($_.Exception.Message)"
  try { docker start waha_serrucho 2>&1 | Out-Null } catch {}
}
