'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buscarLive } = require('./support/load-live-buscar');

const baselineWf = require('../workflows/production-baseline.json');
const builtWf = require('../n8n_workflow.json');

const FIXTURE_ROWS = [
  { codigo_interno: 'ENC-001', descripcion: 'ENCHUFE INDUSTRIAL 220V 50AMP (PATA GALLINA)', precio_venta: 4, existencia: 10 },
  { codigo_interno: 'TOM-001', descripcion: 'TOMA CORRIENTE PATA GALLINA 250V CEL-322', precio_venta: 0.5, existencia: 15 },
  { codigo_interno: 'PIL-001', descripcion: 'PILAS ALLISON AA/AAA BLISTER X4', precio_venta: 1.5, existencia: 20 },
  { codigo_interno: 'BOM-001', descripcion: 'BOMBA SUMERGIBLE 1HP', precio_venta: 120, existencia: 3 },
  { codigo_interno: 'HER-001', descripcion: 'HERRAJE COMPLETO BOTON ARRIBA PRO ITALY', precio_venta: 12, existencia: 5 },
];

test('stopword "alli" and single-word boundary guard block substring false positives like Pata Gallina and Allison', async () => {
  const { result } = await buscarLive('esos clinchitos, esos ganchitos que le señalé allí', { rows: FIXTURE_ROWS });
  const nombres = (result.productos || []).map((p) => p.nombre.toLowerCase());
  assert.ok(!nombres.some((n) => n.includes('gallina') || n.includes('allison')),
    `must not match mid-word substrings from "alli": got ${JSON.stringify(nombres)}`);
  assert.strictEqual(result.encontrados, 0);
  assert.strictEqual(result.action, 'handoff');
});

test('single-word lexical fallback enforces whole-word boundary on mid-word substrings', async () => {
  for (const q of ['busco algo lina', 'clinchito raro lina']) {
    const { result } = await buscarLive(q, { rows: FIXTURE_ROWS });
    const nombres = (result.productos || []).map((p) => p.nombre.toLowerCase());
    assert.ok(!nombres.some((n) => n.includes('gallina')),
      `mid-word substring "lina" in "${q}" must not match GALLINA: got ${JSON.stringify(nombres)}`);
    assert.strictEqual(result.encontrados, 0);
    assert.strictEqual(result.action, 'handoff');
  }
});

test('legitimate whole-word single-token fallback still finds matching catalog product', async () => {
  const { result } = await buscarLive('resina rara sumergible', { rows: FIXTURE_ROWS });
  const nombres = (result.productos || []).map((p) => p.nombre.toLowerCase());
  assert.ok(nombres.some((n) => n.includes('bomba sumergible 1hp')),
    `expected Bomba Sumergible 1HP in single-word fallback: got ${JSON.stringify(nombres)}`);
});

test('catalog word "arriba" is preserved in IGNORED exclusions and still matches Herraje Boton Arriba', async () => {
  const { result } = await buscarLive('herraje boton arriba', { rows: FIXTURE_ROWS });
  const nombres = (result.productos || []).map((p) => p.nombre.toLowerCase());
  assert.ok(nombres.some((n) => n.includes('herraje completo boton arriba pro italy')),
    `expected Herraje Completo Boton Arriba Pro Italy: got ${JSON.stringify(nombres)}`);
});

test('both production-baseline and built n8n_workflow transcribe media before debounce', () => {
  for (const [label, wf] of [['production-baseline.json', baselineWf], ['n8n_workflow.json', builtWf]]) {
    assert.strictEqual(
      wf.connections['Filtro Anti-Duplicado']?.main?.[0]?.[0]?.node,
      'Transcribir Nota de Voz',
      `${label}: Filtro Anti-Duplicado must route to Transcribir Nota de Voz`
    );
    assert.strictEqual(
      wf.connections['Transcribir Nota de Voz']?.main?.[0]?.[0]?.node,
      'Debounce Ráfaga',
      `${label}: Transcribir Nota de Voz must route to Debounce Ráfaga`
    );
    assert.strictEqual(
      wf.connections['Debounce Ráfaga']?.main?.[0]?.[0]?.node,
      'Is Text Message?',
      `${label}: Debounce Ráfaga must route to Is Text Message?`
    );
  }
});

test('Prepare Conversation Context combines _rafaga_previa from Debounce Ráfaga with follow-up message', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const code = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_conversation_context.js'), 'utf8');

  const $ = (name) => ({
    first: () => {
      if (name === 'Debounce Ráfaga') {
        return {
          json: {
            body: {
              session: 'shop',
              payload: {
                from: '584246573315@c.us',
                _rafaga_previa: '[Imagen del cliente]: Ganchos adhesivos\n',
                body: 'esos ganchitos que le señalé allí',
              },
            },
          },
        };
      }
      if (name === 'Transcribir Nota de Voz') {
        return {
          json: {
            body: {
              session: 'shop',
              payload: {
                from: '584246573315@c.us',
                body: 'esos ganchitos que le señalé allí',
              },
            },
          },
        };
      }
      throw new Error(`Unexpected node lookup: ${name}`);
    },
  });

  const result = await new AsyncFunction('$', '$input', '$env', '$getWorkflowStaticData', code)(
    $,
    { first: () => ({ json: { cliente_nombre: 'Ángeles' } }) },
    { CONVERSATION_STATE_ENABLED: 'true' },
    () => ({})
  );

  const query = result[0]?.json?.conversation_context?.query || '';
  assert.ok(query.includes('[Imagen del cliente]: Ganchos adhesivos'), `missing image context in query: ${query}`);
  assert.ok(query.includes('esos ganchitos que le señalé allí'), `missing follow-up text in query: ${query}`);
});
