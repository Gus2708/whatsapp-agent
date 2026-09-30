'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buscarLive, buildFakeAxios } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

// Synthetic fixture queries with a known relevant catalog description. This evaluates
// retrieval and routing, not model wording or a customer's private conversation.
const cases = [
  { query: 'lamina', relevant: /lamina/i },
  { query: 'lamina zinc azul', relevant: /lamina.*zinc.*azul/i },
  { query: 'lamina techolit roja', relevant: /lamina.*techolit.*roj/i },
  { query: 'pintura clase a blanca', relevant: /pintura.*clase a.*blanc/i },
  { query: 'pintura clase b azul', relevant: /pintura.*clase b.*azul/i },
  { query: 'pintura de aceite gris', relevant: /pintura.*aceite.*gris/i },
  { query: 'cemento gris', relevant: /cemento gris/i },
  { query: 'pega piso gris', relevant: /pega piso gris/i },
  { query: 'aflojatodo spray', relevant: /aflojatodo spray/i },
  { query: 'manto asfaltico', relevant: /manto asfaltico/i },
  { query: 'cinta teflon', relevant: /cinta teflon/i },
];

const workflow = JSON.parse(fs.readFileSync('n8n_workflow.json', 'utf8'));
const productionCode = workflow.nodes.find(node => node.name === 'buscar_productos_tool').parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const productionSearch = new AsyncFunction('query', 'require', '$env', 'process', productionCode);

async function runProduction(query) {
  const fake = buildFakeAxios();
  const output = await productionSearch(
    { p_busqueda: query }, () => fake,
    { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'test-only' },
    { env: {} }
  );
  assertAllMatched(fake);
  return JSON.parse(output);
}

function score(result, relevant) {
  const names = Array.isArray(result.productos) ? result.productos.map(product => product.nombre) : [];
  return {
    top1: names.length > 0 && relevant.test(names[0]),
    top3: names.slice(0, 3).some(name => relevant.test(name)),
    action: result.action,
    count: result.encontrados,
  };
}

test('production and development search benchmark on labeled catalog fixtures', async t => {
  const rows = [];
  for (const entry of cases) {
    const production = await runProduction(entry.query);
    const developmentRun = await buscarLive(entry.query);
    assertAllMatched(developmentRun.fake);
    rows.push({ query: entry.query, production: score(production, entry.relevant),
      development: score(developmentRun.result, entry.relevant) });
  }
  const aggregate = side => ({
    top1: rows.filter(row => row[side].top1).length,
    top3: rows.filter(row => row[side].top3).length,
    actions: Object.fromEntries([...new Set(rows.map(row => row[side].action))]
      .map(action => [action, rows.filter(row => row[side].action === action).length])),
  });
  t.diagnostic(JSON.stringify({ cases: cases.length, production: aggregate('production'),
    development: aggregate('development'), divergences: rows.filter(row =>
      row.production.top1 !== row.development.top1 ||
      row.production.top3 !== row.development.top3 ||
      row.production.action !== row.development.action) }));

  assert.equal(aggregate('production').top1, cases.length,
    'Every labeled query should rank a relevant catalog item first in the published search');
  assert.equal(aggregate('development').top3, cases.length,
    'The development search should retain relevant catalog items in its first three results');

  const genericSheet = rows.find(row => row.query === 'lamina');
  assert.equal(genericSheet.production.top3, true,
    'A generic sheet search must not erase retrieved catalog rows before building its result');
  assert.equal(genericSheet.production.action, 'show_results');
});
