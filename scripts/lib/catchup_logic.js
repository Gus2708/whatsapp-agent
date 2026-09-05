/**
 * CATCHUP LOGIC - WhatsApp Sales Agent
 * Lógica de dominio pura para el filtrado, deduplicación y evaluación de candidatos
 * de catchup. No realiza peticiones de red directas (totalmente testeable en TDD).
 */

const { validateJid, validateCatchupPayload } = require('../schemas/recovery_schemas');

function maskChatId(chatId) {
  if (typeof chatId !== 'string') return '';
  return chatId.replace(/\d(?=\d{3})/g, '*');
}

function isHumanHandover(session) {
  if (!session || typeof session !== 'object') return false;
  if (session.estado === 'manual') return true;
  if (session.no_atender === true) return true;
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

  // Función interna para registrar/actualizar candidato unificado por grupo de alias
  function considerCandidate({ rawChatId, text, clientTimeMs, source }) {
    if (!validateJid(rawChatId).valid) return;

    const aliases = resolveAliases(rawChatId, aliasMap);
    const session = getSessionForAliases(aliases, sessionsMap);
    if (isHumanHandover(session)) return;

    const cleanText = (text || '').trim();
    if (!cleanText) return;

    if (isNaN(clientTimeMs) || clientTimeMs < minAllowedTimeMs) return;

    const botMsg = getLatestBotMsgForAliases(aliases, botMsgsMap);
    const botTimeMs = botMsg ? new Date(botMsg.created_at).getTime() : 0;

    if (isUnanswered({ clientTimeMs, botTimeMs })) {
      // Clave canónica unificada: preferir teléfono @c.us si existe en alias, o rawChatId
      let canonicalKey = rawChatId;
      for (const a of aliases) {
        if (a.endsWith('@c.us')) {
          canonicalKey = a;
          break;
        }
      }

      const existing = candidatesMap.get(canonicalKey);
      if (!existing || clientTimeMs > existing.timestamp * 1000) {
        candidatesMap.set(canonicalKey, {
          chatId: canonicalKey,
          text: cleanText,
          timestamp: Math.floor(clientTimeMs / 1000),
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
  parseEnv,
  normalizeToPhoneJid,
  resolveAliases
};
