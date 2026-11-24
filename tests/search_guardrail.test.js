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

function ilikeGroups(query) {
  const groups = [];
  for (const part of String(query || '').split('&')) {
    if (part.startsWith('or=(') && part.includes('descripcion.ilike.')) {
      const terms = [];
      for (const cond of part.slice(4, -1).split(',')) {
        const m = /descripcion\.ilike\.\*(.*)\*$/.exec(cond);
        if (m) terms.push(decodeURIComponent(m[1]).toLowerCase());
      }
      if (terms.length) groups.push(terms);
    } else {
      const m = /^descripcion=ilike\.\*(.*)\*$/.exec(part);
      if (m) groups.push([decodeURIComponent(m[1]).toLowerCase()]);
    }
  }
  return groups;
}

// sonnet(body) -> content string | Promise (never resolving => timeout)
function fakeFor({ sonnet, vocabulario = [], rows = ROWS, fuzzyRows, rpcRows, jevScores } = {}) {
  const calls = { openrouter: [], automejora: [], jev: [] };
  const fake = createFakeAxios([
    { when: r => r.method === 'GET' && r.path === '/rest/v1/catalogo_vocabulario', reply: () => vocabulario },
    { when: r => r.method === 'GET' && ['/rest/v1/busqueda_aprendizaje', '/rest/v1/busqueda_negativa',
      '/rest/v1/catalogo_vocab_categorias'].includes(r.path), reply: () => [] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/rpc/popularidad_productos', reply: () => [] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_productos',
      reply: r => typeof rpcRows === 'function' ? rpcRows(r.body) : [] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_fuzzy',
      reply: r => typeof fuzzyRows === 'function' ? fuzzyRows(r.body) : [] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/presupuesto_config', reply: () => [{ markup_porcentaje: 30 }] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/tazas', reply: () => [{ bcv_usd: 40 }] },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/productos', reply: r => {
      const groups = ilikeGroups(r.query);
      return groups.length ? rows.filter(p => groups.every(g => g.some(t => p.descripcion.toLowerCase().includes(t)))) : [];
    } },
    { when: r => r.method === 'POST' && r.path === '/webhook/automejora-busqueda',
      reply: r => { calls.automejora.push(r.body); return {}; } },
    { when: r => r.method === 'POST' && r.origin === 'https://ai-gateway.vercel.sh', reply: r => {
      calls.jev.push(r.body);
      const scores = typeof jevScores === 'function' ? jevScores(r.body) : (jevScores || []);
      const answers = Object.fromEntries(Object.keys(r.body.questions).map((k, i) => [k, { probability: scores[i] ?? 0.1 }]));
      return { answers };
    } },
    { when: r => r.method === 'POST' && r.origin === 'https://openrouter.ai', reply: r => {
      calls.openrouter.push(r.body);
      const content = typeof sonnet === 'function' ? sonnet(r.body, calls.openrouter.length) : '{"coincidencias":[]}';
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
  assert.strictEqual(body.model, 'anthropic/claude-sonnet-5.5');
  assert.strictEqual(body.temperature, 0.1);
  assert.deepStrictEqual(body.reasoning, { effort: 'low' });
  assert.ok(body.max_tokens >= 1000);
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

test('multi-round deep investigation starts from zero initial candidates and rescues Venezuelan slang', async () => {
  const catalogRows = [
    ...ROWS,
    row('CHK-001', 'VALVULA CHECK BRONCE X 1/2 ASIENTO WL-120', 18),
  ];
  const { result, calls } = await buscar('cheque de media', {
    rows: catalogRows,
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '5000', SEARCH_GUARDRAIL_MAX_ROUNDS: '2' },
    sonnet: (body, turn) => {
      const userPrompt = body.messages[1].content;
      if (turn === 1) {
        assert.match(userPrompt, /ninguno aun/i);
        return JSON.stringify({ accion: 'buscar', consultas: ['valvula check 1/2'], razon: 'cheque de media es valvula check 1/2' });
      }
      assert.match(userPrompt, /CHK-001 \| VALVULA CHECK BRONCE X 1\/2/);
      return JSON.stringify({ accion: 'responder', coincidencias: [{ codigo: 'CHK-001', confianza: 5 }], razon: 'coincide exacto' });
    }
  });
  assert.strictEqual(calls.openrouter.length, 2);
  assert.strictEqual(result._guardrail, true);
  assert.strictEqual(result._guardrail_rounds, 2);
  assert.strictEqual(result.action, 'confirm');
  assert.strictEqual(result.encontrados, 1);
  assert.match(result.productos[0].nombre, /Valvula Check Bronce X 1\/2/i);
});

test('deep investigation fails open to missing handoff when Sonnet reports no_encontrado or search yields zero candidates', async () => {
  // Case 1: search returns 0 candidates on final round -> short-circuits without wasting a 2nd LLM call
  const resEmpty = await buscar('tejas asfalticas', {
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '5000', SEARCH_GUARDRAIL_MAX_ROUNDS: '1' },
    sonnet: () => JSON.stringify({ accion: 'buscar', consultas: ['teja asfaltica'], razon: 'buscar tejas' })
  });
  assert.strictEqual(resEmpty.calls.openrouter.length, 1);
  assert.strictEqual(resEmpty.result.action, 'handoff');
  assert.strictEqual(resEmpty.result.match_status, 'missing');
  assert.strictEqual(resEmpty.result._guardrail, undefined);

  // Case 2: search returns unrelated candidate -> Round 2 runs and Sonnet returns no_encontrado
  const resNo = await buscar('tejas asfalticas', {
    rows: [row('PIN-1', 'PINTURA ROJO TEJA', 5)],
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '5000', SEARCH_GUARDRAIL_MAX_ROUNDS: '1' },
    sonnet: (_body, turn) => turn === 1
      ? JSON.stringify({ accion: 'buscar', consultas: ['pintura teja'], razon: 'buscar tejas' })
      : JSON.stringify({ accion: 'no_encontrado', coincidencias: [], razon: 'pintura no es teja asfaltica' })
  });
  assert.strictEqual(resNo.calls.openrouter.length, 2);
  assert.strictEqual(resNo.result.action, 'handoff');
  assert.strictEqual(resNo.result.match_status, 'missing');
  assert.strictEqual(resNo.result._guardrail, undefined);
});

test('post-JEV qualifier rejection triggers Sonnet guardrail rescue when OPENROUTER_API_KEY is configured', async () => {
  const catalogRows = [
    row('TAB-001', 'TABLERO 6 CIRCUITOS BRICKELL', 12),
    row('TAB-002', 'TABLERO P/BREAKERS 4 LINEAS', 9),
  ];
  const { result, calls } = await buscar('tablero largo', {
    rows: catalogRows,
    jevScores: [0.1, 0.2],
    env: {
      OPENROUTER_API_KEY: 'test-openrouter-key',
      SEARCH_GUARDRAIL_TIMEOUT_MS: '5000',
      JEV_PRODUCT_QUALIFIER_MODE: 'enforce',
      JEV_PROVIDER: 'vercel',
      JEV_MODEL: 'typesafe-ai/jev',
      AI_GATEWAY_API_KEY: 'test-gateway-key',
    },
    sonnet: (body) => {
      assert.match(body.messages[1].content, /jev_qualifier_rejected/);
      return JSON.stringify({ accion: 'responder', coincidencias: [{ codigo: 'TAB-001', confianza: 5 }] });
    }
  });
  assert.strictEqual(calls.jev.length, 1);
  assert.strictEqual(calls.openrouter.length, 1);
  assert.strictEqual(result._guardrail, true);
  assert.strictEqual(result.action, 'confirm');
  assert.strictEqual(result.productos.length, 1);
  assert.match(result.productos[0].nombre, /Tablero 6 Circuitos Brickell/i);
  assert.ok(calls.automejora.some(a => a.motivo === 'jev_qualifier_rejected'));
});

test('buscar_productos_tool safely consumes single-item Jev Shadow context without breaking multi-product turns', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const source = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8')
    .replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('query', 'axios', '$env', '$', source);

  const runWithShadow = async (q, shadowItems) => {
    const { fake, calls } = fakeFor({
      rows: [row('ELE-1', 'CABLE THWN #12 NEGRO', 20)],
      sonnet: () => '{"accion":"no_encontrado","coincidencias":[]}'
    });
    const $ = (name) => name === 'Jev Shadow Decision' ? { all: () => shadowItems } : { all: () => [] };
    const out = JSON.parse(await run({ p_busqueda: q }, fake, {
      SUPABASE_URL: 'http://supabase.test',
      SUPABASE_ANON_KEY: 'test-anon-key',
      OPENROUTER_API_KEY: 'test-openrouter-key',
      SEARCH_GUARDRAIL_TIMEOUT_MS: '5000',
    }, $));
    assertAllMatched(fake);
    return { out, calls };
  };

  // 1) Unclear local query receives Jev Shadow department/problem hints in guardrail prompt
  const unclearRes = await runWithShadow('algo hermetico rarox', [{
    json: { jev_shadow: { status: 'ok', department: 'plomeria_griferia', department_confidence: 0.94,
      material: 'general_o_no_aplica', material_confidence: 0.9, problem_intent: 'fuga_agua_plomeria', problem_intent_confidence: 0.91 } }
  }]);
  assert.match(unclearRes.calls.openrouter[0].messages[1].content, /departamento=plomeria_griferia.*problema=fuga_agua_plomeria/);

  // 2) Clear local query (cables) is NOT overridden by unrelated Jev Shadow department (multi-product guard)
  const cableRes = await runWithShadow('cable thwn #12', [{
    json: { jev_shadow: { status: 'ok', department: 'plomeria_griferia', department_confidence: 0.99,
      problem_intent: 'fuga_agua_plomeria', problem_intent_confidence: 0.99 } }
  }]);
  assert.strictEqual(cableRes.out.action, 'show_results');
  assert.match(cableRes.out.productos[0].nombre, /Cable Thwn #12 Negro/i);

  // 3) Multi-item Jev Shadow array (.length > 1) is ignored completely
  const multiRes = await runWithShadow('algo hermetico rarox', [
    { json: { jev_shadow: { status: 'ok', department: 'plomeria_griferia', department_confidence: 0.95 } } },
    { json: { jev_shadow: { status: 'ok', department: 'pinturas', department_confidence: 0.95 } } },
  ]);
  assert.doesNotMatch(multiRes.calls.openrouter[0].messages[1].content, /Pistas semanticas \(JEV\)/);

  // 4) JEV_SEARCH_ALIGNMENT_MODE=off disables reading Jev Shadow Decision even for 1 item
  const { fake: offFake, calls: offCalls } = fakeFor({
    rows: [row('ELE-1', 'CABLE THWN #12 NEGRO', 20)],
    sonnet: () => '{"accion":"no_encontrado","coincidencias":[]}'
  });
  await run({ p_busqueda: 'algo hermetico rarox' }, offFake, {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'test-anon-key',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    SEARCH_GUARDRAIL_TIMEOUT_MS: '5000',
    JEV_SEARCH_ALIGNMENT_MODE: 'off',
  }, () => ({ all: () => [{ json: { jev_shadow: { status: 'ok', department: 'plomeria_griferia', department_confidence: 0.95 } } }] }));
  assertAllMatched(offFake);
  assert.doesNotMatch(offCalls.openrouter[0].messages[1].content, /Pistas semanticas \(JEV\)/);
});

test('reasoning effort config honors valid values, rejects invalid to low, and never sets enabled:false', async () => {
  const med = await buscar('cajetimes 2x4', {
    env: { ...ENV, SEARCH_GUARDRAIL_REASONING_EFFORT: 'medium' },
    sonnet: () => match('CAJ-001')
  });
  assert.deepStrictEqual(med.calls.openrouter[0].reasoning, { effort: 'medium' });

  const invalid = await buscar('cajetimes 2x4', {
    env: { ...ENV, SEARCH_GUARDRAIL_REASONING_EFFORT: 'off' },
    sonnet: () => match('CAJ-001')
  });
  assert.deepStrictEqual(invalid.calls.openrouter[0].reasoning, { effort: 'low' });
  assert.strictEqual(invalid.calls.openrouter[0].reasoning.enabled, undefined);
});

test('duplicate consultas break cleanly, broad text-only ilike finds hyphenated measures, and in-stock rows sort first', async () => {
  // 1) Duplicate consulta in round 2 stops extra search rounds without throwing
  const dup = await buscar('tejas asfalticas', {
    rows: [row('PIN-1', 'PINTURA ROJO TEJA', 5)],
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '5000', SEARCH_GUARDRAIL_MAX_ROUNDS: '3' },
    sonnet: () => JSON.stringify({ accion: 'buscar', consultas: ['pintura teja'] })
  });
  assert.strictEqual(dup.calls.openrouter.length, 2);
  assert.strictEqual(dup.result.action, 'handoff');

  // 2) Broad text-only ilike matches hyphenated measure "1-2" when Sonnet searches "valvula check 1/2",
  //    and in-stock item appears before out-of-stock item even if Sonnet listed out-of-stock first.
  const hyphenRows = [
    row('CHK-OUT', 'VALVULA CHECK 1-2 ECONOMICA', 0),
    row('CHK-IN', 'VALVULA CHECK 1-2 BRONCE', 14),
  ];
  const broad = await buscar('cheque de media', {
    rows: hyphenRows,
    env: { OPENROUTER_API_KEY: 'test-openrouter-key', SEARCH_GUARDRAIL_TIMEOUT_MS: '5000', SEARCH_GUARDRAIL_MAX_ROUNDS: '2' },
    sonnet: (_body, turn) => turn === 1
      ? JSON.stringify({ accion: 'buscar', consultas: ['valvula check 1/2'] })
      : JSON.stringify({ accion: 'responder', coincidencias: [{ codigo: 'CHK-OUT', confianza: 5 }, { codigo: 'CHK-IN', confianza: 5 }] })
  });
  assert.strictEqual(broad.result._guardrail, true);
  assert.strictEqual(broad.result.productos.length, 2);
  assert.strictEqual(broad.result.productos[0].disponible, true);
  assert.strictEqual(broad.result.productos[1].disponible, false);
});

test('docker-compose.yml and .env.example declare Sonnet 5.5 guardrail and JEV alignment defaults', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
  const example = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  for (const needle of [
    /SEARCH_GUARDRAIL_MODE=\$\{SEARCH_GUARDRAIL_MODE:-enforce\}/,
    /SEARCH_GUARDRAIL_MODEL=\$\{SEARCH_GUARDRAIL_MODEL:-anthropic\/claude-sonnet-5\.5\}/,
    /SEARCH_GUARDRAIL_TIMEOUT_MS=\$\{SEARCH_GUARDRAIL_TIMEOUT_MS:-15000\}/,
    /SEARCH_GUARDRAIL_MAX_ROUNDS=\$\{SEARCH_GUARDRAIL_MAX_ROUNDS:-2\}/,
    /SEARCH_GUARDRAIL_REASONING_EFFORT=\$\{SEARCH_GUARDRAIL_REASONING_EFFORT:-low\}/,
    /JEV_TIMEOUT_MS=\$\{JEV_TIMEOUT_MS:-2500\}/,
    /JEV_SEARCH_ALIGNMENT_MODE=\$\{JEV_SEARCH_ALIGNMENT_MODE:-enforce\}/,
  ]) {
    assert.match(compose, needle);
  }
  for (const needle of [
    /^SEARCH_GUARDRAIL_MODE=enforce$/m,
    /^SEARCH_GUARDRAIL_MODEL=anthropic\/claude-sonnet-5\.5$/m,
    /^SEARCH_GUARDRAIL_TIMEOUT_MS=15000$/m,
    /^SEARCH_GUARDRAIL_MAX_ROUNDS=2$/m,
    /^SEARCH_GUARDRAIL_REASONING_EFFORT=low$/m,
    /^JEV_TIMEOUT_MS=2500$/m,
    /^JEV_SEARCH_ALIGNMENT_MODE=enforce$/m,
  ]) {
    assert.match(example, needle);
  }
});
