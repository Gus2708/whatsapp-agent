'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buscarLive, buildFakeAxios } = require('./support/load-live-buscar');
const { qualifyProductCandidates } = require('../lib/jev-product-qualifier');

const rows = [
  { codigo_interno: 'S1', descripcion: 'TORNILLO GALVANIZADO 2 PULGADAS', precio_venta: 2, existencia: 7 },
  { codigo_interno: 'S2', descripcion: 'BUSHING GALVANIZADO 2 PULGADAS', precio_venta: 3, existencia: 9 },
];
const env = { JEV_PRODUCT_QUALIFIER_MODE: 'enforce', JEV_PROVIDER: 'vercel',
  AI_GATEWAY_API_KEY: 'synthetic-key', JEV_MODEL: 'typesafe-ai/jev' };

function withJev(scores, options = {}) {
  const base = buildFakeAxios(rows);
  const calls = [];
  const fake = {
    ...base,
    post: async (url, body, config) => {
      if (url !== 'https://ai-gateway.vercel.sh/v1/evaluate') return base.post(url, body, config);
      calls.push({ body, config });
      if (options.error) throw options.error;
      const answers = Object.fromEntries(Object.keys(body.questions).map((name, i) =>
        [name, { probability: scores[i] }]));
      return { data: options.response || { answers } };
    },
  };
  return { fake, calls };
}

test('disabled and exact matches never call Jev', async () => {
  const disabled = withJev([0]);
  await buscarLive('tornillo galvanizado', { fake: disabled.fake, env: { ...env, JEV_PRODUCT_QUALIFIER_MODE: 'off' } });
  assert.equal(disabled.calls.length, 0);
  const exact = withJev([0]);
  await buscarLive('tornillo galvanizado', { fake: exact.fake, env });
  assert.equal(exact.calls.length, 0);
  const measureMismatch = withJev([0.99, 0.99]);
  const measured = (await buscarLive('galvanizado 9mm', { fake: measureMismatch.fake, env })).result;
  assert.equal(measured.match_status, 'measure_mismatch');
  assert.equal(measureMismatch.calls.length, 0);
});

test('enforce filters irrelevant relaxed candidates using one bounded Vercel request', async () => {
  const { fake, calls } = withJev([0.12, 0.91]);
  const { result } = await buscarLive('galvanizado largo', { fake, env });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.model, 'typesafe-ai/jev');
  assert.equal(Object.keys(calls[0].body.questions).length, 2);
  assert.equal(calls[0].config.headers.Authorization, 'Bearer synthetic-key');
  assert.ok(calls[0].config.timeout > 0 && calls[0].config.timeout <= 1500);
  assert.equal(calls[0].config.maxRedirects, 0);
  assert.ok(calls[0].config.maxBodyLength <= 8192);
  assert.ok(calls[0].config.maxContentLength <= 16384);
  assert.equal(result.encontrados, 1);
  assert.match(result.productos[0].nombre, /Tornillo/i);
  assert.notEqual(result.match_status, 'exact');
  assert.equal(result.action, 'confirm');
  assert.equal('jev_relevance' in result.productos[0], false);
});

test('enforce keeps borderline candidates for confirmation and hands off when all are rejected', async () => {
  const borderline = withJev([0.1, 0.6]);
  const b = (await buscarLive('galvanizado largo', { fake: borderline.fake, env })).result;
  assert.equal(b.encontrados, 1);
  assert.equal(b.action, 'confirm');
  const rejected = withJev([0.1, 0.2]);
  const r = (await buscarLive('galvanizado largo', { fake: rejected.fake, env })).result;
  assert.equal(r.encontrados, 0);
  assert.deepEqual(r.productos, []);
  assert.equal(r.action, 'handoff');
  assert.equal(r.match_status, 'missing');
});

test('shadow and failed evaluations preserve customer-facing output', async () => {
  const baseline = (await buscarLive('galvanizado largo', { rows })).result;
  const shadow = withJev([0.1, 0.1]);
  const originalInfo = console.info;
  const logs = [];
  let observed;
  try {
    console.info = (...args) => logs.push(args);
    observed = (await buscarLive('galvanizado largo', { fake: shadow.fake,
      env: { ...env, JEV_PRODUCT_QUALIFIER_MODE: 'shadow' } })).result;
  } finally { console.info = originalInfo; }
  assert.equal(shadow.calls.length, 1);
  assert.deepEqual(observed, baseline);
  const metric = JSON.parse(logs[0][1]);
  assert.deepEqual(metric.scores.map(x => x.code), ['S2', 'S1']);
  assert.deepEqual(metric.scores.map(x => x.probability), [0.1, 0.1]);
  assert.doesNotMatch(JSON.stringify(metric), /galvanizado largo|synthetic-key/);
  const failed = withJev([], { error: new Error('timeout') });
  const fallback = (await buscarLive('galvanizado largo', { fake: failed.fake, env })).result;
  assert.deepEqual(fallback, baseline);
});

test('malformed response fails open and never reads or sends price and stock', async () => {
  const baseline = (await buscarLive('galvanizado largo', { rows })).result;
  const malformed = withJev([], { response: { answers: { candidate_0: { probability: 0.01 } } } });
  const result = (await buscarLive('galvanizado largo', { fake: malformed.fake, env })).result;
  assert.deepEqual(result, baseline);
  const request = JSON.stringify(malformed.calls[0].body);
  assert.doesNotMatch(request, /precio_venta|existencia|synthetic-key/);
});

test('provider and key gates prevent requests; malformed probabilities fail open', async () => {
  for (const invalidEnv of [
    { ...env, JEV_PROVIDER: 'typesafe' },
    { ...env, AI_GATEWAY_API_KEY: '' },
    { ...env, JEV_MODEL: 'other/model' },
  ]) {
    const testCase = withJev([0.1, 0.1]);
    const { result } = await buscarLive('galvanizado largo', { fake: testCase.fake, env: invalidEnv });
    assert.equal(testCase.calls.length, 0);
    assert.equal(result.encontrados, 2);
  }
  const bad = withJev([], { response: { answers: {
    candidate_0: { probability: '0.1' }, candidate_1: { probability: 0.1 },
  } } });
  const { result } = await buscarLive('galvanizado largo', { fake: bad.fake, env });
  assert.equal(result.encontrados, 2);
});

test('qualifier caps evaluation at four displayed candidates and scrubs obvious contact data', async () => {
  let request;
  const products = Array.from({ length: 4 }, (_, i) => ({ nombre: 'Item ' + i }));
  const candidates = products.map((_, i) => ({ descripcion: 'ITEM ' + i + ' buyer@mail.test' }));
  const output = { encontrados: 4, productos: products, match_status: 'relaxed', action: 'confirm' };
  const axios = { post: async (_url, body) => {
    request = body;
    return { data: { answers: Object.fromEntries(Object.keys(body.questions).map(k => [k, { probability: 0.9 }])) } };
  } };
  await qualifyProductCandidates({ axios, env, query: 'Llámame al +584121234567 buyer@mail.test por sellador',
    candidates, output, eligible: true });
  assert.equal(Object.keys(request.questions).length, 4);
  assert.doesNotMatch(JSON.stringify(request), /584121234567|buyer@mail\.test/);
  assert.equal(output.encontrados, 4);
  assert.equal(output.match_status, 'relaxed');
});

test('reranking clears metadata tied to a rejected top candidate', async () => {
  const products = [{ nombre: 'Wrong', precio_divisas_texto: '3$' },
    { nombre: 'Right', precio_divisas_texto: '2$' }];
  const output = { encontrados: 2, productos: products, match_status: 'semantic', action: 'confirm',
    parcial: true, rescate: 'wrong_category', kit_sugerido: { nombre: 'Wrong kit' },
    instruccion: 'Ask whether wrong_category was intended' };
  const axios = { post: async () => ({ data: { answers: {
    candidate_0: { probability: 0.1 }, candidate_1: { probability: 0.92 },
  } } }) };
  await qualifyProductCandidates({ axios, env, query: 'Necesito una solución',
    candidates: [{ codigo_interno: 'A', descripcion: 'WRONG' },
      { codigo_interno: 'B', descripcion: 'RIGHT' }], output, eligible: true });
  assert.deepEqual(output.productos, [products[1]]);
  assert.equal(output.productos[0].precio_divisas_texto, '2$');
  assert.equal(output.rescate, undefined);
  assert.equal(output.kit_sugerido, undefined);
  assert.doesNotMatch(output.instruccion, /wrong_category/);
  assert.equal(output.match_status, 'semantic');
});

test('generated workflow embeds the same qualifier and Compose defaults to production enforcement', () => {
  const workflow = require('../n8n_workflow.json');
  const code = workflow.nodes.find(n => n.name === 'buscar_productos_tool').parameters.jsCode;
  assert.match(code, /async function qualifyProductCandidates/);
  assert.match(code, /await qualifyProductCandidates\(/);
  assert.match(code, /https:\/\/ai-gateway\.vercel\.sh\/v1\/evaluate/);
  assert.match(require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'docker-compose.yml'), 'utf8'),
    /JEV_PRODUCT_QUALIFIER_MODE=\$\{JEV_PRODUCT_QUALIFIER_MODE:-enforce\}/);
});

test('generated workflow executes qualification against the catalog double', async () => {
  const workflow = require('../n8n_workflow.json');
  const code = workflow.nodes.find(n => n.name === 'buscar_productos_tool').parameters.jsCode
    .replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = new AsyncFunction('query', 'axios', '$env', code);
  const { fake, calls } = withJev([0.12, 0.91]);
  const result = JSON.parse(await run({ p_busqueda: 'galvanizado largo' }, fake,
    { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key', ...env }));
  assert.equal(calls.length, 1);
  assert.equal(result.encontrados, 1);
  assert.notEqual(result.match_status, 'exact');
});

test('rejecting every relaxed candidate keeps the honest approximation instead of handing off', async () => {
  const mk = (status, ignored) => ({ encontrados: 2, atributo_ignorado: ignored, productos: [{ nombre: 'Zinc roja' }, { nombre: 'Zinc sin color' }],
    match_status: status, action: 'confirm', parcial: true,
    instruccion: 'Show the variants and say the requested color does not exist' });
  const axios = { post: async () => ({ data: { answers: {
    candidate_0: { probability: 0.04 }, candidate_1: { probability: 0.27 } } } }) };
  const candidates = [{ codigo_interno: 'A', descripcion: 'ZINC ROJA' }, { codigo_interno: 'B', descripcion: 'ZINC' }];
  const relaxed = mk('relaxed', true);
  await qualifyProductCandidates({ axios, env, query: 'zinc azul', candidates, output: relaxed, eligible: true });
  assert.equal(relaxed.encontrados, 2);
  assert.equal(relaxed.action, 'confirm');
  assert.equal(relaxed.match_status, 'relaxed');
  assert.match(relaxed.instruccion, /requested color does not exist/);
  const semantic = mk('relaxed', false);
  await qualifyProductCandidates({ axios, env, query: 'zinc azul', candidates, output: semantic, eligible: true });
  assert.equal(semantic.encontrados, 0);
  assert.equal(semantic.action, 'handoff');
});