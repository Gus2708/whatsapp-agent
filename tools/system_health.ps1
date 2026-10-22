# ============================================================================
#  SYSTEM HEALTH AUDITOR - Ecosistema Perucho (Ferreteria El Serrucho)
# ============================================================================
#  Realiza un chequeo exhaustivo de extremo a extremo:
#    1. Memoria RAM del Host Windows
#    2. Estado del Motor Docker
#    3. Contenedores (waha_agent, n8n_agent) y su consumo de memoria
#    4. Endpoint de n8n (/healthz)
#    5. Estado de sesion de WhatsApp en WAHA (/api/sessions)
#    6. Servicio de memorias Engram (puerto 7437)
#    7. Mensajes de clientes pendientes (Catchup Dry-Run)
#
#  Salida colorizada. Retorna exit 0 si todo esta OK, o exit 1 si algo fallo.
# ============================================================================

$ErrorActionPreference = "Continue"
$ProjectDir = "C:\Proyect\whatsapp-agent"
Set-Location $ProjectDir

# Cargar .env
$envFile = Join-Path $ProjectDir ".env"
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim(), 'Process')
    }
  }
}

$WahaKey = $env:WAHA_API_KEY
$WahaContainer = if ($env:WAHA_CONTAINER_NAME) { $env:WAHA_CONTAINER_NAME } else { "waha_agent" }
$N8nContainer  = if ($env:N8N_CONTAINER_NAME) { $env:N8N_CONTAINER_NAME } else { "n8n_agent" }

$overallHealthy = $true

function Print-Header([string]$title) {
  Write-Host ""
  Write-Host ("=" * 70) -ForegroundColor Cyan
  Write-Host " $title" -ForegroundColor Cyan
  Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Print-Check([string]$name, [bool]$passed, [string]$details) {
  if ($passed) {
    Write-Host " [PASS] " -ForegroundColor Green -NoNewline
    Write-Host "$name " -ForegroundColor White -NoNewline
    Write-Host "($details)" -ForegroundColor DarkGray
  } else {
    Write-Host " [FAIL] " -ForegroundColor Red -NoNewline
    Write-Host "$name " -ForegroundColor Yellow -NoNewline
    Write-Host "($details)" -ForegroundColor Red
    $script:overallHealthy = $false
  }
}

Print-Header "SISTEMA DE GUARDRAILS Y SALUD: PERUCHO WHATSAPP AGENT"

# 1. Memoria Host & WSL
try {
  $os = Get-CimInstance Win32_OperatingSystem
  $freeGb = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
  $totalGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
  $usedGb = [math]::Round($totalGb - $freeGb, 2)
  $memOk = ($freeGb -ge 0.35)
  Print-Check "Memoria Host Windows" $memOk "Total: ${totalGb}GB, Usado: ${usedGb}GB, Libre: ${freeGb}GB"

  # WSL memory check
  try {
    $wslFree = wsl.exe free -m 2>$null
    if ($wslFree) {
      $lines = $wslFree -split "`n"
      $memLine = $lines | Where-Object { $_ -match 'Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)' }
      $swapLine = $lines | Where-Object { $_ -match 'Swap:\s+(\d+)\s+(\d+)\s+(\d+)' }
      if ($memLine -match 'Mem:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)') {
        $wslAvailMb = [int]$Matches[6]
        $wslSwapUsedMb = if ($swapLine -match 'Swap:\s+(\d+)\s+(\d+)\s+(\d+)') { [int]$Matches[2] } else { 0 }
        $wslOk = ($wslAvailMb -ge 300)
        Print-Check "Memoria WSL2 VM" $wslOk "Disponible: ${wslAvailMb}MB, Swap usado: ${wslSwapUsedMb}MB"
      }
    }
  } catch {}
} catch {
  Print-Check "Memoria Host Windows" $false "Error leyendo CIM: $($_.Exception.Message)"
}

# 2. Docker Daemon
$dockerOk = $false
try {
  $v = (docker info --format '{{.ServerVersion}}' 2>$null)
  if ($LASTEXITCODE -eq 0 -and $v) {
    $dockerOk = $true
    Print-Check "Motor Docker" $true "Docker Server v$v activo"
  } else {
    Print-Check "Motor Docker" $false "Docker daemon no responde o esta detenido"
  }
} catch {
  Print-Check "Motor Docker" $false "Excepcion consultando docker info"
}

# 3. Contenedores Activos
if ($dockerOk) {
  try {
    $psOut = docker ps --format "{{.Names}}|{{.Status}}" 2>$null
    $wahaUp = $false
    $n8nUp = $false
    foreach ($line in $psOut) {
      $parts = $line -split '\|'
      if ($parts[0] -eq $WahaContainer) { $wahaUp = $parts[1].StartsWith("Up") }
      if ($parts[0] -eq $N8nContainer) { $n8nUp = $parts[1].StartsWith("Up") }
    }
    Print-Check "Contenedor WAHA ($WahaContainer)" $wahaUp "Estado: $(if ($wahaUp) {'En ejecucion'} else {'Detenido'})"
    Print-Check "Contenedor n8n ($N8nContainer)" $n8nUp "Estado: $(if ($n8nUp) {'En ejecucion'} else {'Detenido'})"
  } catch {
    Print-Check "Contenedores Docker" $false "Error consultando docker ps"
  }
} else {
  Print-Check "Contenedores Docker" $false "Omitido por Docker daemon caido"
}

# 4. n8n Endpoint /healthz
$n8nHealthOk = $false
try {
  $h = Invoke-RestMethod -Uri "http://127.0.0.1:5678/healthz" -TimeoutSec 5 -ErrorAction Stop
  if ($h.status -eq "ok") {
    $n8nHealthOk = $true
    Print-Check "Endpoint n8n (/healthz)" $true "HTTP 200 - status: ok"
  } else {
    Print-Check "Endpoint n8n (/healthz)" $false "status: $($h.status)"
  }
} catch {
  Print-Check "Endpoint n8n (/healthz)" $false "No responde: $($_.Exception.Message)"
}

# 5. WAHA Sesion de WhatsApp
$wahaSessionOk = $false
try {
  $headers = @{ "X-Api-Key" = $WahaKey; "Content-Type" = "application/json" }
  $sess = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/sessions" -Headers $headers -TimeoutSec 5 -ErrorAction Stop
  $defSess = $sess | Where-Object { $_.name -eq "default" }
  if ($defSess -and $defSess.status -eq "WORKING") {
    $wahaSessionOk = $true
    Print-Check "Sesion WAHA (WhatsApp)" $true "default -> WORKING ($($defSess.me.pushName) - $($defSess.me.id))"
  } elseif ($defSess) {
    Print-Check "Sesion WAHA (WhatsApp)" $false "default -> estado: $($defSess.status)"
  } else {
    Print-Check "Sesion WAHA (WhatsApp)" $false "Sesion default no encontrada"
  }
} catch {
  Print-Check "Sesion WAHA (WhatsApp)" $false "No responde: $($_.Exception.Message)"
}

# 6. Engram Memorias (puerto 7437)
$engramOk = $false
try {
  $conn = Get-NetTCPConnection -LocalPort 7437 -State Listen -ErrorAction SilentlyContinue
  if ($conn) {
    $engramOk = $true
    Print-Check "Servidor Engram (Memoria)" $true "Puerto 7437 escuchando en host"
  } else {
    Print-Check "Servidor Engram (Memoria)" $false "Puerto 7437 no esta escuchando"
  }
} catch {
  Print-Check "Servidor Engram (Memoria)" $false "Error verificando puerto 7437"
}

# 7. Mensajes Pendientes (Catchup Dry-Run)
$catchupOk = $false
try {
  $dryOut = node scripts/catchup_engine.js --dry-run 2>&1
  $mCount = -1
  foreach ($line in $dryOut) {
    if ($line -match 'Chats con mensajes pendientes detectados:\s*(\d+)') {
      $mCount = [int]$Matches[1]
      break
    }
  }
  if ($mCount -eq 0) {
    $catchupOk = $true
    Print-Check "Bandeja de Mensajes WhatsApp" $true "0 mensajes desatendidos"
  } elseif ($mCount -gt 0) {
    Print-Check "Bandeja de Mensajes WhatsApp" $true "$mCount mensajes pendientes detectados (en cola de atencion)"
  } elseif ($dryOut -match "Hay otra instancia de catchup corriendo") {
    $catchupOk = $true
    Print-Check "Bandeja de Mensajes WhatsApp" $true "Barrido de catchup en ejecucion activa"
  } else {
    Print-Check "Bandeja de Mensajes WhatsApp" $false "Salida inesperada del catchup: $($dryOut -join ' ')"
  }
} catch {
  Print-Check "Bandeja de Mensajes WhatsApp" $false "Error ejecutando catchup dry run: $($_.Exception.Message)"
}

Print-Header "RESUMEN FINAL"
if ($overallHealthy) {
  Write-Host " TODOS LOS SISTEMAS OPERATIVOS Y PROTEGIDOS POR GUARDRAILS [OK]" -ForegroundColor Green
  exit 0
} else {
  Write-Host " SE DETECTARON COMPONENTES DEGRADADOS O CAIDOS [REQUIERE ATENCION]" -ForegroundColor Red
  exit 1
}
