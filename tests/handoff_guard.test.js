const test = require('node:test');
const assert = require('node:assert/strict');

const FALLBACK = 'Disculpa 🙏, se me enredó un cable procesando eso 👨🏻‍🔧. ¿Me repites qué necesitas (o tu lista de materiales)? Así te lo busco y te armo el presupuesto enseguida 🪚';

const norm = (t) => String(t || '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);

const PLANTILLAS_BOT = [
  norm('En un momento uno de nuestros asesores comerciales continuará atendiéndote de forma personalizada. ¡Muchas gracias por tu paciencia!'),
  norm('Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚'),
  norm("👨🏻‍🔧 ¡Hola! Soy *Perucho*, el bot de Ferretería El Serrucho 🪚. Solo respondo mensajes de *texto*, 🎤 *notas de voz* e 🖼️ *imágenes*. Si enviaste un video o documento, por favor escríbeme lo que necesitas 📝"),
  norm(FALLBACK),
].filter(Boolean);

const MIN_INCL = 40;
const coincide = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) && b.length >= MIN_INCL) return true;
  if (b.includes(a) && a.length >= MIN_INCL) return true;
  return false;
};

// Pure logic extracted from Sanitize Agent Output node
function sanitizeAgentOutput(items) {
  for (const item of items) {
    const out = item?.json ? item.json.output : undefined;
    const hasError = !!(item?.json && item.json.error);
    const isBlank = !out || typeof out !== 'string' || !out.trim();

    if (hasError || isBlank) {
      item.json = item.json || {};
      item.json.output = FALLBACK;
      item.json._sanitized = true;
      continue;
    }
  }
  return items;
}

// Pure logic extracted from Detectar Handoff Empleado node
async function classifyHandoff({ payload, mensajesBotPool = [], mockSupabaseCalls = [] }) {
  if (!payload) return { skip: 'sin_payload' };
  const cliente = payload.to || payload.from || null;
  if (!cliente || /@g\.us|@broadcast|@newsletter/.test(cliente)) {
    return { skip: 'no_cliente', cliente };
  }

  let texto = '';
  try { texto = payload.body || (payload._data && payload._data.body) || ''; } catch (e) {}
  let ntext = norm(texto);

  if (!ntext) {
    // Empty outgoing text must never trigger human handoff
    return { skip: 'sin_texto', cliente };
  }

  let esBot = false;
  for (const tpl of PLANTILLAS_BOT) {
    if (coincide(ntext, tpl)) { esBot = true; break; }
  }
  if (!esBot) {
    for (const rw of mensajesBotPool) {
      const s = rw.texto_norm || '';
      if (coincide(s, ntext)) { esBot = true; break; }
    }
  }

  if (esBot) return { esBot: true, cliente };

  // Track the DB call
  mockSupabaseCalls.push({ telefono: cliente, estado: 'manual' });
  return { esBot: false, handoff: true, cliente };
}

test('Sanitizer replaces agent error with fallback text', () => {
  const items = [{ json: { error: 'Connection error.' } }];
  const result = sanitizeAgentOutput(items);
  assert.equal(result[0].json.output, FALLBACK);
  assert.equal(result[0].json._sanitized, true);
});

test('Sanitizer replaces empty string output with fallback text', () => {
  const items = [{ json: { output: '   ' } }];
  const result = sanitizeAgentOutput(items);
  assert.equal(result[0].json.output, FALLBACK);
  assert.equal(result[0].json._sanitized, true);
});

test('Sanitizer preserves valid agent output', () => {
  const items = [{ json: { output: 'Hola, tenemos cemento a $8 la bolsa.' } }];
  const result = sanitizeAgentOutput(items);
  assert.equal(result[0].json.output, 'Hola, tenemos cemento a $8 la bolsa.');
  assert.equal(result[0].json._sanitized, undefined);
});

test('Handoff detector skips empty outgoing text without marking manual', async () => {
  const dbCalls = [];
  const result = await classifyHandoff({
    payload: { to: '584241234567@s.whatsapp.net', fromMe: true, body: '' },
    mockSupabaseCalls: dbCalls,
  });
  assert.equal(result.skip, 'sin_texto');
  assert.equal(dbCalls.length, 0, 'Must not call Supabase to mark manual');
});

test('Handoff detector skips whitespace-only outgoing text', async () => {
  const dbCalls = [];
  const result = await classifyHandoff({
    payload: { to: '584241234567@s.whatsapp.net', fromMe: true, body: '   \n  ' },
    mockSupabaseCalls: dbCalls,
  });
  assert.equal(result.skip, 'sin_texto');
  assert.equal(dbCalls.length, 0);
});

test('Handoff detector recognizes fallback template as bot message', async () => {
  const dbCalls = [];
  const result = await classifyHandoff({
    payload: { to: '584241234567@s.whatsapp.net', fromMe: true, body: FALLBACK },
    mockSupabaseCalls: dbCalls,
  });
  assert.equal(result.esBot, true);
  assert.equal(dbCalls.length, 0);
});

test('Handoff detector flags human employee response as manual handoff', async () => {
  const dbCalls = [];
  const result = await classifyHandoff({
    payload: { to: '584241234567@s.whatsapp.net', fromMe: true, body: 'Buenas tardes amigo, ya le consigo el precio del zinc' },
    mensajesBotPool: [],
    mockSupabaseCalls: dbCalls,
  });
  assert.equal(result.handoff, true);
  assert.equal(result.esBot, false);
  assert.equal(dbCalls.length, 1);
  assert.equal(dbCalls[0].estado, 'manual');
});
