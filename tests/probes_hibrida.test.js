// Hermetic truth table for the hybrid vector adoption rule (A3) in the rescue zone.
//
// Drives the REAL production body (scratch_live/live_buscar.js, loaded read-only by
// tests/support/load-live-buscar.js) with stubbed vector endpoints. The base fake-axios
// from buildFakeAxios covers layers 1-3; this file wraps it with a vector-layer router so
// POST /v1/embeddings, /rest/v1/rpc/buscar_semantico and /rest/v1/rpc/similitud_de_codigos
// are answered per-case, and OPENAI_API_KEY is injected to enable the vector branch.
//
// Cases (design P-1 / tasks 2.1), all with query "tapa para el bano" unless noted:
//   (a) simLex 0.40                          -> adopt (simLex branch)
//   (b) simLex 0.58 + same cat + vec 0.60    -> NO
//   (c) simLex 0.58 + catDiff  + vec 0.60    -> adopt (category+confidence branch, the +7)
//   (d) simLex 0.58 + catDiff  + vec 0.50    -> NO (0.55 guard)
//   (e) simLex null   + catDiff  + vec 0.60  -> adopt (guarded category fallback)
//   (f) empty vector                         -> NO (empty vector never adopted)
//   (g) no _falta (query "tapa p/toma 270")  -> embeddings endpoint never called
//   (h) OPENAI_API_BASE override set         -> embeddings hit the override origin
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buscarLive, buildFakeAxios } = require('./support/load-live-buscar');
const { createFakeAxios, assertAllMatched } = require('./support/fake-axios');

// Single lexical row: "tapa para el bano" -> top-1 is "Tapa P/toma 270" (missing "bano").
const L1 = { codigo_interno: 'L1', descripcion: 'Tapa P/toma 270', precio_venta: 10, existencia: 5 };
// Vector rows: same category vs. different category (catDiff requires _vcat !== _d0[0]).
const V_SAMECAT = { codigo_interno: 'V1', descripcion: 'TAPA P/TOMA 270 CON FIJADOR', precio_venta: 12, existencia: 4, similitud: 0.6 };
const V_DIFFCAT = (sim) => ({ codigo_interno: 'V1', descripcion: 'INODORO BLANCO COMPLETO', precio_venta: 25, existencia: 3, similitud: sim });

const OPENAI_ENV = { OPENAI_API_KEY: 'test-openai-key' };

function vectorHandlers({ simLex, rows }) {
  return [
    {
      when: (r) => r.method === 'POST' && r.path.endsWith('/v1/embeddings'),
      reply: () => ({ data: [{ embedding: [0.1] }] }),
    },
    {
      when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_semantico',
      reply: () => rows,
    },
    {
      when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/similitud_de_codigos',
      reply: () => (simLex === null ? [] : [{ similitud: simLex }]),
    },
  ];
}

function isVectorEndpoint(r) {
  return r.method === 'POST' &&
    (r.path.endsWith('/v1/embeddings') ||
     r.path === '/rest/v1/rpc/buscar_semantico' ||
     r.path === '/rest/v1/rpc/similitud_de_codigos');
}

// Composes the base hermetic fake (layers 1-3) with the vector-layer stub. Routes by
// endpoint: vector calls hit the per-case stub, everything else falls through to the
// unchanged base handlers from load-live-buscar.js (single source of truth).
function buildHybridFake(rows, vectorSpec) {
  const base = buildFakeAxios(rows);
  const vec = createFakeAxios(vectorHandlers(vectorSpec));
  const dispatch = async (method, url, body) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (isVectorEndpoint({ method: method.toUpperCase(), path })) return vec[method.toLowerCase()](url, body);
    return base[method.toLowerCase()](url, body);
  };
  return {
    get: (url) => dispatch('get', url, null),
    post: (url, body) => dispatch('post', url, body),
    get requests() { return base.requests.concat(vec.requests); },
    get unmatched() { return base.unmatched.concat(vec.unmatched); },
  };
}

async function runCase(spec) {
  const fake = buildHybridFake([L1], spec.vector);
  const { result } = await buscarLive(spec.query || 'tapa para el bano', {
    fake,
    env: OPENAI_ENV,
  });
  assertAllMatched(fake);
  return { result, fake };
}

function embeddingCalls(fake) {
  return fake.requests.filter((r) => r.path.endsWith('/v1/embeddings')).length;
}

test('A3 truth table: (a) simLex 0.40 -> adopt (simLex branch)', async () => {
  const { result } = await runCase({ vector: { simLex: 0.4, rows: [V_DIFFCAT(0.6)] } });
  assert.equal(result.rescate, 'inodoro');
  assert.equal(result.parcial, true);
  assert.equal(result.productos[0].nombre, 'Inodoro Blanco Completo');
});

test('A3 truth table: (b) simLex 0.58 + same cat + vec 0.60 -> NO', async () => {
  const { result } = await runCase({ vector: { simLex: 0.58, rows: [V_SAMECAT] } });
  assert.equal(result.rescate, undefined);
  assert.equal(result.productos[0].nombre, 'Tapa P/toma 270');
});

test('A3 truth table: (c) simLex 0.58 + catDiff + vec 0.60 -> adopt (+7)', async () => {
  const { result } = await runCase({ vector: { simLex: 0.58, rows: [V_DIFFCAT(0.6)] } });
  assert.equal(result.rescate, 'inodoro');
  assert.equal(result.parcial, true);
  assert.equal(result.productos[0].nombre, 'Inodoro Blanco Completo');
});

test('A3 truth table: (d) simLex 0.58 + catDiff + vec 0.50 -> NO (0.55 guard)', async () => {
  const { result } = await runCase({ vector: { simLex: 0.58, rows: [V_DIFFCAT(0.5)] } });
  assert.equal(result.rescate, undefined);
  assert.equal(result.productos[0].nombre, 'Tapa P/toma 270');
});

test('A3 truth table: (e) simLex null + catDiff + vec 0.60 -> adopt', async () => {
  const { result } = await runCase({ vector: { simLex: null, rows: [V_DIFFCAT(0.6)] } });
  assert.equal(result.rescate, 'inodoro');
  assert.equal(result.parcial, true);
  assert.equal(result.productos[0].nombre, 'Inodoro Blanco Completo');
});

test('A3 truth table: (f) empty vector -> NO', async () => {
  const { result } = await runCase({ vector: { simLex: 0.4, rows: [] } });
  assert.equal(result.rescate, undefined);
  assert.equal(result.productos[0].nombre, 'Tapa P/toma 270');
});

test('A3 truth table: (g) no _falta -> vector never called (happy path stays cheap)', async () => {
  const fake = buildFakeAxios([L1]); // no vector layer at all
  const { result } = await buscarLive('Tapa P/toma 270', { fake, env: OPENAI_ENV });
  assertAllMatched(fake);
  assert.equal(fake.requests.filter((r) => r.path === '/v1/embeddings').length, 0);
  assert.equal(fake.requests.filter((r) => r.path === '/rest/v1/rpc/buscar_semantico').length, 0);
  assert.equal(result.productos[0].nombre, 'Tapa P/toma 270');
});

test('A3 truth table: (h) OPENAI_API_BASE override -> embeddings hit the override origin', async () => {
  const fake = buildHybridFake([L1], { simLex: 0.4, rows: [V_DIFFCAT(0.6)] });
  const env = { ...OPENAI_ENV, OPENAI_API_BASE: 'https://openrouter.ai/api/v1' };
  const { result } = await buscarLive('tapa para el bano', { fake, env });
  assertAllMatched(fake);
  const calls = fake.requests.filter((r) => r.path.endsWith('/v1/embeddings'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, 'https://openrouter.ai');
  assert.equal(calls[0].path, '/api/v1/embeddings');
  assert.equal(result.rescate, 'inodoro'); // override no altera la adopción A3
});

test('guardia de credencial: clave sk-or- sin OPENAI_API_BASE -> no se llama a OpenAI', async () => {
  const fake = buildFakeAxios([L1]); // ningún handler de vector: cualquier POST fallaría
  const env = { OPENAI_API_KEY: 'sk-or-v1-clave-de-openrouter', OPENAI_API_BASE: '' };
  const { result } = await buscarLive('tapa para el bano', { fake, env });
  assertAllMatched(fake);
  assert.equal(fake.requests.filter((r) => r.path.endsWith('/v1/embeddings')).length, 0);
  assert.equal(result.productos[0].nombre, 'Tapa P/toma 270'); // cae al léxico, no rompe
});

test('guardia de credencial: clave sk-or- CON OPENAI_API_BASE -> sí se usa el override', async () => {
  const fake = buildHybridFake([L1], { simLex: 0.4, rows: [V_DIFFCAT(0.6)] });
  const env = { OPENAI_API_KEY: 'sk-or-v1-clave-de-openrouter', OPENAI_API_BASE: 'https://openrouter.ai/api/v1' };
  const { result } = await buscarLive('tapa para el bano', { fake, env });
  assertAllMatched(fake);
  const calls = fake.requests.filter((r) => r.path.endsWith('/v1/embeddings'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, 'https://openrouter.ai');
  assert.equal(result.rescate, 'inodoro');
});

test('A3 truth table: (i) OPENAI_API_BASE vacío -> default OpenAI (no override)', async () => {
  const fake = buildHybridFake([L1], { simLex: 0.4, rows: [V_DIFFCAT(0.6)] });
  const env = { ...OPENAI_ENV, OPENAI_API_BASE: '' };
  const { result } = await buscarLive('tapa para el bano', { fake, env });
  assertAllMatched(fake);
  const calls = fake.requests.filter((r) => r.path.endsWith('/v1/embeddings'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].origin, 'https://api.openai.com');
  assert.equal(result.rescate, 'inodoro');
});