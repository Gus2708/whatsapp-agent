# ==========================================
# SCRIPT DE INICIO DE FERRETERÍA EL SERRUCHO
# AUTOMATIZACIÓN DE ENGRAM Y DOCKER-COMPOSE
# ==========================================

$ErrorActionPreference = "Stop"
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Iniciando Entorno de Ferretería El Serrucho (Mene Mauroa)" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# 1. Verificar y arrancar Engram HTTP API en el host
$EngramPort = 7437
Write-Host "`n[1/3] Verificando puerto del Servidor de Memorias Engram ($EngramPort)..." -ForegroundColor Yellow

$PortCheck = Get-NetTCPConnection -LocalPort $EngramPort -ErrorAction SilentlyContinue

if ($PortCheck) {
    Write-Host " -> Engram ya está corriendo o el puerto $EngramPort está ocupado." -ForegroundColor Green
} else {
    Write-Host " -> El puerto $EngramPort está libre. Iniciando Engram serve..." -ForegroundColor Gray
    
    # Definir variables de entorno de Engram para Venezuela
    $env:ENGRAM_TIMEZONE = "America/Caracas"
    $env:ENGRAM_DATA_DIR = "$env:USERPROFILE\.engram"
    
    # Resolver la ruta de ejecución del servidor Engram
    $EngramCmd = "engram"
    if (!(Get-Command "engram" -ErrorAction SilentlyContinue)) {
        $FallbackPath = "$env:USERPROFILE\.engram\bin\engram.exe"
        if (Test-Path $FallbackPath) {
            $EngramCmd = $FallbackPath
        } else {
            Write-Warning " -> No se detectó 'engram' en el PATH de Windows ni en la ruta predeterminada de instalación ($FallbackPath)."
        }
    }
    
    # Iniciar en segundo plano
    Start-Process -FilePath $EngramCmd -ArgumentList "serve", "$EngramPort" -WindowStyle Hidden
    
    # Esperar un momento a que levante
    Start-Sleep -Seconds 2
    
    # Verificar si ya responde
    $CheckResponse = Get-NetTCPConnection -LocalPort $EngramPort -ErrorAction SilentlyContinue
    if ($CheckResponse) {
        Write-Host " -> ¡Servidor Engram iniciado con éxito en segundo plano!" -ForegroundColor Green
        Write-Host " -> Sincronizando memorias de comportamiento base..." -ForegroundColor Gray
        node seed_memory.js
    } else {
        Write-Warning " -> Engram fue iniciado pero no se detecta activo. Revisa los logs o ejecuta 'engram serve $EngramPort' manualmente."
    }
}

# 2. Iniciar contenedores Docker (WAHA y n8n)
Write-Host "`n[2/3] Levantando pila Docker (n8n + WAHA)..." -ForegroundColor Yellow

# Asegurar que el volumen externo de Docker 'n8n_data' exista antes de levantar compose
if (Get-Command "docker" -ErrorAction SilentlyContinue) {
    $VolumeCheck = docker volume inspect n8n_data 2>$null
    if (!$VolumeCheck) {
        Write-Host " -> Creando volumen de Docker externo 'n8n_data'..." -ForegroundColor Gray
        docker volume create n8n_data >$null
    }
}

if (Get-Command "docker-compose" -ErrorAction SilentlyContinue) {
    docker-compose up -d
} else {
    docker compose up -d
}

# 3. Estado de salud general
Write-Host "`n[3/3] Diagnóstico de servicios..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Verificar Engram HTTP
try {
    $EngramHealth = Invoke-RestMethod -Uri "http://localhost:$EngramPort/health" -Method Get -TimeoutSec 3
    if ($EngramHealth.status -eq "ok") {
        Write-Host " -> [OK] Servidor de Memorias Engram está activo (v$($EngramHealth.version))." -ForegroundColor Green
    }
} catch {
    Write-Host " -> [ERROR] No se pudo conectar al Servidor de Memorias Engram en http://localhost:$EngramPort" -ForegroundColor Red
}

# Verificar Docker
$Containers = docker ps --format "table {{.Names}}\t{{.Status}}"
Write-Host "`nContenedores activos en Docker:" -ForegroundColor Gray
Write-Output $Containers

Write-Host "`n======================================================" -ForegroundColor Cyan
Write-Host "  ¡Ecosistema iniciado! El bot de WhatsApp está activo." -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
