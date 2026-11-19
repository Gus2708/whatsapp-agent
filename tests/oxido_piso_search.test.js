const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../lib/serrucho-search.js');
const C = require('../lib/catalog-search.js');
const { buscarLive } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

const SAMPLE_CATALOG = [
  { codigo_interno: '03476', descripcion: 'OXIDO P/PISO AMARILLO 1.5KG OXINET', precio_venta: 12.75, existencia: 5 },
  { codigo_interno: '03477', descripcion: 'OXIDO P/PISO AZUL 1KG OXINET', precio_venta: 7.0, existencia: 3 },
  { codigo_interno: '03478', descripcion: 'OXIDO P/PISO NEGRO 1.5KG OXINET', precio_venta: 8.5, existencia: -1 },
  { codigo_interno: '03479', descripcion: 'OXIDO P/PISO ROJO 1.5KG OXINET', precio_venta: 8.5, existencia: 1 },
  { codigo_interno: '7891106004886', descripcion: 'OXIDO P/PISO BAYCOLOR', precio_venta: 18.0, existencia: -16 },
  { codigo_interno: '03776', descripcion: 'PINTURA DE ACEITE EL PRO 30-201 NEGRO GALON', precio_venta: 20.0, existencia: 4 },
  { codigo_interno: '03778', descripcion: 'PINTURA DE ACEITE EL PRO 30-201 NEGRO 1/4', precio_venta: 7.0, existencia: 6 },
  { codigo_interno: '03770', descripcion: 'PINTURA DE ACEITE EL PRO 30-200 BLANCO 1/4', precio_venta: 7.0, existencia: 5 },
  { codigo_interno: '03777', descripcion: 'PINTURA DE ACEITE EL PRO 30-210 NARANJA 1/4', precio_venta: 7.0, existencia: 11 },
  { codigo_interno: 'F-101-01', descripcion: 'PINTURA CAUCHO BLANCO B GAL FLORIPAINT', precio_venta: 9.5, existencia: 21 },
];

function matchPostgrestQuery(rows, urlStr) {
  const qIndex = urlStr.indexOf('?');
  if (qIndex === -1) return [];
  const params = new URLSearchParams(urlStr.slice(qIndex + 1));
  const orRaw = params.getAll('or');
  const descIlikes = params.getAll('descripcion');

  return rows.filter((row) => {
    const desc = String(row.descripcion || '').toLowerCase();
    for (const cond of descIlikes) {
      if (cond.startsWith('ilike.*') && cond.endsWith('*')) {
        const needle = cond.slice(7, -1).toLowerCase();
        if (!desc.includes(needle)) return false;
      }
    }
    for (const group of orRaw) {
      if (!group.startsWith('(') || !group.endsWith(')')) continue;
      const parts = group.slice(1, -1).split(',');
      const ok = parts.some((p) => {
        const m = /^descripcion\.ilike\.\*(.*)\*$/.exec(p);
        if (!m) return false;
        return desc.includes(decodeURIComponent(m[1]).toLowerCase());
      });
      if (!ok) return false;
    }
    return true;
  });
}

function makeFakeAxios(catalog) {
  return {
    async get(url) {
      if (url.includes('/rest/v1/tazas')) return { data: [{ bcv_usd: 916.6477 }] };
      if (url.includes('/rest/v1/presupuesto_config')) return { data: [{ markup_porcentaje: 20 }] };
      if (url.includes('/rest/v1/productos?')) return { data: matchPostgrestQuery(catalog, url) };
      return { data: [] };
    },
    async post(url, body) {
      if (url.includes('popularidad_productos')) {
        const codes = (body && body.p_codigos) || [];
        return { data: codes.map((c) => ({ codigo_producto: c, total: 10 })) };
      }
      return { data: [] };
    },
  };
}

async function runToolNode(nodeName, queryObj, { catalog = SAMPLE_CATALOG, customerText = '', axiosMock = null } = {}) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n_workflow.json'), 'utf8'));
  const node = wf.nodes.find((n) => n.name === nodeName);
  assert.ok(node, `Node ${nodeName} must exist`);
  const fakeAxios = axiosMock || makeFakeAxios(catalog);

  const wrapped = `(async () => {\n${node.parameters.jsCode}\n})()`;
  const sandbox = {
    query: queryObj,
    $env: { SUPABASE_URL: 'http://fake.sb', SUPABASE_ANON_KEY: 'fake-key', WAHA_INTERNAL_URL: 'http://waha.test' },
    process: { env: { SUPABASE_URL: 'http://fake.sb', SUPABASE_ANON_KEY: 'fake-key' } },
    $: (name) => ({
      first() {
        if (name === 'Webhook Trigger') {
          return { json: { body: { payload: { from: '584121234567@c.us' } } } };
        }
        if (name === 'Prepare Conversation Context') {
          return { json: { conversation_context: { query: customerText } } };
        }
        return { json: {} };
      },
    }),
    require: (id) => {
      if (id === 'axios') return fakeAxios;
      if (id === 'fs') return fs;
      throw new Error(`Unexpected require(${id})`);
    },
    console,
    Date,
    Math,
    JSON,
    Number,
    String,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
  };
  const outStr = await vm.runInNewContext(wrapped, sandbox);
  return JSON.parse(outStr);
}

test('lib/serrucho-search and lib/catalog-search map pintura para piso to oxido piso without breaking oil paint', () => {
  for (const lib of [S, C]) {
    assert.strictEqual(lib.expandir('pintura para piso color negra'), 'oxido para piso color negra');
    assert.strictEqual(lib.expandir('pintura de piso'), 'oxido de piso');
    assert.strictEqual(lib.expandir('pintura en polvo para piso'), 'oxido para piso');
    assert.strictEqual(lib.expandir('tiene pintura de aceite blanco 1/4'), 'tiene pintura de aceite blanco 1/4');
    assert.strictEqual(lib.expandir('será para piso'), 'cera para piso');
  }
});

test('live_buscar returns in-stock OXIDO P/PISO colors when requested floor color (negra) is out of stock', async () => {
  const { result, fake } = await buscarLive('pintura para piso color negra', { rows: SAMPLE_CATALOG });
  assertAllMatched(fake);
  assert.strictEqual(result.encontrados > 0, true);
  assert.strictEqual(result.productos.every((p) => /Oxido P\/piso/i.test(p.nombre)), true);
  assert.strictEqual(result.productos.some((p) => /Aceite/i.test(p.nombre)), false);
  assert.strictEqual(result.productos.every((p) => p.disponible === true), true);
  assert.strictEqual(result.parcial, true);
  assert.match(result.instruccion, /agotado/i);
});

test('n8n buscar_productos_tool returns OXIDO P/PISO colors (not oil paint) for pintura para piso color negra', async () => {
  const out = await runToolNode('buscar_productos_tool', { p_busqueda: 'pintura para piso color negra' });
  assert.strictEqual(out.encontrados > 0, true);
  assert.strictEqual(out.productos.every((p) => /Oxido P\/piso/i.test(p.nombre)), true);
  assert.strictEqual(out.productos.some((p) => /Aceite/i.test(p.nombre)), false);
  assert.strictEqual(out.productos.every((p) => p.disponible === true), true);
  assert.strictEqual(out.parcial, true);
  assert.match(out.instruccion, /agotado/i);
});

test('n8n buscar_productos_tool returns OXIDO P/PISO (not wall paint summary) for generic pintura para piso', async () => {
  const out = await runToolNode('buscar_productos_tool', { p_busqueda: 'pintura para piso' });
  assert.strictEqual(out.modo_resumen_pintura, undefined);
  assert.strictEqual(out.encontrados > 0, true);
  assert.strictEqual(out.productos.every((p) => /Oxido P\/piso/i.test(p.nombre)), true);
  assert.strictEqual(out.productos.some((p) => /Aceite|Caucho/i.test(p.nombre)), false);
});

test('n8n buscar_productos_tool still finds oil paint normally for pintura de aceite blanco 1/4', async () => {
  const out = await runToolNode('buscar_productos_tool', { p_busqueda: 'pintura de aceite blanco 1/4' });
  assert.strictEqual(out.encontrados > 0, true);
  assert.strictEqual(out.productos.some((p) => /Aceite.*Blanco.*1\/4/i.test(p.nombre)), true);
});

test('n8n hacer_presupuesto_tool quotes OXIDO P/PISO for pintura para piso', async () => {
  const out = await runToolNode('hacer_presupuesto_tool', { productos: '2 pintura para piso' });
  assert.strictEqual(out.ok, true);
  assert.match(out.presupuesto_texto, /Oxido P\/piso/i);
  assert.doesNotMatch(out.presupuesto_texto, /Aceite/i);
});

test('n8n enviar_catalogo_pintura_tool blocks oil paint and floor paint queries unless catalog is explicitly requested', async () => {
  let wahaCalls = 0;
  const axiosSpy = {
    async post(url) {
      wahaCalls++;
      return { data: { ok: true, url } };
    },
  };

  const oilOut = await runToolNode(
    'enviar_catalogo_pintura_tool',
    { metodo_pago: 'divisas' },
    { customerText: 'Buenas tardes tiene en aceite un cuarto blanco y aceite para buscarla mañana precio Naranja un cuarto precio', axiosMock: axiosSpy }
  );
  assert.strictEqual(oilOut.enviado, false);
  assert.strictEqual(oilOut.bloqueado, true);
  assert.strictEqual(wahaCalls, 0);

  const floorOut = await runToolNode(
    'enviar_catalogo_pintura_tool',
    { metodo_pago: 'divisas' },
    { customerText: 'Buenas tardes disculpe tienen será para piso o pintura para piso color negra y presio', axiosMock: axiosSpy }
  );
  assert.strictEqual(floorOut.enviado, false);
  assert.strictEqual(floorOut.bloqueado, true);
  assert.strictEqual(wahaCalls, 0);
});
