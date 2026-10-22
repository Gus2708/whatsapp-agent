# -- Watchdog del ecosistema WhatsApp (WAHA + n8n + Catchup Autónomo) --------
# Verifica cada ejecución que:
#   1) La sesión WAHA "default" esté en WORKING (si falla, la recupera).
#   2) n8n esté activo y respondiendo en /healthz (si cae, lo recupera).
#   3) No existan mensajes desatendidos: dispara el motor de recuperación
#      automática de mensajes (catchup) tras cualquier caída o reinicio del sistema.
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
$Base      = "http://127.0.0.1:3000"
$N8nBase   = "http://127.0.0.1:5678"
$Session   = "default"
$LogFile   = Join-Path $ProjectDir "waha_watchdog.log"
$headers   = @{ "X-Api-Key" = $ApiKey; "Content-Type" = "application/json" }
$StateFile = Join-Path $ProjectDir "waha_watchdog_state.json"
$LockFile  = Join-Path $ProjectDir "waha_watchdog.lock"

# --- Concurrency Guard (evita apilamiento de ejecuciones) -------------------
if (Test-Path $LockFile) {
  try {
    $lockData = Get-Content $LockFile -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $lockPid  = [int]$lockData.pid
    $lockAge  = if ($lockData.startedAt) { (Get-Date) - [datetime]$lockData.startedAt } else { [timespan]::FromMinutes(10) }
    if ($lockPid -and (Get-Process -Id $lockPid -ErrorAction SilentlyContinue)) {
      if ($lockAge.TotalMinutes -lt 5) {
        exit 0 # Instancia activa previa en ejecución
      } else {
        # Proceso viejo colgado por más de 5 minutos: terminarlo
        Stop-Process -Id $lockPid -Force -ErrorAction SilentlyContinue
      }
    }
  } catch {}
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}

try {
  @{ pid = $PID; startedAt = (Get-Date).ToString("o") } | ConvertTo-Json -Compress | Set-Content -Path $LockFile -Encoding utf8
} catch {}

$WahaContainer = if ($env:WAHA_CONTAINER_NAME) { $env:WAHA_CONTAINER_NAME } else { "waha_agent" }
$N8nContainer  = if ($env:N8N_CONTAINER_NAME) { $env:N8N_CONTAINER_NAME } else { "n8n_agent" }

function Rotate-LogFile([string]$path, [int]$maxBytes = 5242880) {
  if (Test-Path $path) {
    try {
      $item = Get-Item $path -ErrorAction SilentlyContinue
      if ($item -and $item.Length -gt $maxBytes) {
        $archive = "$path.1"
        Move-Item -Path $path -Destination $archive -Force -ErrorAction SilentlyContinue
      }
    } catch {}
  }
}

function Write-Log($msg) {
  Rotate-LogFile $LogFile
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

function Invoke-DockerCommand([string]$arguments, [int]$timeoutSec = 10) {
  $outFile = Join-Path $env:TEMP ("dock_out_{0}.txt" -f [guid]::NewGuid().ToString("N"))
  $errFile = Join-Path $env:TEMP ("dock_err_{0}.txt" -f [guid]::NewGuid().ToString("N"))
  try {
    $p = Start-Process -FilePath "docker" -ArgumentList $arguments -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError $errFile
    if ($p.WaitForExit($timeoutSec * 1000)) {
      if ($p.ExitCode -ne 0) { return $null }
      $lines = if (Test-Path $outFile) { Get-Content $outFile } else { @() }
      $trimmed = @($lines | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
      if ($trimmed.Count -eq 0) { return $null }
      return $trimmed
    } else {
      $p.Kill()
      Write-Log "TIMEOUT: docker $arguments excedió ${timeoutSec}s."
      return $null
    }
  } catch {
    return $null
  } finally {
    Remove-Item $outFile, $errFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-State {
  $defaultState = [pscustomobject]@{
    lastSendFix          = $null
    failedStreak         = 0
    lastContainerRestart = $null
    lastPeriodicCatchup  = $null
    lastN8nRestart       = $null
    n8nFailedStreak      = 0
    dockerFailedStreak   = 0
    lastDockerHeal       = $null
  }
  if (Test-Path $StateFile) {
    try {
      $raw = Get-Content $StateFile -Raw -ErrorAction Stop
      if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
        if ($parsed) {
          foreach ($prop in $defaultState.PSObject.Properties) {
            if ($parsed.PSObject.Properties.Name -contains $prop.Name -and $null -ne $parsed.$($prop.Name)) {
              $defaultState.$($prop.Name) = $parsed.$($prop.Name)
            }
          }
          return $defaultState
        }
      }
    } catch {}
  }
  return $defaultState
}

function Save-State($st) {
  if (-not $st) { return }
  try {
    $json = $st | ConvertTo-Json -Compress
    $tmp = "$StateFile.tmp"
    Set-Content -Path $tmp -Value $json -Encoding utf8
    Move-Item -Path $tmp -Destination $StateFile -Force
  } catch {}
}

function Set-Field($st, $name, $value) {
  if (-not $st) { return }
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
    $catchupVbs = Join-Path $ProjectDir "catchup.vbs"
    if (-not (Test-Path $catchupVbs)) {
      $catchupVbs = Join-Path $ProjectDir "catchup_serrucho.vbs"
    }
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

try {
  $st = Get-State

  # --- Chequeo de Salud del Motor Docker --------------------------------------
  # Si alguno de los servicios HTTP ya está respondiendo, Docker está 100% operativo
  $wahaAlive = $false
  try {
    $testWaha = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 5
    if ($testWaha -and $testWaha.status) { $wahaAlive = $true }
  } catch {}

  $n8nAlive = $false
  try {
    $testN8n = Invoke-RestMethod -Uri "$N8nBase/healthz" -TimeoutSec 5
    if ($testN8n -and $testN8n.status -eq "ok") { $n8nAlive = $true }
  } catch {}

  if ($wahaAlive -or $n8nAlive) {
    if ([int]$st.dockerFailedStreak -gt 0) {
      Set-Field $st "dockerFailedStreak" 0
      Save-State $st
    }
  } else {
    # Ningún servicio HTTP respondió: verificar Docker a nivel de CLI y proceso
    $dockerProc = Get-Process -Name "Docker Desktop", "com.docker.backend" -ErrorAction SilentlyContinue
    $dockerVer = Invoke-DockerCommand "info --format '{{.ServerVersion}}'" 25

    if ($dockerVer -and $dockerVer.Count -gt 0) {
      if ([int]$st.dockerFailedStreak -gt 0) {
        Set-Field $st "dockerFailedStreak" 0
        Save-State $st
      }
    } else {
      $dStreak = [int]$st.dockerFailedStreak + 1
      Set-Field $st "dockerFailedStreak" $dStreak
      Save-State $st
      Write-Log "AVISO: Motor Docker y servicios no responden (racha: $dStreak, proc: $([bool]$dockerProc))."

      if ($dStreak -ge 4) {
        $lastHeal = $null
        if ($st.lastDockerHeal) { try { $lastHeal = [datetime]$st.lastDockerHeal } catch {} }
        if (-not $lastHeal -or ((Get-Date) - $lastHeal).TotalMinutes -ge 15) {
          Write-Log "Iniciando autorecuperación del motor Docker..."
          if (-not $dockerProc) {
            $dockerApp = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
            if (Test-Path $dockerApp) {
              Start-Process "cmd.exe" -ArgumentList "/c `"`"$dockerApp`"`"" -WindowStyle Hidden -ErrorAction SilentlyContinue
            }
          } else {
            Get-Process -Name "docker", "com.docker.backend", "Docker Desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 3
            $dockerApp = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
            if (Test-Path $dockerApp) {
              Start-Process "cmd.exe" -ArgumentList "/c `"`"$dockerApp`"`"" -WindowStyle Hidden -ErrorAction SilentlyContinue
            }
          }
          for ($w = 0; $w -lt 30; $w++) {
            Start-Sleep -Seconds 3
            $check = Invoke-DockerCommand "info --format '{{.ServerVersion}}'" 10
            if ($check -and $check.Count -gt 0) { break }
          }
          Set-Field $st "lastDockerHeal" ((Get-Date).ToString("o"))
          Set-Field $st "dockerFailedStreak" 0
          Save-State $st
          Invoke-DockerCommand "start $WahaContainer $N8nContainer" 20 | Out-Null
        } else {
          Write-Log "Autorecuperación de Docker en cooldown (<15 min)."
        }
      }
    }
  }

  # --- Chequeo de Salud de n8n ------------------------------------------------
  $n8nHealthy = $false
  for ($attempt = 1; $attempt -le 4; $attempt++) {
    try {
      $n8nRes = Invoke-RestMethod -Uri "$N8nBase/healthz" -TimeoutSec 15
      if ($n8nRes.status -eq "ok") { $n8nHealthy = $true; break }
    } catch {
      Start-Sleep -Seconds 3
    }
  }

  if ($n8nHealthy) {
    if ([int]$st.n8nFailedStreak -gt 0) {
      Set-Field $st "n8nFailedStreak" 0
      Save-State $st
    }
  } else {
    $n8nStreak = [int]$st.n8nFailedStreak + 1
    Set-Field $st "n8nFailedStreak" $n8nStreak
    Save-State $st
    Write-Log "AVISO: n8n no responde en $N8nBase/healthz (racha: $n8nStreak). Verificando contenedor..."

    # Verificar si el contenedor fue iniciado hace menos de 2 minutos (fase de arranque / warmup)
    $isWarmingUp = $false
    try {
      $startedStr = Invoke-DockerCommand "inspect $N8nContainer --format '{{.State.StartedAt}}'" 10
      if ($startedStr -and $startedStr[0]) {
        $startedDate = [datetime]$startedStr[0]
        if (((Get-Date).ToUniversalTime() - $startedDate).TotalSeconds -lt 120) {
          $isWarmingUp = $true
          Write-Log "n8n está en fase de arranque (uptime < 2 min). Omitiendo reinicio forzado."
        }
      }
    } catch {}

    if (-not $isWarmingUp -and $n8nStreak -ge 3) {
      $lastN8n = $null
      if ($st.lastN8nRestart) { try { $lastN8n = [datetime]$st.lastN8nRestart } catch {} }
      if (-not $lastN8n -or ((Get-Date) - $lastN8n).TotalMinutes -ge 8) {
        Write-Log "Reiniciando contenedor $N8nContainer tras $n8nStreak fallos seguidos..."
        try {
          Invoke-DockerCommand "restart $N8nContainer" 30 | Out-Null
          Set-Field $st "lastN8nRestart" ((Get-Date).ToString("o"))
          Set-Field $st "n8nFailedStreak" 0
          Save-State $st
          Start-Sleep -Seconds 25
          try {
            $n8nRes2 = Invoke-RestMethod -Uri "$N8nBase/healthz" -TimeoutSec 15
            if ($n8nRes2.status -eq "ok") {
              Write-Log "n8n recuperado con éxito tras reinicio de contenedor."
              Trigger-Catchup "Recuperación de n8n caído"
            }
          } catch {}
        } catch {
          Write-Log "ERROR reiniciando contenedor n8n: $($_.Exception.Message)"
        }
      } else {
        Write-Log "Reinicio de n8n en cooldown (<8 min)."
      }
    }
  }

  # --- Chequeo de WAHA --------------------------------------------------------
  try {
    $s = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
    
    if ($s.status -eq "WORKING") {
      $wasDown = ([int]$st.failedStreak -gt 0)
      if ($wasDown) {
        Write-Log "Sesión WAHA recuperada a WORKING tras $($st.failedStreak) fallos previos."
        Set-Field $st "failedStreak" 0
        Save-State $st
        Trigger-Catchup "Sesión WAHA recuperada tras caída"
      }

      # Revisar rechazos de envío (error 479 'stanza rejected / stale device session')
      $CooldownMin = 15
      $rejects = 0
      try {
        $logs = Invoke-DockerCommand "logs $WahaContainer --since 5m" 10
        if ($logs) {
          $rejects = @($logs | Select-String -Pattern "smax-invalid \(479\)|stanza rejected by server" | Where-Object { $_.Line -notmatch "broadcast" }).Count
        }
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

      # Barrido pasivo periódico de mensajes huérfanos (cada 20 min en estado operativo)
      $lastPeriodic = $null
      if ($st.lastPeriodicCatchup) { try { $lastPeriodic = [datetime]$st.lastPeriodicCatchup } catch {} }
      if (-not $lastPeriodic -or ((Get-Date) - $lastPeriodic).TotalMinutes -ge 20) {
        Set-Field $st "lastPeriodicCatchup" ((Get-Date).ToString("o"))
        Save-State $st
        Trigger-Catchup "Barrido pasivo periódico (cada 20 min)"
      }

      exit 0
    }

    if ($s.status -eq "SCAN_QR_CODE") {
      Write-Log "Sesión esperando escaneo de QR -- no se interviene (http://127.0.0.1:3000)."
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
      try { Invoke-DockerCommand "restart $WahaContainer" 20 | Out-Null } catch { Write-Log "docker restart fallo: $($_.Exception.Message)" }
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
    try { Invoke-DockerCommand "start $WahaContainer" 10 | Out-Null } catch {}
  }
} finally {
  Remove-Item $LockFile -Force -ErrorAction SilentlyContinue
}
