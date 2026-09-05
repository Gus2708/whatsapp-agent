/**
 * CATCHUP LOGIC - Ferretería El Serrucho
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

/**
 * Evalúa mensajes de Supabase y WAHA, aplicando todas las reglas de negocio
 * y deduplicación. Devuelve una lista limpia de candidatos a inyectar.
 */
function evaluateCandidates({
  supabaseMsgs = [],
  wahaChats = [],
  sessionsMap = {},
  botMsgsMap = {},
  maxAgeHours = 48,
  cooldownMs = 15 * 60 * 1000,
  processedState = {},
  nowMs = Date.now()
}) {
  const minAllowedTimeMs = nowMs - (maxAgeHours * 3600 * 1000);
  const candidatesMap = new Map();

  // 1. Procesar mensajes provenientes de Supabase (mensajes_procesados)
  for (const m of supabaseMsgs) {
    const chatId = m.chat_id || m.telefono;
    if (!validateJid(chatId).valid) continue;

    const session = sessionsMap[chatId] || {};
    if (isHumanHandover(session)) continue;

    const text = (m.texto || '').trim();
    if (!text) continue;

    const clientTimeMs = new Date(m.procesado_at || m.created_at).getTime();
    if (isNaN(clientTimeMs) || clientTimeMs < minAllowedTimeMs) continue;

    const botMsg = botMsgsMap[chatId];
    const botTimeMs = botMsg ? new Date(botMsg.created_at).getTime() : 0;

    if (isUnanswered({ clientTimeMs, botTimeMs })) {
      const existing = candidatesMap.get(chatId);
      if (!existing || clientTimeMs > existing.timestamp * 1000) {
        candidatesMap.set(chatId, {
          chatId,
          text,
          timestamp: Math.floor(clientTimeMs / 1000),
          source: 'supabase'
        });
      }
    }
  }

  // 2. Procesar chats de WAHA (para cubrir mensajes llegados con n8n caído)
  for (const c of wahaChats) {
    const chatId = c.id;
    if (!validateJid(chatId).valid) continue;

    const session = sessionsMap[chatId] || {};
    if (isHumanHandover(session)) continue;

    const lm = c.lastMessage;
    if (!lm || lm.fromMe) continue;

    let ts = Number(lm.timestamp) || 0;
    if (ts > 1e12) ts = Math.floor(ts / 1000);
    const msgTimeMs = ts * 1000;
    if (msgTimeMs < minAllowedTimeMs) continue;

    const body = (lm.body || lm.text || lm._data?.body || '').trim();
    if (!body) continue;

    const botMsg = botMsgsMap[chatId];
    const botTimeMs = botMsg ? new Date(botMsg.created_at).getTime() : 0;

    if (isUnanswered({ clientTimeMs: msgTimeMs, botTimeMs })) {
      const existing = candidatesMap.get(chatId);
      if (!existing || msgTimeMs > existing.timestamp * 1000) {
        candidatesMap.set(chatId, {
          chatId,
          text: body,
          timestamp: ts,
          source: 'waha_store'
        });
      }
    }
  }

  // 3. Filtrar candidatos por cooldown reciente
  const finalCandidates = [];
  for (const cand of candidatesMap.values()) {
    const prev = processedState[cand.chatId];
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
  parseEnv
};
