// Shared hermetic bootstrap for scratch_live/live_buscar.js (READ-ONLY, unmodified source).
//
// Drives the production matcher through its existing injected (query, axios, $env) seam.
// The injected `$env` Supabase URL/key are non-empty (`http://supabase.test`): the matcher
// falls through to the real OS-level credentials when the injected value is falsy, and an
// empty string here would let a developer's real credentials leak into a test that is
// supposed to be hermetic. The OpenAI/OpenRouter API keys are intentionally omitted so the
// vector-search and LLM-rescue layers (4-5) short-circuit before any request.
'use strict';

const fs = require('fs');
const path = require('path');
const { createFakeAxios } = require('./fake-axios');

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');
const catalog = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'catalog.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'config.json'), 'utf8'));

const RAW_SOURCE = fs.readFileSync(
  path.join(__dirname, '..', '..', 'scratch_live', 'live_buscar.js'),
  'utf8'
);
// live_buscar.js is an n8n Code node body: it declares `const axios = require('axios');` at
// the top because n8n runs it standalone. Here axios is injected as a function parameter
// instead, so the require() line (which would try to load the real package) is stripped.
const SOURCE = RAW_SOURCE.replace("const axios = require('axios');", '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ---- Minimal PostgREST ilike-filter simulation (design D2/D5) --------------------------
//
// live_buscar.js builds queries like:
//   ?select=...&descripcion=ilike.*lamina*&or=(descripcion.ilike.*azul*,descripcion.ilike.*asul*)&order=...&limit=...
// Each top-level `&`-joined fragment is one AND-condition. A bare `descripcion=ilike.*x*`
// fragment is a single required substring. An `or=(...)` fragment is a set of alternatives
// (comma-separated `descripcion.ilike.*x*` conditions) where ANY one satisfies that AND slot.
function parseIlikeGroups(query) {
  const groups = [];
  if (!query) return groups;
  for (const part of query.split('&')) {
    if (part.indexOf('descripcion.ilike.') !== -1 && part.slice(0, 4) === 'or=(') {
      const inner = part.slice(4, -1);
      const terms = [];
      for (const cond of inner.split(',')) {
        const m = /descripcion\.ilike\.\*(.*)\*$/.exec(cond);
        if (m) terms.push(decodeURIComponent(m[1]));
      }
      if (terms.length) groups.push(terms);
    } else if (part.slice(0, 18) === 'descripcion=ilike.') {
      const m = /^descripcion=ilike\.\*(.*)\*$/.exec(part);
      if (m) groups.push([decodeURIComponent(m[1])]);
    }
    // select=, order=, limit=, codigo_interno=in.(...) carry no filter semantics here.
  }
  return groups;
}

function matchesGroups(descripcion, groups) {
  const d = String(descripcion).toLowerCase();
  return groups.every((group) => group.some((term) => d.includes(String(term).toLowerCase())));
}

function selectFields(row) {
  return {
    codigo_interno: row.codigo_interno,
    descripcion: row.descripcion,
    precio_venta: row.precio_venta,
    existencia: row.existencia,
  };
}

function wordGroups(term) {
  return String(term || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => [w]);
}

// Builds the fake axios double wired to `rows` (defaults to the full fixture catalog).
// Endpoints outside layers 1-3 (embeddings, OpenRouter rescue) are never reached because
// $env omits their API keys -- live_buscar.js returns early before issuing those requests.
function buildFakeAxios(rows) {
  const data = rows || catalog;
  return createFakeAxios([
    // catalogo_vocabulario / busqueda_aprendizaje / busqueda_negativa: explicit [] matches,
    // never unmatched (design D5) -- an empty vocabulary/learning/denylist is a real state.
    { when: (r) => r.method === 'GET' && r.path === '/rest/v1/catalogo_vocabulario', reply: () => [] },
    { when: (r) => r.method === 'GET' && r.path === '/rest/v1/busqueda_aprendizaje', reply: () => [] },
    { when: (r) => r.method === 'GET' && r.path === '/rest/v1/busqueda_negativa', reply: () => [] },
    { when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/popularidad_productos', reply: () => [] },
    {
      when: (r) => r.method === 'GET' && r.path === '/rest/v1/presupuesto_config',
      reply: () => [{ markup_porcentaje: config.markup_porcentaje }],
    },
    {
      when: (r) => r.method === 'GET' && r.path === '/rest/v1/tazas',
      reply: () => [{ bcv_usd: config.bcv_usd }],
    },
    {
      // aprBoost lookup (codigo_interno=in.(...)) never fires in practice because
      // busqueda_aprendizaje above always returns [], but it is handled defensively.
      when: (r) => r.method === 'GET' && r.path === '/rest/v1/productos' && r.query.indexOf('codigo_interno=in') !== -1,
      reply: () => [],
    },
    {
      when: (r) => r.method === 'GET' && r.path === '/rest/v1/productos',
      reply: (r) => {
        const groups = parseIlikeGroups(r.query);
        return data
          .filter((row) => matchesGroups(row.descripcion, groups))
          .slice()
          .sort((a, b) => (Number(b.existencia) || 0) - (Number(a.existencia) || 0))
          .map(selectFields);
      },
    },
    {
      when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_productos',
      reply: (r) => {
        const groups = wordGroups(r.body && r.body.p_busqueda);
        return data.filter((row) => matchesGroups(row.descripcion, groups)).map(selectFields);
      },
    },
    {
      when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_fuzzy',
      reply: (r) => {
        const groups = wordGroups(r.body && r.body.p_term);
        return data.filter((row) => matchesGroups(row.descripcion, groups)).map(selectFields);
      },
    },
  ]);
}

// Runs live_buscar.js hermetically for one query. Returns { result, fake } so callers can
// both assert on the parsed JSON and call assertAllMatched(fake).
async function buscarLive(p_busqueda, opts) {
  const options = opts || {};
  const fake = options.fake || buildFakeAxios(options.rows);
  const envMap = Object.assign(
    { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key' },
    options.env || {}
  );
  const fn = new AsyncFunction('query', 'axios', '$env', SOURCE);
  const resultStr = await fn({ p_busqueda }, fake, envMap);
  return { result: JSON.parse(resultStr), fake };
}

module.exports = { buscarLive, buildFakeAxios, catalog, config };
