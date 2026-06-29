# -- Watchdog de la sesion WhatsApp (WAHA) ----------------------------------
# Verifica cada ejecucion que la sesion "default" este en WORKING. Si esta
# STOPPED/FAILED, la reinicia. La autenticacion persiste en el volumen Docker,
# asi que NUNCA hace falta re-escanear el QR. Pensado para correr cada 2-3 min
# mediante el Programador de tareas de Windows.
#
# Registrar la tarea (una sola vez, en PowerShell como administrador):
#   $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\Proyect\whatsapp-agent\waha_watchdog.ps1`""
#   $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 3)
#   Register-ScheduledTask -TaskName "WAHA Watchdog Serrucho" -Action $a -Trigger $t -RunLevel Highest -Description "Mantiene viva la sesion de WhatsApp del bot Perucho"

# Cargar variables del archivo .env del proyecto
$envFile = "C:\Proyect\whatsapp-agent\.env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
  }
}

$ApiKey  = $env:WAHA_API_KEY
$Base    = "http://localhost:3000"
$Session = "default"
$LogFile = "C:\Proyect\whatsapp-agent\waha_watchdog.log"
$headers = @{ "X-Api-Key" = $ApiKey; "Content-Type" = "application/json" }

function Write-Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

$StateFile = "C:\Proyect\whatsapp-agent\waha_watchdog_state.json"

function Get-State {
  if (Test-Path $StateFile) {
    try { return (Get-Content $StateFile -Raw | ConvertFrom-Json) } catch {}
  }
  return [pscustomobject]@{ lastSendFix = $null; failedStreak = 0; lastContainerRestart = $null }
}
function Save-State($st) {
  try { ($st | ConvertTo-Json -Compress) | Set-Content -Path $StateFile -Encoding utf8 } catch {}
}
function Set-Field($st, $name, $value) {
  if ($st.PSObject.Properties.Name -contains $name) { $st.$name = $value }
  else { $st | Add-Member -NotePropertyName $name -NotePropertyValue $value -Force }
}

# Recuperacion NO destructiva: stop+start conservan las credenciales NOWEB (viven en
# el volumen waha_session_storage:/app/.sessions). NUNCA hacer 'logout': eso desempareja
# el dispositivo y borra la auth, forzando re-escaneo del QR. Esa era la causa del bucle
# de "FAILED -> logout -> re-escanear" cada pocos minutos.
function Restart-Session {
  foreach ($act in @("stop","start")) {
    try { Invoke-RestMethod -Uri "$Base/api/sessions/$Session/$act" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null } catch {}
    Start-Sleep -Seconds 4
  }
}

try {
  $st = Get-State
  $s = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
  if ($s.status -eq "WORKING") {
    if ($st.failedStreak -ne 0) { Set-Field $st "failedStreak" 0; Save-State $st }
    # La sesion dice WORKING, pero puede estar "stale": conectada y recibiendo,
    # pero WhatsApp RECHAZA los envios (error 479 'stanza rejected / stale device
    # session'). En ese estado el bot genera respuestas que nunca llegan al cliente.
    # Detectamos esos rechazos en los logs de WAHA y reiniciamos la sesion (stop/start).
    $CooldownMin = 15   # no reiniciar por este motivo mas de una vez cada 15 min (anti-bucle)
    $rejects = 0
    try {
      $logs = docker logs waha_serrucho --since 5m 2>&1
      # Solo rechazos de envios a CLIENTES REALES; ignoramos @broadcast/status/canales
      # (esos siempre fallan y no son sintoma de sesion stale).
      $rejects = @($logs | Select-String -Pattern "smax-invalid \(479\)|stanza rejected by server" | Where-Object { $_.Line -notmatch "broadcast" }).Count
    } catch {}

    if ($rejects -ge 2) {
      $lastFix = $null
      if ($st.lastSendFix) { try { $lastFix = [datetime]$st.lastSendFix } catch {} }
      if ($lastFix -and ((Get-Date) - $lastFix).TotalMinutes -lt $CooldownMin) {
        Write-Log "Detectados $rejects rechazos de envio (479) con sesion WORKING, pero en cooldown (ultimo arreglo hace < $CooldownMin min). No se reinicia."
        exit 0
      }
      Write-Log "Detectados $rejects rechazos de envio (479 'stale device session') con la sesion en WORKING. Reiniciando sesion (stop/start, auth conservada)..."
      Restart-Session
      Set-Field $st "lastSendFix" ((Get-Date).ToString("o")); Save-State $st
      Start-Sleep -Seconds 6
      try { $s3 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15; Write-Log "Sesion reiniciada por rechazos de envio. Estado ahora: $($s3.status)" } catch {}
      exit 0
    }
    # WORKING y sin rechazos de envio -> todo bien; no ensuciar el log en cada corrida.
    exit 0
  }
  # No tocar si esta esperando escaneo de QR (requiere accion humana real: la auth ya
  # no existe y solo un humano puede re-emparejar). El watchdog NUNCA debe provocar
  # este estado por su cuenta.
  if ($s.status -eq "SCAN_QR_CODE") {
    Write-Log "Sesion esperando escaneo de QR -- no se interviene (escanea en http://localhost:3000)."
    exit 0
  }
  # STARTING / STARTED y otros estados transitorios de (re)conexion: dejar que NOWEB
  # termine de reconectar solo. Intervenir aqui solo cortaria una reconexion legitima.
  if ($s.status -in @("STARTING","STARTED")) {
    exit 0
  }

  # FAILED / STOPPED / cualquier otro estado no sano:
  # La auth NOWEB persiste en el volumen, asi que la recuperacion es SIEMPRE no
  # destructiva (stop+start). Jamas 'logout'. Escalada por reincidencia:
  #   1-2 fallos seguidos -> reiniciar la sesion (stop+start).
  #   >=3 fallos seguidos -> reiniciar el contenedor WAHA (docker restart). Esto
  #     conserva el volumen/credenciales y limpia un proceso WAHA en mal estado
  #     (p.ej. tras el Uncaught Exception de undici al postear el webhook a n8n).
  $streak = [int]$st.failedStreak + 1
  Set-Field $st "failedStreak" $streak

  if ($streak -ge 3) {
    $lastCR = $null
    if ($st.lastContainerRestart) { try { $lastCR = [datetime]$st.lastContainerRestart } catch {} }
    if ($lastCR -and ((Get-Date) - $lastCR).TotalMinutes -lt 10) {
      Write-Log "Sesion '$($s.status)' (racha $streak), pero reinicio de contenedor en cooldown (<10 min). Reintentando stop/start."
      Restart-Session
      Save-State $st
      exit 0
    }
    Write-Log "Sesion '$($s.status)' por $streak corridas seguidas. Reiniciando contenedor WAHA (docker restart, auth conservada)..."
    try { docker restart waha_serrucho 2>&1 | Out-Null } catch { Write-Log "docker restart fallo: $($_.Exception.Message)" }
    Set-Field $st "lastContainerRestart" ((Get-Date).ToString("o"))
    Set-Field $st "failedStreak" 0
    Save-State $st
    Start-Sleep -Seconds 15
    try { $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15; Write-Log "Estado tras reinicio de contenedor: $($s2.status)" } catch { Write-Log "WAHA aun levantando tras reinicio de contenedor." }
    exit 0
  }

  Write-Log "Sesion en estado '$($s.status)' (racha $streak). Recuperando con stop/start (auth conservada)..."
  Restart-Session
  Save-State $st
  Start-Sleep -Seconds 6
  try { $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15; Write-Log "Estado tras recuperacion: $($s2.status)" } catch {}
} catch {
  Write-Log "ERROR consultando WAHA (contenedor caido?): $($_.Exception.Message)"
  # Si la API no responde, el contenedor puede estar caido. restart:unless-stopped
  # deberia revivirlo; forzamos un arranque por si quedo 'exited'.
  try { docker start waha_serrucho 2>&1 | Out-Null } catch {}
}
