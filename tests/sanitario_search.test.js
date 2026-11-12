const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../lib/serrucho-search.js');
const C = require('../lib/catalog-search.js');

const SAMPLE_CATALOG = [
  { codigo_interno: '04437', descripcion: 'SALA SANITARIA CORONA BLANCA', precio_venta: 190.0, existencia: 2.0 },
  { codigo_interno: '00010780', descripcion: 'INODORO WC ONE PIECE AQP-23551', precio_venta: 155.0, existencia: 1.0 },
  { codigo_interno: 'HTK-TOI-10', descripcion: 'SET DE POCETA + TANQUE (HIDROTEK)', precio_venta: 113.0, existencia: 1.0 },
  { codigo_interno: '04439', descripcion: 'SANITARIO CORONA BLANCO BASICO', precio_venta: 135.0, existencia: 0.0 },
  { codigo_interno: '02523', descripcion: 'JUEGO SALA SANITARIA C/LAVAMANO S/PEDESTAL', precio_venta: 136.5, existencia: 0.0 },
  { codigo_interno: '02524', descripcion: 'JUEGO SALA SANITARIA S/PEDESTAL ROMA', precio_venta: 135.0, existencia: 0.0 },
  { codigo_interno: '6924258907482', descripcion: 'HERRAJE UNIVERSAL WC BOTON P/POSETA 1/2 KOBATEX', precio_venta: 12.0, existencia: 5.0 },
  { codigo_interno: '00371', descripcion: 'ASIENTO PARA INODORO LF', precio_venta: 8.5, existencia: 18.0 },
  { codigo_interno: 'CP0250', descripcion: 'TORNILLO PVC INODORO', precio_venta: 2.0, existencia: 16.0 },
  { codigo_interno: '00373', descripcion: 'ASIENTO SANITARIO BLANCO', precio_venta: 9.0, existencia: 12.0 },
  { codigo_interno: '04530', descripcion: 'SIFON DE PLACA PVC SANITARIO', precio_venta: 4.5, existencia: 3.0 },
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
      if (url.includes('/rest/v1/tazas')) return { data: [{ bcv_usd: 904.4485 }] };
      if (url.includes('/rest/v1/presupuesto_config')) return { data: [{ markup_porcentaje: 30 }] };
      if (url.includes('/rest/v1/productos?')) {
        return { data: matchPostgrestQuery(catalog, url) };
      }
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

async function runToolNode(nodeName, queryObj, catalog = SAMPLE_CATALOG) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n_workflow.json'), 'utf8'));
  const node = wf.nodes.find((n) => n.name === nodeName);
  assert.ok(node, `Node ${nodeName} must exist`);
  const fakeAxios = makeFakeAxios(catalog);

  const wrapped = `(async () => {\n${node.parameters.jsCode}\n})()`;
  const sandbox = {
    query: queryObj,
    $env: { SUPABASE_URL: 'http://fake.sb', SUPABASE_ANON_KEY: 'fake-key' },
    process: { env: { SUPABASE_URL: 'http://fake.sb', SUPABASE_ANON_KEY: 'fake-key' } },
    require: (id) => {
      if (id === 'axios') return fakeAxios;
      throw new Error(`Unexpected require(${id})`);
    },
    console,
    Date,
    Math,
    JSON,
    Set,
    Map,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
  };
  const outStr = await vm.runInNewContext(wrapped, sandbox);
  return JSON.parse(outStr);
}

test('lib/serrucho-search and lib/catalog-search normalize sanitary phrases properly', () => {
  for (const mod of [S, C]) {
    assert.strictEqual(mod.expandir('la poseta como tal'), 'la poseta');
    assert.strictEqual(mod.expandir('poseta sola'), 'poseta');
    assert.strictEqual(mod.expandir('Juego de baño pero sin el lavamanos'), 'poceta');
    assert.strictEqual(mod.expandir('wc'), 'poceta');
    assert.strictEqual(mod.expandir('herraje para poseta'), 'herraje para poseta');
    assert.strictEqual(mod.expandir('juego de accesorios para baño'), 'juego de accesorios para bano');
    assert.ok(mod.aliasDe('poseta').includes('sala sanitaria'));
    assert.ok(mod.aliasDe('poseta').includes('inodoro'));
    assert.ok(mod.aliasDe('poseta').includes('poceta'));
  }
});

test('buscar_productos_tool finds real in-stock toilets for poseta/juego de bano queries', async () => {
  const queries = [
    'poseta',
    'la poseta como tal',
    'poseta sola',
    'Juego de baño pero sin el lavamanos',
    'wc',
    'sala sanitaria',
  ];

  for (const q of queries) {
    const res = await runToolNode('buscar_productos_tool', { p_busqueda: q });
    assert.ok(res.encontrados > 0, `Query "${q}" must find products`);
    assert.strictEqual(res.action, 'show_results', `Query "${q}" action must be show_results (got ${res.action})`);
    assert.strictEqual(res.match_status, 'exact', `Query "${q}" match_status must be exact (got ${res.match_status})`);
    const names = (res.productos || []).map((p) => p.nombre);
    assert.ok(
      names.some((d) => /Sala Sanitaria Corona Blanca|Inodoro WC ONE Piece|SET DE Poceta \+ Tanque/i.test(d)),
      `Query "${q}" should return real in-stock toilets, got: ${JSON.stringify(names)}`
    );
    for (const d of names) {
      assert.ok(!/\b(herraje|asiento|tornillo|sifon)\b/i.test(d), `Query "${q}" leaked accessory: ${d}`);
      if (/sin.*lavamano/i.test(q)) {
        assert.ok(!/C\/LAVAMANO/i.test(d), `Query "${q}" leaked C/LAVAMANO: ${d}`);
      }
    }
  }
});

test('buscar_productos_tool still returns spare parts when customer explicitly asks for them', async () => {
  const herrajeRes = await runToolNode('buscar_productos_tool', { p_busqueda: 'herraje para poseta' });
  assert.ok(herrajeRes.encontrados > 0);
  assert.match(herrajeRes.productos[0].nombre, /Herraje Universal WC Boton P\/Poseta/i);

  const asientoRes = await runToolNode('buscar_productos_tool', { p_busqueda: 'asiento para inodoro' });
  assert.ok(asientoRes.encontrados > 0);
  assert.match(asientoRes.productos[0].nombre, /Asiento/i);
});

test('hacer_presupuesto_tool quotes a real in-stock toilet for poseta / juego de bano', async () => {
  const q1 = await runToolNode('hacer_presupuesto_tool', { productos: '1 poseta' });
  assert.strictEqual(q1.ok, true);
  assert.strictEqual(Boolean(q1.incompleto), false);
  assert.match(q1.presupuesto_texto, /Inodoro WC ONE Piece|Sala Sanitaria Corona Blanca|SET DE Poceta \+ Tanque/i);
  assert.doesNotMatch(q1.presupuesto_texto, /Herraje|Asiento/i);

  const q2 = await runToolNode('hacer_presupuesto_tool', { productos: '1 juego de baño sin lavamanos' });
  assert.strictEqual(q2.ok, true);
  assert.strictEqual(Boolean(q2.incompleto), false);
  assert.doesNotMatch(q2.presupuesto_texto, /C\/LAVAMANO/i);
});
