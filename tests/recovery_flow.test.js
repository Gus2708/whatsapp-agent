const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateJid,
  validateCatchupPayload,
  validateWahaSession,
  validateCatchupState,
  validateWatchdogState
} = require('../scripts/schemas/recovery_schemas');

const {
  maskChatId,
  isHumanHandover,
  isUnanswered,
  buildCatchupPayload,
  evaluateCandidates,
  parseEnv
} = require('../scripts/lib/catchup_logic');

const { acquireLock, releaseLock } = require('../scripts/catchup_engine');

describe('Recovery Schemas Validation', () => {
  test('validateJid accepts valid WhatsApp direct JIDs', () => {
    assert.equal(validateJid('584140655276@c.us').valid, true);
    assert.equal(validateJid('117935523786892@lid').valid, true);
    assert.equal(validateJid('584241234567@s.whatsapp.net').valid, true);
  });

  test('validateJid rejects groups, broadcasts, channels, test IDs and empty strings', () => {
    assert.equal(validateJid('120363041234567890@g.us').valid, false);
    assert.equal(validateJid('status@broadcast').valid, false);
    assert.equal(validateJid('120363023456789@newsletter').valid, false);
    assert.equal(validateJid('test_debug@c.us').valid, false);
    assert.equal(validateJid('').valid, false);
    assert.equal(validateJid(null).valid, false);
    assert.equal(validateJid(12345).valid, false);
  });

  test('validateCatchupPayload accepts compliant catchup payloads', () => {
    const valid = {
      catchup: true,
      payload: {
        id: 'catchup_584140655276@c.us_1788585000',
        from: '584140655276@c.us',
        body: '¿Tienen bloques rojos?',
        timestamp: 1788585000,
        fromMe: false
      }
    };
    const res = validateCatchupPayload(valid);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
  });

  test('validateCatchupPayload rejects non-catchup or malformed payloads', () => {
    assert.equal(validateCatchupPayload({ catchup: false }).valid, false);
    assert.equal(validateCatchupPayload({ catchup: true, payload: { id: 'msg_123' } }).valid, false);
    assert.equal(validateCatchupPayload({
      catchup: true,
      payload: {
        id: 'catchup_123',
        from: 'bad_jid',
        body: '',
        timestamp: -1,
        fromMe: true
      }
    }).valid, false);
  });

  test('validateWahaSession validates official session states', () => {
    assert.equal(validateWahaSession({ status: 'WORKING' }).valid, true);
    assert.equal(validateWahaSession({ status: 'STOPPED' }).valid, true);
    assert.equal(validateWahaSession({ status: 'FAILED' }).valid, true);
    assert.equal(validateWahaSession({ status: 'SCAN_QR_CODE' }).valid, true);
    assert.equal(validateWahaSession({ status: 'INVALID_STATE' }).valid, false);
    assert.equal(validateWahaSession({}).valid, false);
  });

  test('validateCatchupState verifies state structure', () => {
    assert.equal(validateCatchupState({ lastRun: '2026-09-05T01:00:00Z', processed: {} }).valid, true);
    assert.equal(validateCatchupState({ lastRun: null, processed: { '584@c.us': { injectedAt: 100, timestamp: 100 } } }).valid, true);
    assert.equal(validateCatchupState({ lastRun: 12345, processed: {} }).valid, false);
  });

  test('validateWatchdogState verifies failedStreak and fields', () => {
    assert.equal(validateWatchdogState({ failedStreak: 0 }).valid, true);
    assert.equal(validateWatchdogState({ failedStreak: 3 }).valid, true);
    assert.equal(validateWatchdogState({ failedStreak: -1 }).valid, false);
    assert.equal(validateWatchdogState('not an object').valid, false);
  });
});

describe('Catchup Domain Logic', () => {
  test('maskChatId masks phone number while preserving end and domain', () => {
    assert.equal(maskChatId('584140655276@c.us'), '*********276@c.us');
    assert.equal(maskChatId('117935523786892@lid'), '************892@lid');
    assert.equal(maskChatId(null), '');
  });

  test('isHumanHandover detects human takeover in all forms', () => {
    assert.equal(isHumanHandover({ estado: 'manual' }), true);
    assert.equal(isHumanHandover({ no_atender: true }), true);
    assert.equal(isHumanHandover({ manual_desde: '2026-09-04T18:00:00Z' }), true);
    assert.equal(isHumanHandover({ estado: 'automatico' }), false);
    assert.equal(isHumanHandover(null), false);
  });

  test('isUnanswered correctly identifies unanswered customer queries', () => {
    // Caso 1: Cliente escribió a t=200, bot respondió a t=100 -> Sin contestar (true)
    assert.equal(isUnanswered({ clientTimeMs: 200000, botTimeMs: 100000 }), true);

    // Caso 2: Cliente escribió a t=100, bot respondió a t=200 -> Ya contestado (false)
    assert.equal(isUnanswered({ clientTimeMs: 100000, botTimeMs: 200000 }), false);

    // Caso 3: Cliente escribió a t=100, bot nunca respondió (botTimeMs = 0) -> Sin contestar (true)
    assert.equal(isUnanswered({ clientTimeMs: 100000, botTimeMs: 0 }), true);

    // Caso 4: Cliente escribió apenas 2s después de respuesta (margen debounce de 5s) -> false
    assert.equal(isUnanswered({ clientTimeMs: 202000, botTimeMs: 200000, marginMs: 5000 }), false);
  });

  test('buildCatchupPayload creates valid schema-checked payload', () => {
    const p = buildCatchupPayload({
      chatId: '584140655276@c.us',
      text: 'Precio de tubos 2x1',
      timestamp: 1788580000,
      nowMs: 1788580500000
    });
    assert.equal(p.catchup, true);
    assert.equal(p.payload.from, '584140655276@c.us');
    assert.equal(p.payload.body, 'Precio de tubos 2x1');
    assert.equal(p.payload.fromMe, false);
    assert.equal(p.payload.id.startsWith('catchup_584140655276@c.us_'), true);
  });

  test('parseEnv parses .env key-value pairs ignoring comments', () => {
    const raw = '# Comentario\nWAHA_API_KEY=xyz123\n\nN8N_BASE_URL=http://localhost:5678\n';
    const parsed = parseEnv(raw);
    assert.equal(parsed.WAHA_API_KEY, 'xyz123');
    assert.equal(parsed.N8N_BASE_URL, 'http://localhost:5678');
  });
});

describe('Candidate Evaluation Pipeline (TDD Scenarios)', () => {
  const NOW = 1788585000000; // t=0 base

  test('Scenario 1: Customer already answered is excluded', () => {
    const supabaseMsgs = [
      { chat_id: '584140655276@c.us', texto: 'Hola', procesado_at: new Date(NOW - 3600000).toISOString() }
    ];
    const botMsgsMap = {
      '584140655276@c.us': { created_at: new Date(NOW - 1800000).toISOString() }
    };
    const candidates = evaluateCandidates({
      supabaseMsgs,
      botMsgsMap,
      nowMs: NOW
    });
    assert.equal(candidates.length, 0);
  });

  test('Scenario 2: Customer with pending message is included', () => {
    const supabaseMsgs = [
      { chat_id: '117935523786892@lid', texto: 'Precio de tubos', procesado_at: new Date(NOW - 600000).toISOString() }
    ];
    const botMsgsMap = {
      '117935523786892@lid': { created_at: new Date(NOW - 3600000).toISOString() }
    };
    const candidates = evaluateCandidates({
      supabaseMsgs,
      botMsgsMap,
      nowMs: NOW
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].chatId, '117935523786892@lid');
    assert.equal(candidates[0].text, 'Precio de tubos');
    assert.equal(candidates[0].source, 'supabase');
  });

  test('Scenario 3: Customer with human handover (estado=manual) is excluded', () => {
    const supabaseMsgs = [
      { chat_id: '198766942527662@lid', texto: 'Okey', procesado_at: new Date(NOW - 600000).toISOString() }
    ];
    const sessionsMap = {
      '198766942527662@lid': { estado: 'manual', manual_desde: new Date(NOW - 3600000).toISOString() }
    };
    const candidates = evaluateCandidates({
      supabaseMsgs,
      sessionsMap,
      nowMs: NOW
    });
    assert.equal(candidates.length, 0);
  });

  test('Scenario 4: Message from WAHA store during n8n downtime is captured', () => {
    const wahaChats = [
      {
        id: '211673570873375@lid',
        lastMessage: {
          fromMe: false,
          body: 'Llegó el zinc azul?',
          timestamp: Math.floor((NOW - 1200000) / 1000)
        }
      }
    ];
    const candidates = evaluateCandidates({
      wahaChats,
      nowMs: NOW
    });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].chatId, '211673570873375@lid');
    assert.equal(candidates[0].text, 'Llegó el zinc azul?');
    assert.equal(candidates[0].source, 'waha_store');
  });

  test('Scenario 5: Messages older than maxAgeHours are discarded', () => {
    const oldTime = NOW - (50 * 3600 * 1000); // 50 horas de antigüedad
    const supabaseMsgs = [
      { chat_id: '584140655276@c.us', texto: 'Viejo', procesado_at: new Date(oldTime).toISOString() }
    ];
    const candidates = evaluateCandidates({
      supabaseMsgs,
      maxAgeHours: 48,
      nowMs: NOW
    });
    assert.equal(candidates.length, 0);
  });

  test('Scenario 6: Cooldown prevents duplicate injection within 15 min', () => {
    const clientTimeSec = Math.floor((NOW - 300000) / 1000);
    const supabaseMsgs = [
      { chat_id: '584140655276@c.us', texto: 'Hola', procesado_at: new Date(clientTimeSec * 1000).toISOString() }
    ];
    const processedState = {
      '584140655276@c.us': {
        injectedAt: NOW - (5 * 60 * 1000), // Inyectado hace 5 min
        timestamp: clientTimeSec
      }
    };
    const candidates = evaluateCandidates({
      supabaseMsgs,
      processedState,
      cooldownMs: 15 * 60 * 1000,
      nowMs: NOW
    });
    assert.equal(candidates.length, 0);
  });

  test('Scenario 7: Candidates are sorted chronologically by oldest inquiry first', () => {
    const supabaseMsgs = [
      { chat_id: 'chat_newer@c.us', texto: 'Nuevo', procesado_at: new Date(NOW - 300000).toISOString() },
      { chat_id: 'chat_older@c.us', texto: 'Viejo', procesado_at: new Date(NOW - 3600000).toISOString() }
    ];
    const candidates = evaluateCandidates({
      supabaseMsgs,
      nowMs: NOW
    });
    assert.equal(candidates.length, 2);
    assert.equal(candidates[0].chatId, 'chat_older@c.us');
    assert.equal(candidates[1].chatId, 'chat_newer@c.us');
  });
});

describe('Lockfile Concurrency Protection', () => {
  test('acquireLock creates lock and releaseLock cleans it', () => {
    const lockPath = path.resolve(__dirname, '../catchup.lock');
    releaseLock();
    assert.equal(fs.existsSync(lockPath), false);

    const acquired1 = acquireLock();
    assert.equal(acquired1, true);
    assert.equal(fs.existsSync(lockPath), true);

    // Segundo intento mientras el lock está activo debe denegar
    const acquired2 = acquireLock();
    assert.equal(acquired2, false);

    releaseLock();
    assert.equal(fs.existsSync(lockPath), false);
  });
});
