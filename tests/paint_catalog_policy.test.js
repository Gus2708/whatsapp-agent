const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../lib/serrucho-search.js');
const C = require('../lib/catalog-search.js');
const { buscarLive } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

const REALISTIC_COATING_CATALOG = [
  { codigo_interno: '02134', descripcion: 'FONDO ANTICORROSIVO EL PRO 30-100 GRIS 1/4', precio_venta: 6.5, existencia: 27 },
  { codigo_interno: '02135', descripcion: 'FONDO ANTICORROSIVO EL PRO 30-100 GRIS GALON', precio_venta: 19.0, existencia: 2 },
  { codigo_interno: '02137', descripcion: 'FONDO ANTICORROSIVO EL PRO 30-103 BLANCO 1/4', precio_venta: 6.5, existencia: 8 },
  { codigo_interno: '02138', descripcion: 'FONDO ANTICORROSIVO EL PRO 30-103 BLANCO GALON', precio_venta: 19.0, existencia: -3 },
  { codigo_interno: '02141', descripcion: 'FONDO ANTICORROSIVO EVERY A200 BLANCO 1/4', precio_venta: 7.0, existencia: 15 },
  { codigo_interno: '03773', descripcion: 'PINTURA DE ACEITE EL PRO 30-206 GRIS 1/4', precio_venta: 7.0, existencia: 42 },
  { codigo_interno: '03679', descripcion: 'PINTURA ACEITE EL PRO 30-206 GRIS GALON', precio_venta: 20.0, existencia: 5 },
  { codigo_interno: '03764', descripcion: 'PINTURA DE ACEITE EL PRO 30-200 BLANCO 1/4', precio_venta: 7.0, existencia: 33 },
  { codigo_interno: 'F-830-04', descripcion: 'PINTURA ESMALTE 2 EN 1 GRIS 1/4 FLORIPAINT', precio_venta: 7.0, existencia: 12 },
  { codigo_interno: 'F-830-01', descripcion: 'PINTURA ESMALTE 2 EN 1 GRIS GAL FLORIPAINT', precio_venta: 22.0, existencia: 8 },
  { codigo_interno: 'F-105-04', descripcion: 'PINTURA CAUCHO GRIS CLARO B CUNETE FLORIPAINT', precio_venta: 35.5, existencia: 4 },
  { codigo_interno: 'F-101-01', descripcion: 'PINTURA CAUCHO BLANCO B GAL FLORIPAINT', precio_venta: 9.5, existencia: 21 },
  { codigo_interno: 'F-101-04', descripcion: 'PINTURA CAUCHO BLANCO B CUNETE FLORIPAINT', precio_venta: 35.5, existencia: 6 },
  { codigo_interno: 'F-356-01', descripcion: 'PINTURA PREMIUM GRIS CONCRETO A GAL FLORIPAINT', precio_venta: 24.0, existencia: 6 },
  { codigo_interno: '03912', descripcion: 'PINTURA SPRAY FONDO HERRERIA GRIS 450ML EXXEL', precio_venta: 4.0, existencia: 4 },
  { codigo_interno: '03906', descripcion: 'PINTURA SPRAY ANTICORROSIVO GRIS DIESEL DT4385', precio_venta: 2.5, existencia: -1 },
  { codigo_interno: 'F-721-04', descripcion: 'BARNIZ CAOBA CLARO 1/4 FLORIPAINT', precio_venta: 8.5, existencia: 4 },
  { codigo_interno: 'F-723-04', descripcion: 'SELLADOR CONCENTRADO 1/4 FLORIPAINT', precio_venta: 7.5, existencia: 5 },
  { codigo_interno: 'F-790-01', descripcion: 'PASTA PROFESIONAL FLORIPAINT GAL', precio_venta: 11.0, existencia: 3 },
  { codigo_interno: 'THINNER-M', descripcion: 'SOLVENTE MULTIUSO FLORIPAINT', precio_venta: 5.0, existencia: 10 },
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
      if (url.includes('/rest/v1/tazas')) return { data: [{ bcv_usd: 1153.2 }] };
      if (url.includes('/rest/v1/presupuesto_config')) return { data: [{ markup_porcentaje: 20 }] };
      if (url.includes('/rest/v1/productos?')) return { data: matchPostgrestQuery(catalog, url) };
      return { data: [] };
    },
    async post(url, body) {
      if (url.includes('popularidad_productos')) {
        const codes = (body && body.p_codigos) || [];
        return { data: codes.map((c) => ({ codigo_producto: c, total: c === '02134' ? 4 : 2 })) };
      }
      return { data: [] };
    },
  };
}

async function runToolNode(nodeName, queryObj, {
  catalog = REALISTIC_COATING_CATALOG,
  customerText = '',
  axiosMock = null,
  fsMock = fs,
  chatId = '584121234567@c.us',
} = {}) {
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
          return { json: { body: { payload: { from: chatId, body: customerText } } } };
        }
        if (name === 'Prepare Conversation Context') {
          return { json: { conversation_context: { query: customerText } } };
        }
        return { json: {} };
      },
    }),
    require: (id) => {
      if (id === 'axios') return fakeAxios;
      if (id === 'fs') return fsMock;
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

test('Yulians Garcia incident: anticorrosivo gris de cuarto resolves to Fondo Anticorrosivo 1/4 and blocks Floripaint PDF', async () => {
  const query = 'Buenas tardes en cuanto tiene el anticorrosivo gris de cuarto';
  const { result, fake } = await buscarLive(query, { rows: REALISTIC_COATING_CATALOG });
  assertAllMatched(fake);

  assert.strictEqual(result.modo_resumen_pintura, undefined);
  assert.strictEqual(result.action, 'show_results');
  assert.strictEqual(result.match_status, 'exact');
  assert.strictEqual(result.encontrados > 0, true);
  assert.match(result.productos[0].nombre, /Fondo Anticorrosivo.*Gris 1\/4/i);
  assert.strictEqual(result.productos.some((p) => /Spray/i.test(p.nombre)), false);
  assert.strictEqual(!result.instruccion || !result.instruccion.includes('enviar_catalogo_pintura'), true);

  const n8nRes = await runToolNode('buscar_productos_tool', { p_busqueda: query });
  assert.strictEqual(n8nRes.modo_resumen_pintura, undefined);
  assert.strictEqual(n8nRes.action, 'show_results');
  assert.match(n8nRes.productos[0].nombre, /Fondo Anticorrosivo.*Gris 1\/4/i);

  let wahaCalls = 0;
  const catOut = await runToolNode(
    'enviar_catalogo_pintura_tool',
    { metodo_pago: 'divisas' },
    {
      customerText: query,
      axiosMock: { async post() { wahaCalls++; return { data: { ok: true } }; } },
    }
  );
  assert.strictEqual(catOut.enviado, false);
  assert.strictEqual(catOut.bloqueado, true);
  assert.strictEqual(wahaCalls, 0);
});

test('Cuarto disambiguation: product 1/4 vs room interior vs 3/4 pipe', async () => {
  for (const lib of [S, C]) {
    assert.strictEqual(lib.expandir('tubo de tres cuartos'), 'tubo de 3/4');
    assert.strictEqual(lib.expandir('pintura blanca para mi cuarto'), 'pintura blanca para mi interior');
    assert.strictEqual(lib.expandir('anticorrosivo gris de cuarto'), 'anticorrosivo gris de 1/4');
  }

  const attrsRoom = S.extractDepartmentAttributes('pintura blanca para mi cuarto', 'pinturas');
  assert.strictEqual(attrsRoom.presentation, undefined);

  const oilQuarter = await buscarLive('pintura gris de cuarto', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(oilQuarter.result.modo_resumen_pintura, undefined);
  assert.strictEqual(oilQuarter.result.action, 'show_results');
  assert.strictEqual(oilQuarter.result.productos.some((p) => /Aceite.*Gris 1\/4|Esmalte.*Gris 1\/4/i.test(p.nombre)), true);

  const roomPaint = await buscarLive('pintura blanca para mi cuarto', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(roomPaint.result.modo_resumen_pintura, undefined);
  assert.strictEqual(roomPaint.result.action, 'show_results');
  assert.strictEqual(roomPaint.result.productos.every((p) => /Caucho.*Blanc/i.test(p.nombre) && !/1\/4/i.test(p.nombre)), true);
});

test('Specialty coatings never enter wall-paint summary mode or trigger Floripaint PDF', async () => {
  // Out-of-stock presentation fallback stays within Fondo Anticorrosivo
  const fallbackFondo = await buscarLive('fondo anticorrosivo blanco galon', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(fallbackFondo.result.modo_resumen_pintura, undefined);
  assert.strictEqual(fallbackFondo.result.action, 'confirm');
  assert.strictEqual(fallbackFondo.result.match_status, 'relaxed');
  assert.strictEqual(fallbackFondo.result.parcial, true);
  assert.strictEqual(fallbackFondo.result.productos.every((p) => /Fondo Anticorrosivo.*Blanc/i.test(p.nombre) && p.disponible === true), true);

  // Generic fondo query returns product cards, not wall-paint summary
  const genericFondo = await buscarLive('tienen fondo anticorrosivo?', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(genericFondo.result.modo_resumen_pintura, undefined);
  assert.strictEqual(genericFondo.result.productos.length > 0, true);
  assert.strictEqual(genericFondo.result.productos.every((p) => /Fondo Anticorrosivo/i.test(p.nombre)), true);

  // Specific oil & Floripaint enamel queries return product cards without PDF
  const aceiteRes = await buscarLive('pintura de aceite gris de cuarto', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(aceiteRes.result.modo_resumen_pintura, undefined);
  assert.match(aceiteRes.result.productos[0].nombre, /Pintura DE Aceite EL PRO 30-206 Gris 1\/4/i);

  const esmalteFlori = await buscarLive('esmalte 2 en 1 gris 1/4 floripaint', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(esmalteFlori.result.modo_resumen_pintura, undefined);
  assert.match(esmalteFlori.result.productos[0].nombre, /Esmalte 2 EN 1 Gris 1\/4 Floripaint/i);

  // Non-wall-paint Floripaint products (barniz, pasta profesional) stay out of summary mode
  const barnizRes = await buscarLive('barniz caoba de cuarto floripaint', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(barnizRes.result.modo_resumen_pintura, undefined);
  assert.match(barnizRes.result.productos[0].nombre, /Barniz Caoba Claro 1\/4 Floripaint/i);

  // Presupuesto quotes Fondo Anticorrosivo 1/4
  const presOut = await runToolNode('hacer_presupuesto_tool', { productos: '2 anticorrosivo gris de cuarto' });
  assert.strictEqual(presOut.ok, true);
  assert.match(presOut.presupuesto_texto, /Fondo Anticorrosivo EL PRO 30-100 Gris 1\/4/i);
});

test('shouldAllowFloripaintCatalog enforces strict default-deny allowlist across all categories', async () => {
  const blockedQueries = [
    '',
    'Buenas tardes en cuanto tiene el anticorrosivo gris de cuarto',
    'fondo anticorrosivo blanco galon',
    'pintura de aceite blanco 1/4',
    'esmalte 2 en 1 gris floripaint',
    'barniz caoba floripaint',
    'laca poliuretano transparente',
    'sellador de ceramica gris',
    'spray negro mate',
    'pintura impermeabilizante sellafill',
    'pintura para piso color negra',
    'solvente floripaint',
    'pasta profesional floripaint',
    'brocha 3 pulgadas para pintura',
    'cemento gris csc',
    'tubo pvc 1/2',
    'cabilla estriada 1/2',
    'cable thwn 12',
    'qué colores de láminas prepintadas tienen',
    'catálogo de cerraduras',
    'puerta plegable gris',
    'galón de pega blanca',
    'candado manqui 32mm',
  ];

  let wahaCalls = 0;
  const axiosSpy = { async post() { wahaCalls++; return { data: { ok: true } }; } };

  for (const q of blockedQueries) {
    assert.strictEqual(S.shouldAllowFloripaintCatalog(q).allowed, false, `Expected blocked for: "${q}"`);
    const out = await runToolNode('enviar_catalogo_pintura_tool', { metodo_pago: 'divisas' }, { customerText: q, axiosMock: axiosSpy });
    assert.strictEqual(out.enviado, false, `Tool must not send for: "${q}"`);
    assert.strictEqual(out.bloqueado, true, `Tool must block: "${q}"`);
  }
  assert.strictEqual(wahaCalls, 0);

  const allowedQueries = [
    'a como tienen las pinturas',
    'Me puede decir q pintura tiene clase B en cuñete',
    'Me podría pasar la foto de los colores q tienes disponibles en cuñete',
    'Buenas tardes! Me pueden pasar la paleta de colores disponible? Y que tipo de clase es porfa',
    'Y durazno por cuñe clase B tiene también',
    'pintura floripaint clase b',
    'pásame el catálogo de floripaint',
    'pintura de agua color beige para pared de bloque',
  ];
  for (const q of allowedQueries) {
    assert.strictEqual(S.shouldAllowFloripaintCatalog(q).allowed, true, `Expected allowed for: "${q}"`);
  }
});

test('enviar_catalogo_pintura_tool always sends Divisas PDF (never Bs PDF) and instructs Bs prices without percentages', async () => {
  const sentPayloads = [];
  const writtenFiles = [];
  const fakeFs = {
    existsSync: (p) => String(p).includes('floripaint_divisas.pdf'),
    readFileSync: (p) => {
      if (String(p).includes('floripaint_divisas.pdf')) return Buffer.from('FAKE_DIVISAS_PDF');
      throw new Error('Unexpected read: ' + p);
    },
    writeFileSync: (p, data) => { writtenFiles.push({ p, data }); },
  };
  const axiosSpy = {
    async post(url, payload) {
      sentPayloads.push({ url, payload });
      return { data: { ok: true } };
    },
  };

  for (const metodo of ['bcv', 'bolivares', 'bs', 'divisas']) {
    const out = await runToolNode(
      'enviar_catalogo_pintura_tool',
      { metodo_pago: metodo },
      {
        customerText: 'Me pueden pasar el catalogo de pintura en bolivares?',
        axiosMock: axiosSpy,
        fsMock: fakeFs,
        chatId: `58412000000_${metodo}@c.us`,
      }
    );
    assert.strictEqual(out.enviado, true);
    assert.strictEqual(out.catalogo, 'floripaint_divisas.pdf');
    assert.match(out.resultado, /sin mencionar porcentajes ni recargos/i);
  }

  assert.strictEqual(sentPayloads.length, 4);
  for (const call of sentPayloads) {
    assert.strictEqual(call.payload.file.filename, 'Catalogo_Floripaint_Divisas_El_Serrucho.pdf');
    assert.doesNotMatch(call.payload.file.filename, /BCV/i);
    assert.match(call.payload.caption, /Divisas/i);
    assert.match(call.payload.caption, /Bolívares.*cambio del día/i);
  }
  assert.strictEqual(writtenFiles.length, 4);

  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n_workflow.json'), 'utf8'));
  const catNode = wf.nodes.find((n) => n.name === 'enviar_catalogo_pintura_tool');
  assert.doesNotMatch(catNode.parameters.description, /'bcv' para pago en bolívares/i);
  assert.match(catNode.parameters.description, /sin mencionar porcentajes ni recargos/i);

  const sm = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_systemMessage.txt'), 'utf8');
  assert.match(sm, /Ya NO se envía catálogo en Bs/i);
  assert.match(sm, /SIN mencionar porcentajes ni recargos/i);
});

test('Wall-paint summary integrity: no double "en *en", no dangling header, and Divisas-only catalog hint', async () => {
  const unavailQuarter = await buscarLive('pintura roja de cuarto', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(unavailQuarter.result.modo_resumen_pintura, true);
  assert.doesNotMatch(unavailQuarter.result.resumen_pinturas_texto, /en \*en /i);
  assert.match(unavailQuarter.result.resumen_pinturas_texto, /disponible en \*1\/4 de Galón\*/i);
  // In REALISTIC_COATING_CATALOG, 1/4 only has oil/esmalte, so Floripaint caucho PDF is NOT triggered
  assert.strictEqual(unavailQuarter.result.catalogo_floripaint_permitido, false);

  const unavailClassBQuarter = await buscarLive('pintura roja clase b de cuarto', { rows: REALISTIC_COATING_CATALOG });
  assert.strictEqual(unavailClassBQuarter.result.modo_resumen_pintura, true);
  assert.strictEqual(unavailClassBQuarter.result.catalogo_floripaint_permitido, true);
  assert.doesNotMatch(unavailClassBQuarter.result.resumen_pinturas_texto, /en \*en /i);
  assert.match(unavailClassBQuarter.result.resumen_pinturas_texto, /disponible en \*Clase B en 1\/4 de Galón\*/i);
  assert.match(unavailClassBQuarter.result.instruccion, /nunca en Bs/i);
  assert.match(unavailClassBQuarter.result.instruccion, /SIN mencionar porcentajes ni recargos/i);

  const onlyAceiteRows = [
    { codigo_interno: '03773', descripcion: 'PINTURA DE ACEITE EL PRO 30-206 GRIS 1/4', precio_venta: 7.0, existencia: 42 },
  ];
  const aceiteOnlySummary = await buscarLive('pintura rosada', { rows: onlyAceiteRows });
  assert.strictEqual(aceiteOnlySummary.result.modo_resumen_pintura, true);
  assert.strictEqual(aceiteOnlySummary.result.catalogo_floripaint_permitido, false);

  const onlyOtherRows = [
    { codigo_interno: 'F-789-01', descripcion: 'PINTURA ANTIALCALINO GAL FLORIPAINT', precio_venta: 15.0, existencia: 4 },
  ];
  const emptyGroups = await buscarLive('pintura rosada', { rows: onlyOtherRows });
  assert.strictEqual(emptyGroups.result.modo_resumen_pintura, true);
  assert.strictEqual(emptyGroups.result.resumen_pinturas.length, 0);
  assert.strictEqual(emptyGroups.result.catalogo_floripaint_permitido, false);
  assert.doesNotMatch(emptyGroups.result.resumen_pinturas_texto, /siguientes clases y marcas:\s*$/i);
});
