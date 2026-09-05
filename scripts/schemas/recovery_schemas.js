/**
 * RECOVERY SCHEMAS - WhatsApp Sales Agent
 * Esquemas de validación estructural y defensiva para el subsistema de resiliencia.
 * Diseñado para fallar rápido y reportar errores detallados ante datos malformados.
 */

const VALID_JID_SUFFIXES = ['@c.us', '@lid', '@s.whatsapp.net'];
const INVALID_JID_SUBSTRINGS = ['@g.us', '@broadcast', '@newsletter'];
const VALID_WAHA_STATUSES = ['WORKING', 'STOPPED', 'FAILED', 'STARTING', 'STARTED', 'SCAN_QR_CODE'];

function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

/**
 * Valida un identificador JID de WhatsApp de cliente directo.
 */
function validateJid(jid) {
  const errors = [];
  if (typeof jid !== 'string' || !jid.trim()) {
    errors.push('JID debe ser un string no vacío');
    return { valid: false, errors };
  }
  const clean = jid.trim();
  if (clean.startsWith('test_')) {
    errors.push(`JID no puede ser un identificador de prueba ('${clean}')`);
  }
  const hasValidSuffix = VALID_JID_SUFFIXES.some(s => clean.endsWith(s));
  if (!hasValidSuffix) {
    errors.push(`JID debe terminar en uno de: ${VALID_JID_SUFFIXES.join(', ')} (recibido: '${clean}')`);
  }
  const hasInvalidSub = INVALID_JID_SUBSTRINGS.some(s => clean.includes(s));
  if (hasInvalidSub) {
    errors.push(`JID no puede ser grupo, canal ni difusión (${INVALID_JID_SUBSTRINGS.join(', ')})`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Valida el payload que se inyecta al webhook de n8n para catchup.
 */
function validateCatchupPayload(obj) {
  const errors = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['El payload raíz debe ser un objeto'] };
  }
  if (obj.catchup !== true) {
    errors.push(`'catchup' debe ser booleano true (recibido: ${JSON.stringify(obj.catchup)})`);
  }
  if (!isObject(obj.payload)) {
    errors.push(`'payload' debe ser un objeto con los datos del mensaje`);
    return { valid: false, errors };
  }

  const p = obj.payload;
  if (typeof p.id !== 'string' || !p.id.trim()) {
    errors.push(`payload.id debe ser un string no vacío`);
  } else if (!p.id.startsWith('catchup_')) {
    errors.push(`payload.id debe iniciar con 'catchup_' para evitar descarte por deduplicación (recibido: '${p.id}')`);
  }

  const jidCheck = validateJid(p.from);
  if (!jidCheck.valid) {
    errors.push(...jidCheck.errors.map(e => `payload.from: ${e}`));
  }

  if (typeof p.body !== 'string' || !p.body.trim()) {
    errors.push(`payload.body debe ser un texto no vacío`);
  }

  if (typeof p.timestamp !== 'number' || isNaN(p.timestamp) || p.timestamp <= 0) {
    errors.push(`payload.timestamp debe ser un número positivo (unix timestamp en segundos)`);
  }

  if (p.fromMe !== false) {
    errors.push(`payload.fromMe debe ser estrictamente false`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Valida la respuesta de sesión de WAHA.
 */
function validateWahaSession(obj) {
  const errors = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['La respuesta de WAHA debe ser un objeto'] };
  }
  if (!obj.status || typeof obj.status !== 'string') {
    errors.push(`La sesión debe contener un campo 'status' tipo string`);
  } else if (!VALID_WAHA_STATUSES.includes(obj.status)) {
    errors.push(`Estado de sesión no reconocido: '${obj.status}'. Esperado uno de: ${VALID_WAHA_STATUSES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Valida la estructura del archivo catchup_state.json.
 */
function validateCatchupState(obj) {
  const errors = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['El estado de catchup debe ser un objeto'] };
  }
  if (obj.lastRun !== null && typeof obj.lastRun !== 'string') {
    errors.push(`'lastRun' debe ser string ISO o null`);
  }
  if (!isObject(obj.processed)) {
    errors.push(`'processed' debe ser un objeto`);
  } else {
    for (const [chatId, entry] of Object.entries(obj.processed)) {
      if (!isObject(entry)) {
        errors.push(`Entrada de processed para '${chatId}' debe ser un objeto`);
        continue;
      }
      if (typeof entry.injectedAt !== 'number') {
        errors.push(`processed['${chatId}'].injectedAt debe ser un timestamp numérico`);
      }
      if (typeof entry.timestamp !== 'number') {
        errors.push(`processed['${chatId}'].timestamp debe ser un timestamp numérico`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Valida la estructura del estado del watchdog.
 */
function validateWatchdogState(obj) {
  const errors = [];
  if (!isObject(obj)) {
    return { valid: false, errors: ['El estado del watchdog debe ser un objeto'] };
  }
  if (typeof obj.failedStreak !== 'number' || obj.failedStreak < 0) {
    errors.push(`'failedStreak' debe ser un entero mayor o igual a 0`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = {
  validateJid,
  validateCatchupPayload,
  validateWahaSession,
  validateCatchupState,
  validateWatchdogState,
  VALID_JID_SUFFIXES,
  INVALID_JID_SUBSTRINGS,
  VALID_WAHA_STATUSES
};
