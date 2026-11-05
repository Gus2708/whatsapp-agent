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
  reconcileCandidateWithChatHistory,
  getProcessedStateForAliases,
  parseEnv,
  normalizeToPhoneJid,
  resolveAliases
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
    assert.equal(isHumanHandover({ estado: 'automatico', manual_since: '2026-09-23T15:54:22.918Z' }), false);
    assert.equal(isHumanHandover(null), false);
  });

  test('isHumanHandover honors 30-minute TTL on manual_since while keeping no_atender sticky', () => {
    const nowMs = 1788585000000;
    const activeSince = new Date(nowMs - 15 * 60 * 1000).toISOString(); // 15 min ago (<30m)
    const expiredSince = new Date(nowMs - 31 * 60 * 1000).toISOString(); // 31 min ago (>30m)

    assert.equal(isHumanHandover({ estado: 'manual', manual_since: activeSince }, { nowMs }), true);
    assert.equal(isHumanHandover({ estado: 'manual', manual_since: expiredSince }, { nowMs }), false);
    assert.equal(isHumanHandover({ estado: 'manual', manual_since: expiredSince, no_atender: true }, { nowMs }), true);
    assert.equal(isHumanHandover({ estado: 'manual' }, { nowMs }), true);
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

  test('Scenario 2b: Employee manual reply (fromMe in WAHA) after customer message is excluded', () => {
    const clientTs = NOW - 5400000;
    const supabaseMsgs = [
      { chat_id: '584140655276@c.us', texto: '[audio]', procesado_at: new Date(clientTs).toISOString() }
    ];
    const wahaChats = [
      { id: '584140655276@c.us', lastMessage: { fromMe: true, timestamp: Math.floor((clientTs + 60000) / 1000), body: 'A su orden amigo' } }
    ];
    const candidates = evaluateCandidates({ supabaseMsgs, wahaChats, nowMs: NOW });
    assert.equal(candidates.length, 0);
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

  test('Scenario 3b: Expired manual_since (>30m) is eligible unless no_atender is true', () => {
    const supabaseMsgs = [
      { chat_id: '584121112233@c.us', texto: 'Buenos días tienen cemento?', procesado_at: new Date(NOW - 300000).toISOString() },
      { chat_id: '584129998877@c.us', texto: 'Factura proveedor', procesado_at: new Date(NOW - 300000).toISOString() }
    ];
    const sessionsMap = {
      '584121112233@c.us': { estado: 'manual', manual_since: new Date(NOW - 45 * 60 * 1000).toISOString(), no_atender: false },
      '584129998877@c.us': { estado: 'manual', manual_since: new Date(NOW - 45 * 60 * 1000).toISOString(), no_atender: true }
    };
    const candidates = evaluateCandidates({ supabaseMsgs, sessionsMap, nowMs: NOW });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].chatId, '584121112233@c.us');
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

  test('Scenario 8: Cross-alias recognition: answered on @lid excludes pending candidate on @c.us (Dignora case)', () => {
    const aliasMap = {
      '248236510068957@lid': '584126438928@s.whatsapp.net',
      '584126438928@c.us': '248236510068957@lid'
    };
    // WAHA reporta el chat con @c.us (último mensaje del cliente a las 2:48pm)
    const wahaChats = [
      {
        id: '584126438928@c.us',
        lastMessage: {
          fromMe: false,
          body: 'No lo sé pero cuando venga mí esposo le pregunto muchas gracias',
          timestamp: Math.floor((NOW - 1800000) / 1000) // 30 min atrás
        }
      }
    ];
    // Supabase tiene el mensaje procesado entrante en @lid
    const supabaseMsgs = [
      {
        chat_id: '248236510068957@lid',
        texto: 'No lo sé pero cuando venga mí esposo le pregunto muchas gracias',
        procesado_at: new Date(NOW - 1800000).toISOString()
      }
    ];
    // El bot ya respondió en vivo pero registrado bajo @lid (10 min atrás)
    const botMsgsMap = {
      '248236510068957@lid': {
        created_at: new Date(NOW - 600000).toISOString(),
        texto_norm: 'gracias a ti estamos a la orden'
      }
    };

    const candidates = evaluateCandidates({
      supabaseMsgs,
      wahaChats,
      botMsgsMap,
      aliasMap,
      nowMs: NOW
    });

    // CRÍTICO: NO debe incluirse como pendiente porque el bot ya respondió bajo el alias @lid
    assert.equal(candidates.length, 0, 'No debe disparar catchup para chat ya respondido bajo @lid');
  });

  test('Scenario 9: Cross-alias recognition: handover on @lid silences @c.us', () => {
    const aliasMap = {
      '46218277343487@lid': '584146115639@c.us',
      '584146115639@c.us': '46218277343487@lid'
    };
    const wahaChats = [
      {
        id: '584146115639@c.us',
        lastMessage: {
          fromMe: false,
          body: 'Si ok ya llego hasta alla',
          timestamp: Math.floor((NOW - 1200000) / 1000)
        }
      }
    ];
    // La sesión manual fue marcada en el LID
    const sessionsMap = {
      '46218277343487@lid': {
        estado: 'manual',
        manual_since: new Date(NOW - 1000000).toISOString()
      }
    };

    const candidates = evaluateCandidates({
      wahaChats,
      sessionsMap,
      aliasMap,
      nowMs: NOW
    });

    assert.equal(candidates.length, 0, 'No debe disparar catchup si algún alias está en handover manual');
  });

  test('Scenario 10: Descending supabaseMsgs within same second retains newest sub-second message', () => {
    const baseSecMs = Math.floor((NOW - 120000) / 1000) * 1000;
    const supabaseMsgs = [
      { chat_id: '584140655276@c.us', texto: 'Mensaje más reciente', procesado_at: new Date(baseSecMs + 850).toISOString() },
      { chat_id: '584140655276@c.us', texto: 'Mensaje anterior mismo segundo', procesado_at: new Date(baseSecMs + 150).toISOString() }
    ];
    const candidates = evaluateCandidates({ supabaseMsgs, nowMs: NOW });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].text, 'Mensaje más reciente');
  });
});

describe('Chat History Pre-Flight Reconciliation (Stale Message Prevention)', () => {
  const NOW = 1788585000000; // Today 10:50 a.m. reference

  test('Screenshot bug reproduction: drops yesterday 9:49 a.m. Zelle message and injects today 10:40 a.m. removedor query', () => {
    const yesterdayHandoffMs = NOW - (25 * 3600 * 1000 + 3 * 60 * 1000); // Yesterday 9:47 a.m.
    const yesterdayZelleMs = NOW - (25 * 3600 * 1000 + 1 * 60 * 1000);   // Yesterday 9:49 a.m.
    const todayQuestionSec = Math.floor((NOW - 10 * 60 * 1000) / 1000);  // Today 10:40 a.m.

    // Supabase only has yesterday's 9:49 a.m. message (today's arrived while n8n was down or truncated)
    const supabaseMsgs = [
      {
        chat_id: '584147654321@c.us',
        texto: 'Me da datos de zelle para cancelar y retirar personalmente',
        procesado_at: new Date(yesterdayZelleMs).toISOString()
      }
    ];
    const botMsgsMap = {
      '584147654321@c.us': { created_at: new Date(yesterdayHandoffMs).toISOString() }
    };
    const sessionsMap = {
      '584147654321@c.us': { estado: 'manual', manual_since: new Date(yesterdayHandoffMs).toISOString() }
    };

    // Overview missed the chat (outside top window), so wahaChats = []
    const pending = evaluateCandidates({
      supabaseMsgs,
      wahaChats: [],
      sessionsMap,
      botMsgsMap,
      nowMs: NOW
    });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].text, 'Me da datos de zelle para cancelar y retirar personalmente');

    // Pre-flight reconciliation fetches real WAHA chat history (newest-first as WAHA returns)
    const wahaChatHistory = [
      {
        id: 'msg_today_1040',
        fromMe: false,
        timestamp: todayQuestionSec,
        body: 'buenos días hay venden removedor de pintura'
      },
      {
        id: 'msg_yest_0949',
        fromMe: false,
        timestamp: Math.floor(yesterdayZelleMs / 1000),
        body: 'Me da datos de zelle para cancelar y retirar personalmente'
      },
      {
        id: 'msg_yest_0947',
        fromMe: true,
        timestamp: Math.floor(yesterdayHandoffMs / 1000),
        body: 'En un momento uno de nuestros asesores comerciales continuará atendiéndote de forma personalizada. ¡Muchas gracias por tu paciencia!'
      }
    ];

    const reconciled = reconcileCandidateWithChatHistory({
      candidate: pending[0],
      messages: wahaChatHistory,
      maxAgeHours: 48,
      nowMs: NOW
    });

    assert.equal(reconciled.action, 'inject');
    assert.equal(reconciled.candidate.text, 'buenos días hay venden removedor de pintura');
    assert.equal(reconciled.candidate.timestamp, todayQuestionSec);
  });

  test('groups consecutive unanswered bubbles within 30-minute burst window in chronological order', () => {
    const tBaseSec = Math.floor((NOW - 600000) / 1000);
    const staleSec = tBaseSec - 7200; // 2 hours earlier (outside 30m burst)
    const candidate = {
      chatId: '584140655276@c.us',
      text: 'buenos días',
      timestamp: tBaseSec,
      botTimeMs: (staleSec - 600) * 1000
    };

    // WAHA newest-first order + duplicate entry to test dedup
    const messages = [
      { id: 'm3', fromMe: false, timestamp: tBaseSec + 45, body: 'de un galón por favor' },
      { id: 'm2', fromMe: false, timestamp: tBaseSec + 12, body: 'venden removedor de pintura?' },
      { id: 'm2', fromMe: false, timestamp: tBaseSec + 12, body: 'venden removedor de pintura?' },
      { id: 'm1', fromMe: false, timestamp: tBaseSec, body: 'buenos días' },
      { id: 'm0_stale', fromMe: false, timestamp: staleSec, body: 'mensaje viejo de hace dos horas' }
    ];

    const res = reconcileCandidateWithChatHistory({ candidate, messages, nowMs: NOW });
    assert.equal(res.action, 'inject');
    assert.equal(res.candidate.text, 'buenos días\nvenden removedor de pintura?\nde un galón por favor');
    assert.equal(res.candidate.timestamp, tBaseSec + 45);
  });

  test('returns skip_answered when WAHA history shows an outgoing reply after the latest inbound message', () => {
    const clientSec = Math.floor((NOW - 900000) / 1000);
    const candidate = {
      chatId: '584140655276@c.us',
      text: 'Tienen tubos 2x1?',
      timestamp: clientSec,
      botTimeMs: 0
    };
    const messages = [
      { id: 'out_1', fromMe: true, timestamp: clientSec + 30, body: 'Sí amigo, a la orden' },
      { id: 'in_1', fromMe: false, timestamp: clientSec, body: 'Tienen tubos 2x1?' }
    ];

    const res = reconcileCandidateWithChatHistory({ candidate, messages, nowMs: NOW });
    assert.equal(res.action, 'skip_answered');
  });

  test('injects new unanswered message even when an older outgoing reply exists after stale candidate timestamp', () => {
    const yesterdaySec = Math.floor((NOW - 86400000) / 1000);
    const todaySec = Math.floor((NOW - 300000) / 1000);
    const candidate = {
      chatId: '584140655276@c.us',
      text: 'Consulta vieja',
      timestamp: yesterdaySec,
      botTimeMs: 0
    };
    const messages = [
      { id: 'in_today', fromMe: false, timestamp: todaySec, body: 'Tienen discos de corte?' },
      { id: 'out_yest', fromMe: true, timestamp: yesterdaySec + 60, body: 'Listo amigo' },
      { id: 'in_yest', fromMe: false, timestamp: yesterdaySec, body: 'Consulta vieja' }
    ];

    const res = reconcileCandidateWithChatHistory({ candidate, messages, nowMs: NOW });
    assert.equal(res.action, 'inject');
    assert.equal(res.candidate.text, 'Tienen discos de corte?');
    assert.equal(res.candidate.timestamp, todaySec);
  });

  test('falls back safely with action=keep when WAHA history is empty or unavailable', () => {
    const candidate = { chatId: '584140655276@c.us', text: 'Hola', timestamp: Math.floor(NOW / 1000) };
    assert.deepEqual(reconcileCandidateWithChatHistory({ candidate, messages: [], nowMs: NOW }), { action: 'keep', candidate });
    assert.deepEqual(reconcileCandidateWithChatHistory({ candidate, messages: null, nowMs: NOW }), { action: 'keep', candidate });
  });

  test('catchup_engine uses desc+limit=1000 on mensajes_procesados, limit=100 on overview, and limit=20 on chat messages', () => {
    const engineSrc = fs.readFileSync(path.resolve(__dirname, '../scripts/catchup_engine.js'), 'utf8');
    assert.match(engineSrc, /order=procesado_at\.desc&limit=1000/);
    assert.match(engineSrc, /\/api\/default\/chats\/overview\?limit=100/);
    assert.match(engineSrc, /\/messages\?limit=20&downloadMedia=false/);
    assert.ok(typeof getProcessedStateForAliases === 'function');
  });
});

describe('LID and Phone Alias Resolution', () => {
  test('normalizeToPhoneJid normalizes @s.whatsapp.net to @c.us', () => {
    assert.equal(normalizeToPhoneJid('584126438928@s.whatsapp.net'), '584126438928@c.us');
    assert.equal(normalizeToPhoneJid('584126438928@c.us'), '584126438928@c.us');
    assert.equal(normalizeToPhoneJid('248236510068957@lid'), '248236510068957@lid');
  });

  test('resolveAliases builds complete alias bidirectional set', () => {
    const aliasMap = {
      '248236510068957@lid': '584126438928@s.whatsapp.net'
    };
    const aliasesFromLid = resolveAliases('248236510068957@lid', aliasMap);
    assert.ok(aliasesFromLid.has('248236510068957@lid'));
    assert.ok(aliasesFromLid.has('584126438928@c.us'));
    assert.ok(aliasesFromLid.has('584126438928@s.whatsapp.net'));
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
