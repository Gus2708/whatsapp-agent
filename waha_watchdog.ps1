# ── Watchdog de la sesión WhatsApp (WAHA) ──────────────────────────────────
# Verifica cada ejecución que la sesión "default" esté en WORKING. Si está
# STOPPED/FAILED, la reinicia. La autenticación persiste en el volumen Docker,
# así que NUNCA hace falta re-escanear el QR. Pensado para correr cada 2-3 min
# mediante el Programador de tareas de Windows.
#
# Registrar la tarea (una sola vez, en PowerShell como administrador):
#   $a = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"C:\Proyect\whatsapp-agent\waha_watchdog.ps1`""
#   $t = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 3)
#   Register-ScheduledTask -TaskName "WAHA Watchdog Serrucho" -Action $a -Trigger $t -RunLevel Highest -Description "Mantiene viva la sesión de WhatsApp del bot Perucho"

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
    # Todo bien; no ensuciar el log en cada corrida.
    exit 0
  }
  Write-Log "Sesión en estado '$($s.status)'. Intentando reiniciar..."
  try {
    Invoke-RestMethod -Uri "$Base/api/sessions/$Session/start" -Method POST -Headers $headers -Body "{}" -TimeoutSec 30 | Out-Null
  } catch {
    Write-Log "start devolvió: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds 6
  $s2 = Invoke-RestMethod -Uri "$Base/api/sessions/$Session" -Headers $headers -TimeoutSec 15
  Write-Log "Estado tras reinicio: $($s2.status)"
} catch {
  Write-Log "ERROR consultando WAHA (¿contenedor caído?): $($_.Exception.Message)"
}
