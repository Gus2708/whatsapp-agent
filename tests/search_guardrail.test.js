// Synchronous Sonnet review inside buscar_productos before a human handoff, driven through the
// real scratch_live/live_buscar.js with a hermetic axios double (OpenRouter is mocked).
const test = require('node:test');
const assert = require('node:assert');
const { buscarLive } = require('./support/load-live-buscar');
const { createFakeAxios, assertAllMatched } = require('./support/fake-axios');

const row = (codigo_interno, descripcion, existencia = 10) =>
  ({ codigo_interno, descripcion, precio_venta: 1.5, existencia });
const ROWS = [
  row('CAJ-001', 'CAJETIN 2X4 PLAST CREOLE', 40),
  row('CAJ-002', 'CAJETIN 4X2 PLASTICO EXXEL', 25),
  row('CAJ-005', 'CAJETIN OCTAGONAL 4X4 METALICO', 5),
  row('TAP-001', 'TAPA CIEGA 2X4 PLASTICA', 7),
  row('TUB-001', 'TUBO PVC AGUAS BLANCAS 1/2', 30),
];
const ENV = { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '200' };

function ilikeTerms(query) {
  return query.split('&').map(part => /^descripcion=ilike\.\*(.*)\*$/.exec(part)).filter(Boolean)
    .map(m => decodeURIComponent(m[1]).toLowerCase());
}

// sonnet(body) -> content string | Promise (never resolving => timeout)
function fakeFor({ sonnet, vocabulario = [] } = {}) {
  const calls = { openrouter: [], automejora: [] };
  const fake = createFakeAxios([
    { when: r => r.method === 'GET' && r.path === '/rest/v1/catalogo_vocabulario', reply: () => vocabulario },
    { when: r => r.method === 'GET' && ['/rest/v1/busqueda_aprendizaje', '/rest/v1/busqueda_negativa',
      '/rest/v1/catalogo_vocab_categorias'].includes(r.path), reply: () => [] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/rpc/popularidad_productos', reply: () => [] },
    { when: r => r.method === 'POST' && ['/rest/v1/rpc/buscar_productos', '/rest/v1/rpc/buscar_fuzzy'].includes(r.path),
      reply: () => [] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/presupuesto_config', reply: () => [{ markup_porcentaje: 30 }] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/tazas', reply: () => [{ bcv_usd: 40 }] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/productos', reply: r => {
      const terms = ilikeTerms(r.query);
      return terms.length ? ROWS.filter(p => terms.every(t => p.descripcion.toLowerCase().includes(t))) : [];
    } },
    { when: r => r.method === 'POST' && r.path === '/webhook/automejora-busqueda',
      reply: r => { calls.automejora.push(r.body); return {}; } },
    { when: r => r.method === 'POST' && r.origin === 'https://openrouter.ai', reply: r => {
      calls.openrouter.push(r.body);
      const content = sonnet ? sonnet(r.body) : '{"coincidencias":[]}';
      return content && typeof content.then === 'function' ? content
        : { choices: [{ message: { content } }] };
    } },
  ]);
  return { fake, calls };
}

async function buscar(q, { env = ENV, ...opts } = {}) {
  const { fake, calls } = fakeFor(opts);
  const { result } = await buscarLive(q, { fake, env });
  assertAllMatched(fake);
  return { result, calls };
}

const match = (codigo, confianza = 5) => JSON.stringify({ coincidencias: [{ codigo, confianza }] });

test('a confident Sonnet match turns a missing search into a confirmable found result', async () => {
  const { result, calls } = await buscar('tienen cajetimes 2x4', { sonnet: () => match('CAJ-001') });
  assert.strictEqual(calls.openrouter.length, 1);
  const body = calls.openrouter[0];
  assert.strictEqual(body.model, 'anthropic/claude-sonnet-5');
  assert.strictEqual(body.temperature, 0.1);
  assert.deepStrictEqual(body.response_format, { type: 'json_object' });
  const prompt = body.messages.map(m => m.content).join('\n');
  assert.match(prompt, /CAJ-001 \| CAJETIN 2X4 PLAST CREOLE/, 'candidates come from normalized token prefixes');
  assert.strictEqual(result._guardrail, true);
  assert.strictEqual(result.action, 'confirm');
  assert.strictEqual(result.requires_confirmation, true);
  assert.strictEqual(result.encontrados, 1);
  assert.deepStrictEqual(result.productos.map(p => p.nombre), ['Cajetin 2X4 Plast Creole']);
  assert.ok(result.productos[0].precio_divisas_texto, 'same product shape as a normal found result');
  assert.strictEqual(calls.automejora.length, 1, 'the learning webhook still fires');
  assert.strictEqual(calls.automejora[0].query_normalizada, 'cajetime 2x4');
});

test('the review model comes from SEARCH_GUARDRAIL_MODEL when set', async () => {
  const { calls } = await buscar('cajetimes 2x4', { env: { ...ENV, SEARCH_GUARDRAIL_MODEL: 'anthropic/other' },
    sonnet: () => match('CAJ-001') });
  assert.strictEqual(calls.openrouter[0].model, 'anthropic/other');
});

for (const [name, sonnet] of [
  ['a timeout', () => new Promise(() => {})],
  ['invalid JSON', () => 'not json at all'],
  ['low confidence', () => match('CAJ-001', 3)],
  ['a code that is not a candidate', () => match('INVENTED-9')],
  ['an empty match list', () => '{"coincidencias":[]}'],
]) {
  test(`${name} falls back to the existing missing handoff`, async () => {
    const { result, calls } = await buscar('cajetimes 2x4', { sonnet });
    assert.strictEqual(calls.openrouter.length, 1);
    assert.strictEqual(result.action, 'handoff');
    assert.strictEqual(result.match_status, 'missing');
    assert.strictEqual(result.encontrados, 0);
    assert.strictEqual(result._guardrail, undefined);
  });
}

test('SEARCH_GUARDRAIL_MODE=off and a missing key skip the review entirely', async () => {
  for (const env of [{ ...ENV, SEARCH_GUARDRAIL_MODE: 'off' }, { SEARCH_GUARDRAIL_TIMEOUT_MS: '200' }]) {
    const { result, calls } = await buscar('cajetimes 2x4', { env, sonnet: () => match('CAJ-001') });
    assert.strictEqual(calls.openrouter.length, 0);
    assert.strictEqual(result.match_status, 'missing');
  }
});

test('a weak match that would hand off is reviewed too', async () => {
  // The dictionary branch maps the typo to an unrelated product, so the top result shares no
  // word with the request (weak -> handoff today).
  const vocabulario = [{ termino: 'cajetimes', canonico: 'tapa ciega' }];
  const base = await buscar('cajetimes 2x4', { vocabulario, env: { ...ENV, SEARCH_GUARDRAIL_MODE: 'off' } });
  assert.strictEqual(base.result.match_status, 'weak', 'fixture must reproduce the weak handoff');
  const { result, calls } = await buscar('cajetimes 2x4', { vocabulario, sonnet: () => match('CAJ-002', 4) });
  assert.strictEqual(calls.openrouter.length, 1);
  assert.strictEqual(result._guardrail, true);
  assert.strictEqual(result.action, 'confirm');
  assert.deepStrictEqual(result.productos.map(p => p.nombre), ['Cajetin 4X2 Plastico Exxel']);
});
