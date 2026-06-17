# ============================================================================
#  ARRANQUE AUTOMÁTICO DEL AGENTE DE IA "PERUCHO" (Ferretería El Serrucho)
# ----------------------------------------------------------------------------
#  Levanta, en orden, todo lo necesario para que el agente quede activo:
#     1) Docker Desktop (y espera a que el motor responda)
#     2) Contenedores n8n + WAHA  (docker compose up -d)
#     3) Engram  (servidor de memorias en el host, puerto 7437)
#
#  Es IDEMPOTENTE: se puede ejecutar las veces que sea sin efectos adversos
#  (si algo ya está corriendo, lo detecta y no lo duplica).
#
#  Lo invoca boot_serrucho.vbs (oculto, sin ventana) desde la carpeta de
#  Inicio de Windows cada vez que el usuario inicia sesión.
# ============================================================================

$ProjectDir = "C:\Proyect\whatsapp-agent"
$LogFile    = Join-Path $ProjectDir "boot_serrucho.log"
$EngramPort = 7437
$DockerExe  = "C:\Program Files\Docker\Docker\Docker Desktop.exe"

function Log($msg) {
    $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $LogFile -Value $line -Encoding utf8
}

Log "=== Arranque del ecosistema Serrucho ==="

# ---------------------------------------------------------------------------
# 1) Docker Desktop + esperar a que el motor esté listo
# ---------------------------------------------------------------------------
try {
    if (-not (Get-Process "Docker Desktop" -ErrorAction SilentlyContinue)) {
        if (Test-Path $DockerExe) {
            Log "Iniciando Docker Desktop..."
            Start-Process -FilePath $DockerExe -WindowStyle Hidden
        } else {
            Log "AVISO: no se encontro Docker Desktop.exe en $DockerExe"
        }
    } else {
        Log "Docker Desktop ya esta en ejecucion."
    }

    # Esperar hasta ~180s a que el motor responda
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 3
    }
    if ($ready) { Log "Motor de Docker LISTO." } else { Log "ERROR: el motor de Docker no respondio tras ~180s." }
} catch {
    Log "ERROR iniciando Docker: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 2) Contenedores WAHA + n8n  (se levantan POR SEPARADO, a proposito)
#    (red de seguridad: con restart:unless-stopped Docker ya los recupera,
#     pero esto cubre el caso de que hayan quedado detenidos a mano)
#
#    Por que separados y NO un solo `docker compose up -d`:
#    ese comando levanta WAHA y COMPILA n8n de forma atomica; si el build de
#    n8n falla (exit 1), Compose aborta TODO y WAHA cae junto con n8n (paso el
#    2026-06-11). WAHA solo baja una imagen y nunca compila, asi que lo
#    arrancamos primero e independiente: la sesion de WhatsApp debe vivir
#    SIEMPRE, pase lo que pase con el build de n8n.
# ---------------------------------------------------------------------------
try {
    Set-Location $ProjectDir
    $vol = docker volume inspect n8n_data 2>$null
    if (-not $vol) {
        Log "Creando volumen externo n8n_data..."
        docker volume create n8n_data | Out-Null
    }

    # 2a) WAHA primero (sin build) -> WhatsApp arriba cueste lo que cueste.
    Log "docker compose up -d waha ..."
    docker compose up -d waha 2>$null
    if ($LASTEXITCODE -eq 0) { Log "WAHA: OK" } else { Log "WAHA: fallo (exit $LASTEXITCODE)" }

    # 2b) n8n despues (aqui SI se compila). Si el build falla, WAHA ya quedo
    #     arriba; ademas intentamos arrancar la ultima imagen buena con
    #     --no-build para no quedarnos sin agente por un build roto.
    Log "docker compose up -d n8n ..."
    docker compose up -d n8n 2>$null
    if ($LASTEXITCODE -ne 0) {
        Log "n8n: build fallo (exit $LASTEXITCODE). Intentando ultima imagen buena (--no-build)..."
        docker compose up -d --no-build n8n 2>$null
        if ($LASTEXITCODE -eq 0) { Log "n8n: OK (imagen previa, sin recompilar)" }
        else { Log "n8n: no se pudo arrancar (exit $LASTEXITCODE) -- WAHA sigue arriba" }
    } else {
        Log "n8n: OK"
    }
} catch {
    Log "ERROR en docker compose: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 3) Engram (servidor de memorias) en el host
# ---------------------------------------------------------------------------
try {
    $listening = Get-NetTCPConnection -LocalPort $EngramPort -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
        Log "Engram ya escucha en el puerto $EngramPort."
    } else {
        $env:ENGRAM_TIMEZONE = "America/Caracas"
        $env:ENGRAM_DATA_DIR = "$env:USERPROFILE\.engram"
        $engramCmd = (Get-Command engram -ErrorAction SilentlyContinue).Source
        if (-not $engramCmd) { $engramCmd = "$env:USERPROFILE\.engram\bin\engram.exe" }
        if (Test-Path $engramCmd) {
            Log "Iniciando Engram serve $EngramPort..."
            Start-Process -FilePath $engramCmd -ArgumentList "serve", "$EngramPort" -WindowStyle Hidden
        } else {
            Log "AVISO: no se encontro el ejecutable de Engram ($engramCmd)."
        }
    }
} catch {
    Log "ERROR iniciando Engram: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 4) Recuperacion de mensajes pendientes (en segundo plano).
#    catchup_serrucho.ps1 espera a que la sesion de WhatsApp este WORKING y
#    responde, con disculpa y espaciado, los mensajes que llegaron mientras
#    el agente estuvo apagado. Se lanza async para no demorar el arranque.
# ---------------------------------------------------------------------------
try {
    $catchupVbs = Join-Path $ProjectDir "catchup_serrucho.vbs"
    if (Test-Path $catchupVbs) {
        # Se lanza a traves del .vbs (WScript.Shell.Run modo 0) para que NO
        # parpadee ninguna ventana. Start-Process powershell.exe -WindowStyle
        # Hidden igual mostraba un destello de consola al arrancar.
        Log "Lanzando recuperacion de mensajes pendientes en segundo plano (oculto)..."
        Start-Process -FilePath "wscript.exe" -ArgumentList "`"$catchupVbs`""
    } else {
        Log "AVISO: no se encontro catchup_serrucho.vbs; se omite la recuperacion."
    }
} catch {
    Log "ERROR lanzando la recuperacion: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 4.5) Ejecutar Watchdog de WAHA para iniciar la sesión de inmediato
# ---------------------------------------------------------------------------
try {
    $watchdogScript = Join-Path $ProjectDir "waha_watchdog.ps1"
    if (Test-Path $watchdogScript) {
        Log "Ejecutando watchdog para iniciar sesion de WhatsApp de inmediato..."
        & $watchdogScript
    }
} catch {
    Log "ERROR ejecutando watchdog al arrancar: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# 5) Resumen de estado
# ---------------------------------------------------------------------------
Start-Sleep -Seconds 4
try {
    $names = (docker ps --format "{{.Names}} ({{.Status}})") -join " | "
    Log "Contenedores activos: $names"
} catch {}
try {
    $eng = Get-NetTCPConnection -LocalPort $EngramPort -State Listen -ErrorAction SilentlyContinue
    if ($eng) { Log "Engram ACTIVO en $EngramPort." } else { Log "Engram INACTIVO en $EngramPort." }
} catch {}
Log "=== Fin del arranque ==="
