'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const workflow = require('../workflows/workflow_automejora.json');
const { createFakeAxios, assertAllMatched } = require('./support/fake-axios');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getNode(nodes, name) {
  const found = nodes.find(n => n.name === name);
  assert.ok(found, `Missing node "${name}"`);
  return found;
}

test('workflow_automejora uses Sonnet 5.5 with valid reasoning config and keeps nodes/activeVersion synced', () => {
  const diag = getNode(workflow.nodes, 'Sonnet AI Diagnostic Engine');
  const activeDiag = getNode(workflow.activeVersion.nodes, 'Sonnet AI Diagnostic Engine');
  const jb = diag.parameters.jsonBody;
  assert.equal(jb, activeDiag.parameters.jsonBody);
  assert.match(jb, /"anthropic\/claude-sonnet-5\.5"/);
  assert.match(jb, /reasoning:\s*\{\s*effort:\s*"low"\s*\}/);
  assert.match(jb, /max_tokens:\s*1500/);
  assert.doesNotMatch(jb.slice(3, -2), /\}\}/, 'expression must not contain nested }} delimiters');

  const expr = jb.replace(/^=\{\{/, '').replace(/\}\}$/, '').trim();
  const buildBody = new Function('$json', 'return ' + expr);
  const rendered = JSON.parse(buildBody({
    busqueda: 'cheque de media',
    query_normalizada: 'cheque media',
    motivo: 'encontrados_cero',
    contexto: '',
    candidatos: [{ codigo_interno: '05220', descripcion: 'VALVULA CHECK BRONCE X 1/2' }]
  }));
  assert.equal(rendered.model, 'anthropic/claude-sonnet-5.5');
  assert.deepEqual(rendered.reasoning, { effort: 'low' });
  assert.equal(rendered.max_tokens, 1500);
  assert.deepEqual(rendered.response_format, { type: 'json_object' });

  for (const name of ['Context & Candidates Gatherer', 'Sandbox & Auto-Apply']) {
    const code = getNode(workflow.nodes, name).parameters.jsCode;
    const activeCode = getNode(workflow.activeVersion.nodes, name).parameters.jsCode;
    assert.equal(code, activeCode, `activeVersion drifted for ${name}`);
    new AsyncFunction('$json', '$', '$env', 'require', code);
  }
});

test('Context & Candidates Gatherer short-circuits empty or single-char queries with zero HTTP calls', async () => {
  const code = getNode(workflow.nodes, 'Context & Candidates Gatherer').parameters.jsCode;
  const run = new AsyncFunction('$json', '$', '$env', 'require', code);
  const fake = createFakeAxios([]);

  for (const payload of [{}, { body: { p_busqueda: '' } }, { body: { p_busqueda: 'a' } }]) {
    const out = await run(payload, () => ({}), { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'key' }, () => fake);
    assert.deepEqual(out, []);
  }
  assert.equal(fake.requests.length, 0);
});

test('Context & Candidates Gatherer combines 70% prefix ilike and fuzzy RPC and deduplicates up to 40', async () => {
  const code = getNode(workflow.nodes, 'Context & Candidates Gatherer').parameters.jsCode;
  const run = new AsyncFunction('$json', '$', '$env', 'require', code);
  const manyIlike = Array.from({ length: 25 }, (_, i) => ({
    codigo_interno: `SKU-${i}`,
    descripcion: `CAJETIN ${i}`,
    precio_venta: 1,
    existencia: 5,
  }));
  const manyFuzzy = [
    { codigo_interno: 'SKU-0', descripcion: 'CAJETIN 0', precio_venta: 1, existencia: 5 },
    ...Array.from({ length: 25 }, (_, i) => ({
      codigo_interno: `FUZ-${i}`,
      descripcion: `CAJETIN FUZZY ${i}`,
      precio_venta: 2,
      existencia: 3,
    })),
  ];
  let seenOrQuery = '';
  let seenFuzzyTerm = '';
  const fake = createFakeAxios([
    { when: r => r.method === 'GET' && r.path === '/rest/v1/productos', reply: r => {
      seenOrQuery = decodeURIComponent(r.query);
      return manyIlike;
    } },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_fuzzy', reply: r => {
      seenFuzzyTerm = r.body.p_term;
      return manyFuzzy;
    } },
    { when: r => r.method === 'GET' && r.path === '/rest/v1/catalogo_vocabulario', reply: () => [] },
  ]);

  const out = await run(
    { body: { p_busqueda: 'tienen cajetines', query_normalizada: 'cajetin', query_tokens: ['cajetines'] } },
    () => ({}),
    { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'key' },
    () => fake
  );
  assertAllMatched(fake);
  assert.match(seenOrQuery, /descripcion\.ilike\.\*cajetines\*/);
  assert.match(seenOrQuery, /descripcion\.ilike\.\*cajetin\*/);
  assert.equal(seenFuzzyTerm, 'cajetin');
  assert.equal(out.length, 1);
  assert.equal(out[0].json.candidatos.length, 40);
});

test('Sandbox & Auto-Apply blocks ungrounded or hallucinated vocabulary from writing to catalogo_vocabulario', async () => {
  const code = getNode(workflow.nodes, 'Sandbox & Auto-Apply').parameters.jsCode;
  const run = new AsyncFunction('$json', '$', '$env', 'require', code);
  const logs = [];
  const vocabWrites = [];
  const fake = createFakeAxios([
    { when: r => r.method === 'GET' && r.path === '/rest/v1/productos', reply: () => [] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/catalogo_vocabulario', reply: r => { vocabWrites.push(r.body); return []; } },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/automejora_logs', reply: r => { logs.push(r.body); return []; } },
  ]);
  const $ = () => ({ first: () => ({ json: { busqueda: 'cheque de media', telefono: '123@lid', contexto: '' } }) });
  const sonnetResp = {
    choices: [{ message: { content: JSON.stringify({
      diagnostico: 'Posible error ASR',
      producto_identificado: { codigo_interno: 'FAKE-999', descripcion: 'ENCHUFE MEDIA VUELTA' },
      vocabulario_nuevo: { termino: 'cheque de media', canonico: 'enchufe media vuelta', categoria: 'material electrico' },
      tipo_ajuste: 'vocabulario',
    }) } }],
  };

  const out = await run(sonnetResp, $, {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'key',
    ADMIN_PHONE_NUMBERS: '584140000000@c.us',
  }, () => fake);
  assertAllMatched(fake);
  assert.equal(vocabWrites.length, 0);
  assert.equal(out[0].json.autoAplicado, false);
  assert.equal(out[0].json.simulacionExitosa, false);
  assert.equal(logs[0][0].estado, 'requiere_revision');
});

test('Sandbox & Auto-Apply blocks placeholder terms like sin_consulta without hitting productos', async () => {
  const code = getNode(workflow.nodes, 'Sandbox & Auto-Apply').parameters.jsCode;
  const run = new AsyncFunction('$json', '$', '$env', 'require', code);
  const logs = [];
  const fake = createFakeAxios([
    { when: r => r.method === 'POST' && r.path === '/rest/v1/automejora_logs', reply: r => { logs.push(r.body); return []; } },
  ]);
  const $ = () => ({ first: () => ({ json: { busqueda: 'sin_consulta', telefono: '123@lid', contexto: '' } }) });
  const sonnetResp = {
    choices: [{ message: { content: JSON.stringify({
      diagnostico: 'Consulta vacia',
      producto_identificado: null,
      vocabulario_nuevo: { termino: 'sin_consulta', canonico: 'entrada_vacia', categoria: 'error_sistema' },
      tipo_ajuste: 'vocabulario',
    }) } }],
  };

  const out = await run(sonnetResp, $, {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'key',
    ADMIN_PHONE_NUMBERS: '584140000000@c.us',
  }, () => fake);
  assertAllMatched(fake);
  assert.equal(out[0].json.autoAplicado, false);
  assert.equal(logs[0][0].estado, 'analizado');
});

test('Sandbox & Auto-Apply writes grounded vocabulary when SKU and canonical words exist in productos', async () => {
  const code = getNode(workflow.nodes, 'Sandbox & Auto-Apply').parameters.jsCode;
  const run = new AsyncFunction('$json', '$', '$env', 'require', code);
  const logs = [];
  const vocabWrites = [];
  const fake = createFakeAxios([
    { when: r => r.method === 'GET' && r.path === '/rest/v1/productos', reply: () => [{ codigo_interno: '05220' }] },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/catalogo_vocabulario', reply: r => { vocabWrites.push(r.body); return []; } },
    { when: r => r.method === 'POST' && r.path === '/rest/v1/automejora_logs', reply: r => { logs.push(r.body); return []; } },
  ]);
  const $ = () => ({ first: () => ({ json: { busqueda: 'cheque de media', telefono: '123@lid', contexto: '' } }) });
  const sonnetResp = {
    choices: [{ message: { content: JSON.stringify({
      diagnostico: 'Jerga venezolana para valvula check',
      producto_identificado: { codigo_interno: '05220', descripcion: 'VALVULA CHECK BRONCE X 1/2' },
      vocabulario_nuevo: { termino: 'cheque de media', canonico: 'valvula check 1/2', categoria: 'plomeria' },
      tipo_ajuste: 'vocabulario',
    }) } }],
  };

  const out = await run(sonnetResp, $, {
    SUPABASE_URL: 'http://supabase.test',
    SUPABASE_ANON_KEY: 'key',
    ADMIN_PHONE_NUMBERS: '584140000000@c.us',
  }, () => fake);
  assertAllMatched(fake);
  assert.equal(out[0].json.autoAplicado, true);
  assert.equal(out[0].json.simulacionExitosa, true);
  assert.equal(vocabWrites.length, 1);
  assert.equal(vocabWrites[0][0].origen, 'automejora_sonnet');
  assert.equal(vocabWrites[0][0].activo, true);
  assert.equal(vocabWrites[0][0].canonico, 'valvula check 1/2');
  assert.equal(logs[0][0].estado, 'auto_aplicado');
});
