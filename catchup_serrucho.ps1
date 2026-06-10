# ============================================================================
#  RECUPERACION DE MENSAJES PENDIENTES  (Agente "Perucho" - El Serrucho)
# ----------------------------------------------------------------------------
#  Al arrancar (tras un apagado), revisa los chats DIRECTOS de WhatsApp y, por
#  cada uno cuyo ULTIMO mensaje sea del CLIENTE (no nuestro) y tenga < 24h, se
#  lo inyecta al webhook de n8n con catchup:true para que el agente lo responda
#  (con disculpa por la demora). Si el ultimo mensaje es nuestro, lo salta
#  (ya respondio un humano o el bot). Envio ESPACIADO para no disparar el
#  antispam de WhatsApp. El dedup por ID (en n8n) evita respuestas dobles.
#
#  Requiere que el store NOWEB de WAHA este activo (chats/overview).
#  Lo llama boot_serrucho.ps1 despues de levantar el stack.
#
#  Uso:
#    .\catchup_serrucho.ps1            -> recuperacion real (envia respuestas)
#    .\catchup_serrucho.ps1 -DryRun    -> solo registra a quien responderia (no envia)
# ============================================================================

param([switch]$DryRun)

$ProjectDir = "C:\Proyect\whatsapp-agent"
$LogFile    = Join-Path $ProjectDir "catchup_serrucho.log"
$WahaBase   = "http://localhost:3000"
$Webhook    = "http://localhost:5678/webhook/whatsapp/inbound"
$Session    = "default"

# Parametros de seguridad (ajustables)
$MaxAgeHours   = 24      # solo mensajes de las ultimas 24h
$MaxChats      = 30      # tope de chats a responder en una corrida (anti-baneo)
$DelaySeconds  = 5       # espera entre envios (anti-baneo)
$WaitWorkingSec = 180    # cuanto esperar a que la sesion llegue a WORKING

function Log($msg) {
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  Add-Content -Path $LogFile -Value $line -Encoding utf8
}

# Cargar .env (WAHA_API_KEY)
Get-Content (Join-Path $ProjectDir ".env") | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1].Trim())" -Value $Matches[2].Trim() }
}
$h = @{ "X-Api-Key" = $env:WAHA_API_KEY; "Content-Type" = "application/json" }

Log "=== Inicio recuperacion de mensajes pendientes ==="

# 1) Esperar a que la sesion este WORKING
$status = ""
$deadline = (Get-Date).AddSeconds($WaitWorkingSec)
do {
  try { $status = (Invoke-RestMethod -Uri "$WahaBase/api/sessions/$Session" -Headers $h -TimeoutSec 8).status } catch { $status = "(sin respuesta)" }
  if ($status -eq "WORKING") { break }
  Start-Sleep -Seconds 5
} while ((Get-Date) -lt $deadline)

if ($status -ne "WORKING") {
  Log "Sesion no esta WORKING (estado=$status). Se aborta la recuperacion (el watchdog la atendera)."
  return
}

# Tras reconectar, el store NOWEB tarda en sincronizar y chats/overview puede
# dar timeout al principio. Damos un respiro y reintentamos.
Start-Sleep -Seconds 20

# 2) Traer resumen de chats (requiere store NOWEB activo); con reintentos.
$chats = $null
for ($try = 1; $try -le 8; $try++) {
  try {
    $chats = Invoke-RestMethod -Uri "$WahaBase/api/$Session/chats/overview?limit=100" -Headers $h -TimeoutSec 60
    break
  } catch {
    Log "chats/overview intento $try fallo ($($_.Exception.Message)); reintentando en 30s..."
    Start-Sleep -Seconds 30
  }
}
if ($null -eq $chats) {
  Log "No se pudo leer chats/overview tras varios intentos (store aun sincronizando?). Se aborta; los mensajes quedan pendientes."
  return
}
$chats = @($chats)   # normalizar a arreglo (evita el wrap de @() sobre la salida del cmdlet)
Log "Chats en el store: $($chats.Count)"

# 3) Filtrar pendientes y responder espaciado
$nowSec = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$respondidos = 0
$revisados = 0

foreach ($c in $chats) {
  if ($respondidos -ge $MaxChats) { Log "Tope de $MaxChats alcanzado; el resto queda para el flujo normal."; break }
  $chatId = $c.id
  if (-not $chatId) { continue }
  # Solo chats directos de cliente (@c.us). Ignora grupos/estados/newsletters.
  if ($chatId -notlike "*@c.us") { continue }
  $lm = $c.lastMessage
  if (-not $lm) { continue }
  $revisados++

  # Si el ultimo mensaje es NUESTRO (fromMe), ya se atendio -> saltar.
  if ($lm.fromMe) { continue }

  # Antiguedad
  $ts = 0; try { $ts = [double]$lm.timestamp } catch {}
  if ($ts -gt 1e12) { $ts = $ts / 1000 }   # por si viniera en ms
  if ($ts -le 0) { continue }
  $ageH = ($nowSec - $ts) / 3600.0
  if ($ageH -gt $MaxAgeHours) { continue }

  # Texto del mensaje (NOWEB suele usar .body)
  $body = $lm.body
  if (-not $body) { $body = $lm.text }
  if (-not $body -and $lm._data) { $body = $lm._data.body }
  if (-not $body) { continue }   # no es texto -> lo deja al flujo normal

  $msgId = $lm.id
  if (-not $msgId) { $msgId = "catchup_${chatId}_$([int]$ts)" }

  # Inyectar al webhook como mensaje entrante de recuperacion
  $payload = @{
    catchup = $true
    payload = @{
      id        = "$msgId"
      from      = "$chatId"
      body      = "$body"
      timestamp = [int]$ts
      fromMe    = $false
    }
  } | ConvertTo-Json -Depth 6 -Compress

  $masked = $chatId -replace '\d(?=\d{3})', '*'
  if ($DryRun) {
    $respondidos++
    Log "DRY-RUN: responderia chat $masked (edad $([math]::Round($ageH,1))h, bodyLen=$(([string]$body).Length))."
    continue
  }
  try {
    Invoke-RestMethod -Uri $Webhook -Method POST -Headers @{ "Content-Type" = "application/json" } -Body $payload -TimeoutSec 30 | Out-Null
    $respondidos++
    Log "Recuperado chat $masked (edad $([math]::Round($ageH,1))h)."
  } catch {
    Log "Fallo al inyectar chat: $($_.Exception.Message)"
  }
  Start-Sleep -Seconds $DelaySeconds
}

Log "=== Fin recuperacion. Revisados=$revisados, inyectados=$respondidos ==="
