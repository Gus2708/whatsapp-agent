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

try {
  $s = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
  if ($s.status -eq "WORKING") {
    # La sesion dice WORKING, pero puede estar "stale": conectada y recibiendo,
    # pero WhatsApp RECHAZA los envios (error 479 'stanza rejected / stale device
    # session'). En ese estado el bot genera respuestas que nunca llegan al cliente.
    # Detectamos esos rechazos en los logs de WAHA y reiniciamos la sesion (stop/start).
    $StateFile   = "C:\Proyect\whatsapp-agent\waha_watchdog_state.json"
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
      if (Test-Path $StateFile) {
        try { $lastFix = [datetime]((Get-Content $StateFile -Raw | ConvertFrom-Json).lastSendFix) } catch {}
      }
      if ($lastFix -and ((Get-Date) - $lastFix).TotalMinutes -lt $CooldownMin) {
        Write-Log "Detectados $rejects rechazos de envio (479) con sesion WORKING, pero en cooldown (ultimo arreglo hace < $CooldownMin min). No se reinicia."
        exit 0
      }
      Write-Log "Detectados $rejects rechazos de envio (479 'stale device session') con la sesion en WORKING. Reiniciando sesion (stop/start)..."
      foreach ($act in @("stop","start")) {
        try { Invoke-RestMethod -Uri "$Base/api/sessions/$Session/$act" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null } catch {}
        Start-Sleep -Seconds 4
      }
      try { ('{ "lastSendFix": "' + (Get-Date).ToString("o") + '" }') | Set-Content -Path $StateFile -Encoding utf8 } catch {}
      Start-Sleep -Seconds 6
      try { $s3 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15; Write-Log "Sesion reiniciada por rechazos de envio. Estado ahora: $($s3.status)" } catch {}
      exit 0
    }
    # WORKING y sin rechazos de envio -> todo bien; no ensuciar el log en cada corrida.
    exit 0
  }
  # No tocar si esta esperando escaneo de QR (requiere accion humana).
  if ($s.status -eq "SCAN_QR_CODE") {
    Write-Log "Sesion esperando escaneo de QR -- no se interviene (escanea en http://localhost:3000)."
    exit 0
  }
  # FAILED: la autenticacion quedo corrupta. Hay que limpiar (logout+stop) y
  # rearrancar; esto deja la sesion en SCAN_QR_CODE para re-escanear el QR.
  if ($s.status -eq "FAILED") {
    Write-Log "Sesion FAILED. Limpiando (logout/stop) para poder re-escanear..."
    foreach ($act in @("logout","stop")) {
      try { Invoke-RestMethod -Uri "$Base/api/sessions/$Session/$act" -Method POST -Headers $headers -Body "{}" -TimeoutSec 20 | Out-Null } catch {}
      Start-Sleep -Seconds 2
    }
    try { Invoke-RestMethod -Uri "$Base/api/sessions/$Session/start" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null } catch {}
    Write-Log "Rearranque hecho. Revisa http://localhost:3000 para escanear el QR si pide."
    exit 0
  }
  # STOPPED u otros: /start revive la sesion guardada SIN re-escanear (la auth persiste).
  # (Nunca usar /restart: ese si borra la autenticacion.)
  Write-Log "Sesion en estado '$($s.status)'. Intentando iniciar (start)..."
  try {
    Invoke-RestMethod -Uri "$Base/api/sessions/$Session/start" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null
  } catch {
    Write-Log "start devolvio: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 6
  $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
  Write-Log "Estado tras reinicio: $($s2.status)"
} catch {
  Write-Log "ERROR consultando WAHA (contenedor caido?): $($_.Exception.Message)"
}
