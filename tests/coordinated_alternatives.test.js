'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buscarLive, buildFakeAxios } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

const FIXTURE_ROWS = [
  { codigo_interno: 'CEMCSC', descripcion: 'CEMENTO GRIS CSC 42.5KG', precio_venta: 11, existencia: 201 },
  { codigo_interno: '01112', descripcion: 'CEMENTO GRIS CATATUMBO SELLADO TIPO II IDEAL', precio_venta: 12, existencia: 0 },
  { codigo_interno: '01111', descripcion: 'CEMENTO GRIS CATATUMBO SELLADO TIPO CPCA2', precio_venta: 9.5, existencia: 0 },
  { codigo_interno: '01107', descripcion: 'CEMENTO BLANCO ARGOS 20KG', precio_venta: 21, existencia: 15 },
  { codigo_interno: '01110', descripcion: 'CEMENTO CONTACTO 1/64 INDUFERCA 60ML', precio_venta: 2, existencia: 23 },
  { codigo_interno: 'BP-1', descripcion: 'BOMBA AGUA PEDROLLO 0.5HP', precio_venta: 95, existencia: 10 },
  { codigo_interno: 'BP-2', descripcion: 'BOMBA AGUA PEDROLLO 1HP', precio_venta: 130, existencia: 8 },
  { codigo_interno: 'BP-3', descripcion: 'BOMBA AGUA PEDROLLO 1.5HP', precio_venta: 165, existencia: 6 },
  { codigo_interno: 'BP-4', descripcion: 'BOMBA AGUA PEDROLLO 2HP', precio_venta: 210, existencia: 4 },
  { codigo_interno: 'BG-1', descripcion: 'BOMBA AGUA GRIVEN 0.5HP', precio_venta: 65, existencia: 12 },
  { codigo_interno: 'BG-2', descripcion: 'BOMBA AGUA GRIVEN 1HP', precio_venta: 85, existencia: 9 },
  { codigo_interno: 'BG-3', descripcion: 'BOMBA AGUA GRIVEN 1.5HP', precio_venta: 110, existencia: 7 },
  { codigo_interno: 'BG-4', descripcion: 'BOMBA AGUA GRIVEN 2HP', precio_venta: 140, existencia: 5 },
  { codigo_interno: 'LAM-TR', descripcion: 'LAMINA TECHOLIT ROJA 3.66M', precio_venta: 24, existencia: 12 },
  { codigo_interno: 'LAM-ZA', descripcion: 'LAMINA ZINC AZUL 3.66M', precio_venta: 19, existencia: 10 },
];

async function runFixtureSearch(query) {
  const { result, fake } = await buscarLive(query, { rows: FIXTURE_ROWS });
  assertAllMatched(fake);
  return result;
}

test('live incident: "cemento catatumbo y csc" returns both brands with CSC available first', async () => {
  for (const query of [
    'Buenas tardes precio del cemento catatumbo y csc en divisas',
    'cemento catatumbo y csc',
  ]) {
    const res = await runFixtureSearch(query);
    assert.strictEqual(res.encontrados, 3, `expected 3 cement rows for "${query}"`);
    assert.strictEqual(res.match_status, 'exact');
    assert.strictEqual(res.action, 'show_results');
    assert.strictEqual(res.requires_confirmation, false);
    assert.ok(!res.instruccion || !/ignorar.*csc/i.test(res.instruccion),
      `must not claim "csc" was ignored: ${res.instruccion}`);
    assert.match(res.productos[0].nombre, /CSC/i);
    assert.strictEqual(res.productos[0].disponible, true);
    const catatumboRows = res.productos.filter((p) => /Catatumbo/i.test(p.nombre));
    assert.strictEqual(catatumboRows.length, 2);
    assert.ok(catatumboRows.every((p) => p.disponible === false));
  }
});

test('coordinator variants for CSC and Catatumbo all return both brands as exact matches', async () => {
  const variants = [
    'cemento csc o catatumbo',
    'cemento catatumbo/csc',
    'cemento gris catatumbo y csc',
    'cemento catatumbo y el csc',
    'cemento catatumbo y cemento csc',
  ];
  for (const query of variants) {
    const res = await runFixtureSearch(query);
    assert.strictEqual(res.match_status, 'exact', `expected exact match for "${query}"`);
    assert.strictEqual(res.action, 'show_results', `expected show_results for "${query}"`);
    assert.ok(res.productos.some((p) => /CSC/i.test(p.nombre)), `missing CSC for "${query}"`);
    assert.ok(res.productos.some((p) => /Catatumbo/i.test(p.nombre)), `missing Catatumbo for "${query}"`);
  }
});

test('partial missing brand keeps existing brand and reports only the absent brand', async () => {
  const missingSecond = await runFixtureSearch('cemento catatumbo y tolteca');
  assert.strictEqual(missingSecond.match_status, 'relaxed');
  assert.strictEqual(missingSecond.action, 'confirm');
  assert.strictEqual(missingSecond.parcial, true);
  assert.ok(missingSecond.productos.some((p) => /Catatumbo/i.test(p.nombre)));
  assert.match(missingSecond.instruccion, /tolteca/i);
  assert.doesNotMatch(missingSecond.instruccion, /\bcatatumbo\b/i);

  const missingFirst = await runFixtureSearch('cemento tolteca y csc');
  assert.strictEqual(missingFirst.match_status, 'relaxed');
  assert.strictEqual(missingFirst.action, 'confirm');
  assert.strictEqual(missingFirst.parcial, true);
  assert.ok(missingFirst.productos.some((p) => /CSC/i.test(p.nombre)));
  assert.match(missingFirst.instruccion, /tolteca/i);
  assert.doesNotMatch(missingFirst.instruccion, /\bcsc\b/i);
});

test('multiple explicit cemento types return white and grey without Cemento Contacto', async () => {
  const res = await runFixtureSearch('cemento blanco y gris');
  assert.strictEqual(res.match_status, 'exact');
  assert.strictEqual(res.action, 'show_results');
  assert.ok(res.productos.some((p) => /Blanco.*Argos/i.test(p.nombre)), 'expected Cemento Blanco Argos');
  assert.ok(res.productos.some((p) => /Gris.*CSC/i.test(p.nombre)), 'expected Cemento Gris CSC');
  assert.ok(!res.productos.some((p) => /Contacto/i.test(p.nombre)), 'must still exclude Cemento Contacto');
});

test('balanced top-4 representation interleaves results across coordinated brands', async () => {
  const res = await runFixtureSearch('bomba pedrollo y griven');
  assert.strictEqual(res.encontrados, 4);
  assert.strictEqual(res.match_status, 'exact');
  const pedrolloCount = res.productos.filter((p) => /Pedrollo/i.test(p.nombre)).length;
  const grivenCount = res.productos.filter((p) => /Griven/i.test(p.nombre)).length;
  assert.ok(pedrolloCount >= 2, `expected at least 2 Pedrollo in top 4, got ${pedrolloCount}`);
  assert.ok(grivenCount >= 2, `expected at least 2 Griven in top 4, got ${grivenCount}`);
});

test('negative control without coordinator keeps relaxed confirmation instead of merging', async () => {
  const res = await runFixtureSearch('lamina techolit azul 3.66');
  assert.strictEqual(res.action, 'confirm');
  assert.notStrictEqual(res.match_status, 'exact');
});

test('system prompt and built n8n_workflow enforce multi-brand separation and pass live incident query', async () => {
  const root = path.join(__dirname, '..');
  const livePrompt = fs.readFileSync(path.join(root, 'scratch_live', 'live_systemMessage.txt'), 'utf8');
  const baselineWf = JSON.parse(fs.readFileSync(path.join(root, 'workflows', 'production-baseline.json'), 'utf8'));
  const builtWf = JSON.parse(fs.readFileSync(path.join(root, 'n8n_workflow.json'), 'utf8'));

  const baselinePrompt = baselineWf.nodes.find((n) => n.name === 'AI Agent').parameters.options.systemMessage;
  const builtPrompt = builtWf.nodes.find((n) => n.name === 'AI Agent').parameters.options.systemMessage;

  for (const prompt of [livePrompt, baselinePrompt, builtPrompt]) {
    assert.match(prompt, /VARIOS PRODUCTOS, MARCAS O COLORES EN EL MISMO MENSAJE/);
    assert.match(prompt, /cemento catatumbo y csc/);
    assert.match(prompt, /NUNCA metas dos marcas\/variantes distintas en una sola búsqueda/);
  }

  const builtSearchCode = builtWf.nodes
    .find((n) => n.name === 'buscar_productos_tool')
    .parameters.jsCode.replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const runBuilt = new AsyncFunction('query', 'axios', '$env', builtSearchCode);
  const fake = buildFakeAxios(FIXTURE_ROWS);
  const builtRes = JSON.parse(
    await runBuilt(
      { p_busqueda: 'Buenas tardes precio del cemento catatumbo y csc en divisas' },
      fake,
      { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'test-anon-key' }
    )
  );
  assertAllMatched(fake);
  assert.strictEqual(builtRes.encontrados, 3);
  assert.strictEqual(builtRes.match_status, 'exact');
  assert.strictEqual(builtRes.action, 'show_results');
  assert.match(builtRes.productos[0].nombre, /CSC/i);
  assert.ok(builtRes.productos.some((p) => /Catatumbo/i.test(p.nombre)));
});
