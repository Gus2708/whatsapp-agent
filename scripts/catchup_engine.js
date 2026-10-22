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
const { execSync } = require('child_process');
const { validateCatchupState, validateWahaSession } = require('./schemas/recovery_schemas');
const { maskChatId, buildCatchupPayload, evaluateCandidates, parseEnv, normalizeToPhoneJid, resolveAliases } = require('./lib/catchup_logic');

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

function rotateLogIfNeeded(filePath, maxBytes = 5 * 1024 * 1024) {
  try {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > maxBytes) {
        const backup = `${filePath}.1`;
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        fs.renameSync(filePath, backup);
      }
    }
  } catch (e) {}
}

function log(msg) {
  const timestamp = new Date().toLocaleString('es-VE', { timeZone: 'America/Caracas' });
  const line = `[${timestamp}] [CATCHUP] ${msg}\n`;
  try {
    rotateLogIfNeeded(LOG_FILE);
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {}
  console.log(line.trim());
}

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const stats = fs.statSync(LOCK_FILE);
      const ageMs = Date.now() - stats.mtimeMs;
      let isRunning = false;
      let existingPid = null;
      try {
        const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
        existingPid = lockData.pid;
        if (existingPid) {
          try {
            process.kill(existingPid, 0);
            isRunning = true;
          } catch (err) {
            if (err.code === 'ESRCH') isRunning = false;
            else isRunning = true;
          }
        }
      } catch (e) {}

      if (!isRunning) {
        log(`Lock huérfano detectado (PID ${existingPid || 'desconocido'} inactivo). Liberando lock.`);
        fs.unlinkSync(LOCK_FILE);
      } else if (ageMs < LOCK_TIMEOUT_MS) {
        log(`Hay otra instancia de catchup corriendo (PID ${existingPid}, lock activo hace ${Math.round(ageMs / 1000)}s). Abortando.`);
        return false;
      } else {
        log(`Lock obsoleto detectado (>10 min). Liberando lock.`);
        fs.unlinkSync(LOCK_FILE);
      }
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

async function waitForHealth(maxWaitSec = 90, intervalSec = 3) {
  const start = Date.now();
  let attempts = 0;
  while ((Date.now() - start) < maxWaitSec * 1000) {
    attempts++;
    const health = await checkHealth();
    if (health.allHealthy) return true;
    if (attempts === 1) {
      log(`Esperando a que WAHA y n8n estén disponibles (hasta ${maxWaitSec}s)...`);
    }
    await new Promise(r => setTimeout(r, intervalSec * 1000));
  }
  return false;
}

async function fetchAliasMap() {
  const aliasMap = {};
  const containers = ['waha_agent', 'waha_serrucho'];
  const cmd = "const db=new (require('better-sqlite3'))('/app/.sessions/noweb/default/store.sqlite3');console.log(JSON.stringify(db.prepare('SELECT id, pn FROM lid_map').all()))";
  let raw = '';
  for (const c of containers) {
    try {
      raw = execSync(`docker exec ${c} node -e "${cmd}"`, { encoding: 'utf8', timeout: 5000 }).trim();
      if (raw) break;
    } catch (e) {}
  }
  try {
    if (raw) {
      const rows = JSON.parse(raw);
      for (const r of rows) {
        if (r.id && r.pn) {
          const lid = r.id.trim();
          const pn = r.pn.trim();
          const phoneJid = normalizeToPhoneJid(pn);
          aliasMap[lid] = phoneJid;
          aliasMap[phoneJid] = lid;
          aliasMap[pn] = lid;
        }
      }
    }
  } catch (e) {
    log(`Aviso leyendo lid_map de WAHA: ${e.message}`);
  }
  return aliasMap;
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
    const res = await fetch(`${WAHA_BASE}/api/default/chats/overview?limit=25`, {
      headers: { 'X-Api-Key': WAHA_API_KEY },
      signal: AbortSignal.timeout(15000)
    });
    if (res.ok) wahaChats = await res.json();
  } catch (e) {
    log(`Aviso consultando WAHA overview: ${e.message}`);
  }

  const aliasMap = await fetchAliasMap();

  // Recolectar todos los chat_ids únicos Y sus alias
  const chatIds = new Set();
  for (const m of supabaseMsgs) {
    if (m.chat_id) {
      for (const a of resolveAliases(m.chat_id, aliasMap)) chatIds.add(a);
    }
  }
  for (const c of wahaChats) {
    if (c.id) {
      for (const a of resolveAliases(c.id, aliasMap)) chatIds.add(a);
    }
  }

  const sessionsMap = {};
  const botMsgsMap = {};
  const chatIdsList = Array.from(chatIds);
  const BATCH_SIZE = 10;

  for (let i = 0; i < chatIdsList.length; i += BATCH_SIZE) {
    const batch = chatIdsList.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (chatId) => {
      try {
        const sRes = await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions?telefono=eq.${encodeURIComponent(chatId)}`, { headers: sbHeaders, signal: AbortSignal.timeout(8000) });
        if (sRes.ok) {
          const rows = await sRes.json();
          if (rows[0]) sessionsMap[chatId] = rows[0];
        }
      } catch (e) {}

      try {
        const bRes = await fetch(`${SUPABASE_URL}/rest/v1/mensajes_bot?chat_id=eq.${encodeURIComponent(chatId)}&order=created_at.desc&limit=1`, { headers: sbHeaders, signal: AbortSignal.timeout(8000) });
        if (bRes.ok) {
          const rows = await bRes.json();
          if (rows[0]) botMsgsMap[chatId] = rows[0];
        }
      } catch (e) {}
    }));
  }

  return { supabaseMsgs, wahaChats, sessionsMap, botMsgsMap, aliasMap };
}

/**
 * Red de seguridad: consulta los últimos mensajes reales del chat en WAHA y devuelve
 * true si ya hay un saliente (empleado o bot) posterior al mensaje del cliente.
 * Cubre chats fuera del top del overview. Si la consulta falla, devuelve false.
 */
async function hasOutgoingAfter(chatId, clientTsSec) {
  try {
    const url = `${WAHA_BASE}/api/default/chats/${encodeURIComponent(chatId)}/messages?limit=10&downloadMedia=false`;
    const res = await fetch(url, { headers: { 'X-Api-Key': WAHA_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const msgs = await res.json();
    if (!Array.isArray(msgs)) return false;
    return msgs.some(m => {
      let ts = Number(m.timestamp) || 0;
      if (ts > 1e12) ts = Math.floor(ts / 1000);
      return m.fromMe === true && ts >= clientTsSec;
    });
  } catch (e) {
    return false;
  }
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
    const ready = await waitForHealth(90, 3);
    if (!ready) {
      const health = await checkHealth();
      log(`Servicios no listos para catchup tras 90s de espera (WAHA=${health.wahaOk}, n8n=${health.n8nOk}). Se aborta ejecución.`);
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
      aliasMap: data.aliasMap,
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

      if (await hasOutgoingAfter(item.chatId, item.timestamp)) {
        log(`Omitido ${masked}: ya existe una respuesta saliente posterior al mensaje del cliente.`);
        state.processed[item.chatId] = { injectedAt: Date.now(), timestamp: item.timestamp, text: item.text.slice(0, 50) };
        saveState(state);
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
  waitForHealth,
  acquireLock,
  releaseLock,
  getState,
  saveState
};
