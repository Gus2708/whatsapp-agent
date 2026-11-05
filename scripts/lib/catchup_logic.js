/**
 * CATCHUP LOGIC - Ferretería El Serrucho
 * Lógica de dominio pura para el filtrado, deduplicación y evaluación de candidatos
 * de catchup. No realiza peticiones de red directas (totalmente testeable en TDD).
 */

const { validateJid, validateCatchupPayload } = require('../schemas/recovery_schemas');

const DEFAULT_MANUAL_TTL_MS = 30 * 60 * 1000;

function maskChatId(chatId) {
  if (typeof chatId !== 'string') return '';
  return chatId.replace(/\d(?=\d{3})/g, '*');
}

function isHumanHandover(session, options = {}) {
  if (!session || typeof session !== 'object') return false;
  if (session.no_atender === true) return true;
  if (session.estado === 'automatico') return false;

  const nowMs = typeof options === 'number' ? options : options?.nowMs;
  const manualTtlMs = (typeof options === 'object' && Number(options?.manualTtlMs) > 0)
    ? Number(options.manualTtlMs)
    : DEFAULT_MANUAL_TTL_MS;

  if (Number.isFinite(nowMs) && session.manual_since) {
    const parsedManualSince = new Date(session.manual_since).getTime();
    if (Number.isFinite(parsedManualSince) && (nowMs - parsedManualSince) >= manualTtlMs) {
      return false;
    }
  }

  if (session.estado === 'manual') return true;
  if (session.manual_desde || session.manual_since) return true;
  return false;
}

function isUnanswered({ clientTimeMs, botTimeMs, marginMs = 5000 }) {
  const cTime = Number(clientTimeMs) || 0;
  const bTime = Number(botTimeMs) || 0;
  if (cTime <= 0) return false;
  if (bTime <= 0) return true; // Nunca hubo respuesta del bot
  return cTime > (bTime + marginMs);
}

function buildCatchupPayload({ chatId, text, timestamp, nowMs = Date.now() }) {
  const cleanJid = (chatId || '').trim();
  const cleanText = (text || '').trim();
  let ts = Number(timestamp) || Math.floor(nowMs / 1000);
  if (ts > 1e12) ts = Math.floor(ts / 1000);

  const payload = {
    catchup: true,
    payload: {
      id: `catchup_${cleanJid}_${nowMs}`,
      from: cleanJid,
      body: cleanText,
      timestamp: ts,
      fromMe: false
    }
  };

  const check = validateCatchupPayload(payload);
  if (!check.valid) {
    throw new Error(`Payload inválido generado: ${check.errors.join(', ')}`);
  }

  return payload;
}

function normalizeToPhoneJid(jid) {
  if (typeof jid !== 'string') return '';
  const trimmed = jid.trim();
  if (trimmed.endsWith('@s.whatsapp.net')) {
    return trimmed.replace('@s.whatsapp.net', '@c.us');
  }
  return trimmed;
}

/**
 * Resuelve todos los alias conocidos para un identificador de chat (JID),
 * incluyendo mapeos cruzados entre LID (@lid) y teléfono (@c.us / @s.whatsapp.net).
 */
function resolveAliases(chatId, aliasMap = {}) {
  const aliases = new Set();
  if (!chatId || typeof chatId !== 'string') return aliases;
  const clean = chatId.trim();
  aliases.add(clean);
  const normalized = normalizeToPhoneJid(clean);
  aliases.add(normalized);

  if (aliasMap[clean]) {
    const mapped = aliasMap[clean];
    aliases.add(mapped);
    aliases.add(normalizeToPhoneJid(mapped));
  }
  if (aliasMap[normalized]) {
    const mapped = aliasMap[normalized];
    aliases.add(mapped);
    aliases.add(normalizeToPhoneJid(mapped));
  }

  return aliases;
}

/**
 * Obtiene la sesión considerando todos los alias conocidos del chat.
 */
function getSessionForAliases(aliases, sessionsMap = {}) {
  for (const a of aliases) {
    if (sessionsMap[a]) return sessionsMap[a];
  }
  return {};
}

/**
 * Obtiene el mensaje del bot más reciente considerando todos los alias del chat.
 */
function getLatestBotMsgForAliases(aliases, botMsgsMap = {}) {
  let latest = null;
  let latestTime = 0;
  for (const a of aliases) {
    const msg = botMsgsMap[a];
    if (msg && msg.created_at) {
      const t = new Date(msg.created_at).getTime();
      if (t > latestTime) {
        latestTime = t;
        latest = msg;
      }
    }
  }
  return latest;
}

/**
 * Obtiene el estado procesado previo considerando todos los alias del chat.
 */
function getProcessedStateForAliases(aliases, processedState = {}) {
  for (const a of aliases) {
    if (processedState[a]) return processedState[a];
  }
  return null;
}

function normalizeTimestampSec(rawTs) {
  const ts = Number(rawTs) || 0;
  if (ts <= 0) return 0;
  return ts > 1e12 ? Math.floor(ts / 1000) : Math.floor(ts);
}

function extractMessageText(msg) {
  if (!msg || typeof msg !== 'object') return '';
  const raw = String(msg.body || msg.text || msg._data?.body || '').trim();
  if (!raw || raw.startsWith('data:')) return '';
  return raw;
}

/**
 * Reconcilia un candidato preliminar contra el historial real reciente del chat en WAHA.
 * Descarta mensajes viejos de días previos cuando existe una consulta reciente nueva,
 * agrupa ráfagas recientes (ventana de 30 min) y omite chats ya contestados.
 */
function reconcileCandidateWithChatHistory({
  candidate,
  messages,
  maxAgeHours = 48,
  nowMs = Date.now(),
  burstWindowSec = 1800,
  marginSec = 5
}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { action: 'keep', candidate };
  }

  const minAllowedSec = Math.floor(nowMs / 1000) - (maxAgeHours * 3600);
  const candidateBotSec = Math.floor((Number(candidate?.botTimeMs) || 0) / 1000);
  const candidateTsSec = normalizeTimestampSec(candidate?.timestamp);

  let latestOutgoingSec = 0;
  let latestAnyIncomingSec = 0;
  let oldestMsgSec = Infinity;
  const validTsSeq = [];

  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const ts = normalizeTimestampSec(m.timestamp);
    if (ts <= 0) continue;
    validTsSeq.push(ts);
    if (ts < oldestMsgSec) oldestMsgSec = ts;
    if (m.fromMe === true) {
      if (ts > latestOutgoingSec) latestOutgoingSec = ts;
    } else {
      if (ts > latestAnyIncomingSec) latestAnyIncomingSec = ts;
    }
  }

  const lastReplySec = Math.max(latestOutgoingSec, candidateBotSec);
  const isInputDesc = validTsSeq.length >= 2 && validTsSeq[0] > validTsSeq[validTsSeq.length - 1];

  const unanswered = [];
  for (let idx = 0; idx < messages.length; idx++) {
    const m = messages[idx];
    if (!m || typeof m !== 'object' || m.fromMe === true) continue;
    const ts = normalizeTimestampSec(m.timestamp);
    if (ts <= 0 || ts < minAllowedSec) continue;
    if (ts <= lastReplySec + marginSec) continue;
    const text = extractMessageText(m);
    if (!text) continue;
    const rawId = typeof m.id === 'string'
      ? m.id.trim()
      : (typeof m.id?._serialized === 'string' ? m.id._serialized.trim() : '');
    unanswered.push({ id: rawId, ts, text, idx });
  }

  if (latestOutgoingSec >= candidateTsSec && unanswered.length === 0) {
    return { action: 'skip_answered' };
  }

  if (unanswered.length === 0) {
    if (candidateTsSec <= lastReplySec + marginSec) {
      return { action: 'skip_answered' };
    }
    if (latestOutgoingSec > 0 && latestOutgoingSec >= latestAnyIncomingSec && oldestMsgSec <= candidateTsSec) {
      return { action: 'skip_answered' };
    }
    return { action: 'keep', candidate };
  }

  const newestIncomingSec = Math.max(...unanswered.map(m => m.ts));
  const burstMinSec = newestIncomingSec - burstWindowSec;
  const burst = unanswered.filter(m => m.ts >= burstMinSec);

  burst.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts - b.ts;
    return isInputDesc ? (b.idx - a.idx) : (a.idx - b.idx);
  });

  const seenIds = new Set();
  const seenKeys = new Set();
  const texts = [];
  for (const m of burst) {
    if (m.id && seenIds.has(m.id)) continue;
    const key = `${m.ts}\u0000${m.text}`;
    if (seenKeys.has(key)) continue;
    if (m.id) seenIds.add(m.id);
    seenKeys.add(key);
    texts.push(m.text);
  }

  return {
    action: 'inject',
    candidate: {
      ...candidate,
      text: texts.join('\n'),
      timestamp: newestIncomingSec
    }
  };
}

/**
 * Evalúa mensajes de Supabase y WAHA, aplicando todas las reglas de negocio,
 * unificación de alias LID <-> Teléfono y deduplicación.
 * Devuelve una lista limpia de candidatos a inyectar.
 */
function evaluateCandidates({
  supabaseMsgs = [],
  wahaChats = [],
  sessionsMap = {},
  botMsgsMap = {},
  aliasMap = {},
  maxAgeHours = 48,
  cooldownMs = 15 * 60 * 1000,
  processedState = {},
  nowMs = Date.now()
}) {
  const minAllowedTimeMs = nowMs - (maxAgeHours * 3600 * 1000);
  const candidatesMap = new Map();
  const latestClientMsMap = new Map();

  // Último mensaje SALIENTE (fromMe) por chat según WAHA. Si un empleado respondió
  // manualmente desde el teléfono de la tienda, el bot no lo registra en mensajes_bot,
  // y sin esto el mensaje del cliente parecería pendiente (falso positivo).
  const humanReplyMap = new Map();
  for (const c of wahaChats) {
    const lm = c && c.lastMessage;
    if (!c || !c.id || !lm || !lm.fromMe) continue;
    let ts = Number(lm.timestamp) || 0;
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    if (ts <= 0) continue;
    for (const a of resolveAliases(c.id, aliasMap)) {
      humanReplyMap.set(a, Math.max(humanReplyMap.get(a) || 0, ts * 1000));
    }
  }

  // Función interna para registrar/actualizar candidato unificado por grupo de alias
  function considerCandidate({ rawChatId, text, clientTimeMs, source }) {
    if (!validateJid(rawChatId).valid) return;

    const aliases = resolveAliases(rawChatId, aliasMap);
    const session = getSessionForAliases(aliases, sessionsMap);
    if (isHumanHandover(session, { nowMs })) return;

    const cleanText = (text || '').trim();
    if (!cleanText) return;

    if (isNaN(clientTimeMs) || clientTimeMs < minAllowedTimeMs) return;

    const botMsg = getLatestBotMsgForAliases(aliases, botMsgsMap);
    let botTimeMs = botMsg ? new Date(botMsg.created_at).getTime() : 0;
    // Una respuesta humana (fromMe) posterior al mensaje del cliente cuenta como atendido.
    for (const a of aliases) {
      botTimeMs = Math.max(botTimeMs, humanReplyMap.get(a) || 0);
    }

    if (isUnanswered({ clientTimeMs, botTimeMs })) {
      // Clave canónica unificada: preferir teléfono @c.us si existe en alias, o rawChatId
      let canonicalKey = rawChatId;
      for (const a of aliases) {
        if (a.endsWith('@c.us')) {
          canonicalKey = a;
          break;
        }
      }

      const prevClientMs = latestClientMsMap.get(canonicalKey) || 0;
      if (!candidatesMap.has(canonicalKey) || clientTimeMs > prevClientMs) {
        latestClientMsMap.set(canonicalKey, clientTimeMs);
        candidatesMap.set(canonicalKey, {
          chatId: canonicalKey,
          text: cleanText,
          timestamp: Math.floor(clientTimeMs / 1000),
          botTimeMs,
          source,
          aliases: Array.from(aliases)
        });
      }
    }
  }

  // 1. Procesar mensajes provenientes de Supabase (mensajes_procesados)
  for (const m of supabaseMsgs) {
    const rawChatId = m.chat_id || m.telefono;
    const clientTimeMs = new Date(m.procesado_at || m.created_at).getTime();
    considerCandidate({
      rawChatId,
      text: m.texto,
      clientTimeMs,
      source: 'supabase'
    });
  }

  // 2. Procesar chats de WAHA (para cubrir mensajes llegados con n8n caído)
  for (const c of wahaChats) {
    const rawChatId = c.id;
    const lm = c.lastMessage;
    if (!lm || lm.fromMe) continue;

    let ts = Number(lm.timestamp) || 0;
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    const clientTimeMs = ts * 1000;
    const body = (lm.body || lm.text || lm._data?.body || '').trim();

    considerCandidate({
      rawChatId,
      text: body,
      clientTimeMs,
      source: 'waha_store'
    });
  }

  // 3. Filtrar candidatos por cooldown reciente (revisando en todos los alias del chat)
  const finalCandidates = [];
  for (const cand of candidatesMap.values()) {
    const prev = getProcessedStateForAliases(cand.aliases || [cand.chatId], processedState);
    if (prev && (nowMs - prev.injectedAt) < cooldownMs && prev.timestamp === cand.timestamp) {
      // Cooldown activo para este mismo mensaje
      continue;
    }
    finalCandidates.push(cand);
  }

  // Ordenar por antigüedad (los más antiguos primero para responder en orden cronológico)
  finalCandidates.sort((a, b) => a.timestamp - b.timestamp);

  return finalCandidates;
}

function parseEnv(envContent) {
  const result = {};
  if (typeof envContent !== 'string') return result;
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const k = trimmed.slice(0, eqIdx).trim();
      const v = trimmed.slice(eqIdx + 1).trim();
      result[k] = v;
    }
  }
  return result;
}

module.exports = {
  maskChatId,
  isHumanHandover,
  isUnanswered,
  buildCatchupPayload,
  evaluateCandidates,
  reconcileCandidateWithChatHistory,
  getProcessedStateForAliases,
  parseEnv,
  normalizeToPhoneJid,
  resolveAliases
};
