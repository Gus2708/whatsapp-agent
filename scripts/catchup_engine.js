/**
 * CATCHUP ENGINE - Ferretería El Serrucho
 * Automatización para detección de caídas y respuesta a mensajes pendientes.
 * Refactorizado para máxima testabilidad y validación estricta con esquemas.
 *
 * Uso:
 *   node scripts/catchup_engine.js [--dry-run] [--force] [--max-chats 20]
 */

const fs = require('fs');
const path = require('path');
const { validateCatchupState, validateWahaSession } = require('./schemas/recovery_schemas');
const { maskChatId, buildCatchupPayload, evaluateCandidates, parseEnv } = require('./lib/catchup_logic');

const PROJECT_DIR = path.resolve(__dirname, '..');
const ENV_FILE = path.join(PROJECT_DIR, '.env');
const LOG_FILE = path.join(PROJECT_DIR, 'catchup_serrucho.log');
const LOCK_FILE = path.join(PROJECT_DIR, 'catchup.lock');
const STATE_FILE = path.join(PROJECT_DIR, 'catchup_state.json');

// Cargar variables de entorno
if (fs.existsSync(ENV_FILE)) {
  const parsed = parseEnv(fs.readFileSync(ENV_FILE, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (!process.env[k]) process.env[k] = v;
  }
}

const WAHA_BASE = process.env.WAHA_BASE_URL || 'http://localhost:3000';
const N8N_BASE = process.env.N8N_BASE_URL || 'http://localhost:5678';
const WAHA_API_KEY = process.env.WAHA_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const WEBHOOK_URL = `${N8N_BASE}/webhook/whatsapp/inbound`;

const MAX_AGE_HOURS = 48;
const DEFAULT_MAX_CHATS = 20;
const DELAY_BETWEEN_CHATS_MS = 8000;
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const RECENT_COOLDOWN_MS = 15 * 60 * 1000; // 15 min

function log(msg) {
  const timestamp = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  const line = `[${timestamp}] [CATCHUP] ${msg}\n`;
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {}
  console.log(line.trim());
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const stats = fs.statSync(LOCK_FILE);
      const ageMs = Date.now() - stats.mtimeMs;
      if (ageMs < LOCK_TIMEOUT_MS) {
        log(`Hay otra instancia de catchup corriendo (lock activo hace ${Math.round(ageMs / 1000)}s). Abortando.`);
        return false;
      }
      log(`Lock obsoleto detectado (>10 min). Liberando lock.`);
      fs.unlinkSync(LOCK_FILE);
    } catch (e) {
      return false;
    }
  }
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return true;
  } catch (e) {
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (e) {}
}

function getState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const st = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (validateCatchupState(st).valid) return st;
    }
  } catch (e) {}
  return { lastRun: null, processed: {} };
}

function saveState(st) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 2), 'utf8');
  } catch (e) {}
}

async function checkHealth() {
  let wahaOk = false;
  try {
    const res = await fetch(`${WAHA_BASE}/api/sessions/default`, {
      headers: { 'X-Api-Key': WAHA_API_KEY },
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json();
      const check = validateWahaSession(data);
      if (check.valid && data.status === 'WORKING') {
        wahaOk = true;
      } else {
        log(`WAHA no está en WORKING (estado=${data?.status}, valid=${check.valid})`);
      }
    } else {
      log(`WAHA respondió HTTP ${res.status}`);
    }
  } catch (e) {
    log(`WAHA inalcanzable: ${e.message}`);
  }

  let n8nOk = false;
  try {
    const res = await fetch(`${N8N_BASE}/healthz`, { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'ok') n8nOk = true;
      else log(`n8n healthz status=${data.status}`);
    } else {
      log(`n8n healthz respondió HTTP ${res.status}`);
    }
  } catch (e) {
    log(`n8n inalcanzable: ${e.message}`);
  }

  return { wahaOk, n8nOk, allHealthy: wahaOk && n8nOk };
}

async function fetchCandidatesData(maxAgeHours) {
  const sbHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const sinceIso = new Date(Date.now() - maxAgeHours * 3600 * 1000).toISOString();

  let supabaseMsgs = [];
  try {
    const url = `${SUPABASE_URL}/rest/v1/mensajes_procesados?procesado_at=gte.${encodeURIComponent(sinceIso)}&order=procesado_at.asc`;
    const res = await fetch(url, { headers: sbHeaders, signal: AbortSignal.timeout(10000) });
    if (res.ok) supabaseMsgs = await res.json();
  } catch (e) {
    log(`Aviso consultando mensajes_procesados: ${e.message}`);
  }

  let wahaChats = [];
  try {
    const res = await fetch(`${WAHA_BASE}/api/default/chats/overview?limit=100`, {
      headers: { 'X-Api-Key': WAHA_API_KEY },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) wahaChats = await res.json();
  } catch (e) {
    log(`Aviso consultando WAHA overview: ${e.message}`);
  }

  // Recolectar todos los chat_ids únicos
  const chatIds = new Set();
  for (const m of supabaseMsgs) { if (m.chat_id) chatIds.add(m.chat_id); }
  for (const c of wahaChats) { if (c.id) chatIds.add(c.id); }

  const sessionsMap = {};
  const botMsgsMap = {};

  for (const chatId of chatIds) {
    try {
      const sRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions?telefono=eq.${encodeURIComponent(chatId)}`, { headers: sbHeaders });
      if (sRes.ok) {
        const rows = await sRes.json();
        if (rows[0]) sessionsMap[chatId] = rows[0];
      }
    } catch (e) {}

    try {
      const bRes = await fetch(`${SUPABASE_URL}/rest/v1/mensajes_bot?chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=1`, { headers: sbHeaders });
      if (bRes.ok) {
        const rows = await bRes.json();
        if (rows[0]) botMsgsMap[chatId] = rows[0];
      }
    } catch (e) {}
  }

  return { supabaseMsgs, wahaChats, sessionsMap, botMsgsMap };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  let maxChats = DEFAULT_MAX_CHATS;
  const maxIdx = args.indexOf('--max-chats');
  if (maxIdx >= 0 && args[maxIdx + 1]) {
    maxChats = parseInt(args[maxIdx + 1], 10) || DEFAULT_MAX_CHATS;
  }

  log(`=== Iniciando escaneo de mensajes pendientes (dryRun=${dryRun}, force=${force}) ===`);

  if (!force && !acquireLock()) return;

  try {
    const health = await checkHealth();
    if (!health.allHealthy) {
      log(`Servicios no listos para catchup (WAHA=${health.wahaOk}, n8n=${health.n8nOk}). Se aborta ejecución.`);
      return;
    }

    const state = getState();
    const now = Date.now();

    // Limpiar registros viejos del state
    for (const [k, v] of Object.entries(state.processed || {})) {
      if (now - v.injectedAt > 24 * 3600 * 1000) {
        delete state.processed[k];
      }
    }

    const data = await fetchCandidatesData(MAX_AGE_HOURS);
    const pending = evaluateCandidates({
      supabaseMsgs: data.supabaseMsgs,
      wahaChats: data.wahaChats,
      sessionsMap: data.sessionsMap,
      botMsgsMap: data.botMsgsMap,
      maxAgeHours: MAX_AGE_HOURS,
      cooldownMs: RECENT_COOLDOWN_MS,
      processedState: state.processed,
      nowMs: now
    });

    log(`Chats con mensajes pendientes detectados: ${pending.length}`);

    let injectedCount = 0;
    for (const item of pending) {
      if (injectedCount >= maxChats) {
        log(`Alcanzado el tope de ${maxChats} chats por tanda.`);
        break;
      }

      const masked = maskChatId(item.chatId);
      log(`Procesando chat pendiente: ${masked} (origen=${item.source}, texto="${item.text.slice(0, 40)}...")`);

      if (dryRun) {
        injectedCount++;
        log(`[DRY-RUN] Se inyectaría catchup a ${masked}`);
        continue;
      }

      let payload;
      try {
        payload = buildCatchupPayload({
          chatId: item.chatId,
          text: item.text,
          timestamp: item.timestamp,
          nowMs: Date.now()
        });
      } catch (err) {
        log(`Error de esquema en payload para ${masked}: ${err.message}`);
        continue;
      }

      try {
        const postRes = await fetch(WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000)
        });

        if (postRes.ok) {
          injectedCount++;
          log(`Inyectado con éxito a n8n: ${masked} (HTTP ${postRes.status})`);
          state.processed[item.chatId] = {
            injectedAt: Date.now(),
            timestamp: item.timestamp,
            text: item.text.slice(0, 50)
          };
          saveState(state);
        } else {
          log(`Error al inyectar chat ${masked}: HTTP ${postRes.status}`);
        }
      } catch (err) {
        log(`Fallo enviando webhook para ${masked}: ${err.message}`);
      }

      await new Promise(r => setTimeout(r, DELAY_BETWEEN_CHATS_MS));
    }

    state.lastRun = new Date().toISOString();
    saveState(state);
    log(`=== Fin de escaneo. Inyectados: ${injectedCount}/${pending.length} ===`);

  } finally {
    if (!force) releaseLock();
  }
}

if (require.main === module) {
  main().catch(err => {
    log(`ERROR crítico en catchup_engine: ${err.stack || err.message}`);
    releaseLock();
    process.exit(1);
  });
}

module.exports = {
  checkHealth,
  acquireLock,
  releaseLock,
  getState,
  saveState
};
