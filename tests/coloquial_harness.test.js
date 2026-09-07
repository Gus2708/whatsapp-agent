// Hermetic tests for scripts/_test_coloquial.js (search-accuracy A/B harness).
//
// Design intent (search-accuracy D1-D4, D8): zero network. The live matcher body is
// NEVER executed here -- only the exported pure seams (axios shim, persistence,
// buckets, gate) and the fast-fail CLI paths that must not touch credentials or
// the network. Runs are RED first: this file must fail against the pre-instrumented
// harness and pass after the D1-D4 implementation lands.
'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const HARNESS = path.join(ROOT, 'scripts', '_test_coloquial.js');
const { createFakeAxios, assertAllMatched } = require('./support/fake-axios');

function runCli(args) {
  return spawnSync(process.execPath, [HARNESS, ...args], {
    encoding: 'utf8',
    timeout: 8000,
    env: { ...process.env },
  });
}

// ───────────────────────────────────────────────────────────── CLI contract (D1-D4)
// These paths must fail FAST (before credentials/env or any network): flag validation
// runs first, then --ab (file reads only), then env construction + search loop.
describe('CLI', () => {
  test('unknown flag -> exit 1 with stderr', () => {
    const r = runCli(['--bogus']);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /flag desconocido/);
  });

  test('--ab with missing result files -> exit 1 with clear error', () => {
    const r = runCli(['--ab', 'vec', 'sinvec-missing-' + Date.now()]);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /no existe el archivo de resultados/);
  });

  test('--ab without two labels -> exit 1 with usage error', () => {
    const r = runCli(['--ab']);
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /--ab/);
  });
});

// ───────────────────────────────────────────────────────────── D1 axios shim
describe('D1 axios shim (--sin-aprender)', () => {
  test('short-circuits POSTs to catalogo_vocabulario and automejora-busqueda, never touches transport', async () => {
    const fake = createFakeAxios([
      { when: (r) => r.method === 'GET' && r.path === '/rest/v1/ping', reply: () => [{ ok: 1 }] },
      { when: (r) => r.method === 'POST' && r.path === '/rest/v1/rpc/buscar_productos', reply: () => [] },
    ]);
    const { crearAxiosShim } = require('../scripts/_test_coloquial.js');
    const shim = crearAxiosShim(fake, { sinAprender: true });

    const outVocab = await shim.post('https://x.supabase.co/rest/v1/catalogo_vocabulario', { upsert: true });
    assert.strictEqual(outVocab.data.length, 0);

    const outWebhook = await shim.post('http://127.0.0.1:5678/webhook/automejora-busqueda', { motivo: 'x' });
    assert.strictEqual(outWebhook.data.length, 0);

    // GETs and RPC POSTs pass through unchanged.
    await shim.get('https://x.supabase.co/rest/v1/ping');
    await shim.post('https://x.supabase.co/rest/v1/rpc/buscar_productos', { p_busqueda: 'clavo' });

    assert.strictEqual(fake.requests.length, 2);
    assertAllMatched(fake);
  });

  test('without --sin-aprender the POST reaches the transport', async () => {
    const fake = createFakeAxios([
      { when: (r) => r.method === 'POST' && r.path === '/rest/v1/catalogo_vocabulario', reply: () => [{ id: 1 }] },
    ]);
    const { crearAxiosShim } = require('../scripts/_test_coloquial.js');
    const shim = crearAxiosShim(fake);

    const out = await shim.post('https://x.supabase.co/rest/v1/catalogo_vocabulario', { upsert: true });
    assert.strictEqual(fake.requests.length, 1);
    assert.strictEqual(out.data[0].id, 1);
    assertAllMatched(fake);
  });
});

// ───────────────────────────────────────────────────────────── D2 persistence
describe('D2 atomic persistence (7-field record, .tmp + rename)', () => {
  test('official file written atomically, no .tmp leftover', () => {
    const ruta = path.join(os.tmpdir(), 'wa-coloquial-ok-' + Date.now() + '.json');
    try {
      const { persistirResultados } = require('../scripts/_test_coloquial.js');
      persistirResultados(ruta, { n: 320, resultados: [] });
      const written = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      assert.strictEqual(written.n, 320);
      assert.ok(!fs.existsSync(ruta + '.tmp'));
    } finally {
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
  });

  test('failed rename leaves official file intact and no .tmp behind', () => {
    const ruta = path.join(os.tmpdir(), 'wa-coloquial-fail-' + Date.now() + '.json');
    try {
      const { persistirResultados } = require('../scripts/_test_coloquial.js');
      fs.writeFileSync(ruta, 'OLD', 'utf8');
      const fsx = {
        writeFileSync: (...a) => fs.writeFileSync(...a),
        renameSync: () => { throw new Error('boom'); },
        unlinkSync: (...a) => fs.unlinkSync(...a),
      };
      assert.throws(() => persistirResultados(ruta, { n: 1 }, fsx), /boom/);
      assert.strictEqual(fs.readFileSync(ruta, 'utf8'), 'OLD');
      assert.ok(!fs.existsSync(ruta + '.tmp'));
    } finally {
      if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
    }
  });

  test('registrarCaso builds all 7 fields (codigo, consulta, ok, posicion, top1, rescate, parcial)', () => {
    const { registrarCaso } = require('../scripts/_test_coloquial.js');
    const c = { codigo: 'A1', consulta: 'pipas de agua de 200', descripcion: 'PIPAS DE AGUA DE 200' };
    const res = {
      productos: [{ nombre: 'OTRO' }, { nombre: 'PIPAS DE AGUA DE 200' }],
      rescate: true,
      parcial: false,
    };
    const reg = registrarCaso(c, res);
    assert.deepStrictEqual(reg, {
      codigo: 'A1',
      consulta: 'pipas de agua de 200',
      ok: true,
      posicion: 2,
      top1: 'OTRO',
      rescate: true,
      parcial: false,
    });

    const miss = registrarCaso({ codigo: 'B2', consulta: 'x', descripcion: 'CEMENTO' }, { productos: [{ nombre: 'LAMINA' }] });
    assert.strictEqual(miss.ok, false);
    assert.strictEqual(miss.posicion, 0);
    assert.strictEqual(miss.top1, 'LAMINA');

    const vacio = registrarCaso({ codigo: 'C3', consulta: 'y', descripcion: 'SILICON' }, {});
    assert.strictEqual(vacio.ok, false);
    assert.strictEqual(vacio.posicion, 0);
    assert.strictEqual(vacio.top1, null);
    assert.strictEqual(vacio.rescate, false);
    assert.strictEqual(vacio.parcial, false);
  });
});

// ───────────────────────────────────────────────────────────── D3 buckets
describe('D3 sales-recency buckets', () => {
  test('bucketDeUltimaVenta: null/absent -> sin historial, 365d boundary', () => {
    const { bucketDeUltimaVenta } = require('../scripts/_test_coloquial.js');
    const hoy = '2026-09-07T12:00:00Z';
    assert.strictEqual(bucketDeUltimaVenta(null, hoy), 'sin historial');
    assert.strictEqual(bucketDeUltimaVenta('', hoy), 'sin historial');
    assert.strictEqual(bucketDeUltimaVenta('no-es-fecha', hoy), 'sin historial');
    assert.strictEqual(bucketDeUltimaVenta('2025-09-07T12:00:00Z', hoy), '<1 año'); // exactly 365d
    assert.strictEqual(bucketDeUltimaVenta('2025-09-08T12:00:00Z', hoy), '<1 año'); // 364d
    assert.strictEqual(bucketDeUltimaVenta('2025-09-06T12:00:00Z', hoy), '>1 año'); // 366d
  });

  test('armarBuckets: denominators sum to total, null never dropped', () => {
    const { armarBuckets } = require('../scripts/_test_coloquial.js');
    const hoy = '2026-09-07T12:00:00Z';
    const resultados = [
      { codigo: 'A', ok: true },
      { codigo: 'B', ok: false },
      { codigo: 'C', ok: true },
    ];
    const popularidad = [
      { codigo_interno: 'A', ultima_venta: '2026-08-28T00:00:00Z' }, // <1 año
      { codigo_interno: 'B', ultima_venta: null },                   // sin historial
      // C: ausente -> sin historial (nunca se descarta)
    ];
    const buckets = armarBuckets(resultados, popularidad, hoy);
    const total = buckets['<1 año'].total + buckets['>1 año'].total + buckets['sin historial'].total;
    assert.strictEqual(total, resultados.length);
    assert.strictEqual(buckets['<1 año'].total, 1);
    assert.strictEqual(buckets['<1 año'].exacto_pct, 100);
    assert.strictEqual(buckets['sin historial'].total, 2);
    assert.strictEqual(buckets['sin historial'].exacto_pct, 50);
    assert.strictEqual(buckets['>1 año'].total, 0);
  });

  test('armarBuckets handles popularidad fetch failure (empty array) without crashing', () => {
    const { armarBuckets } = require('../scripts/_test_coloquial.js');
    const buckets = armarBuckets([{ codigo: 'A', ok: false }], [], '2026-09-07T12:00:00Z');
    assert.strictEqual(buckets['sin historial'].total, 1);
    assert.strictEqual(buckets['sin historial'].exacto_pct, 0);
  });
});

// ───────────────────────────────────────────────────────────── D4 A/B gate
describe('D4 A/B gate', () => {
  test('evaluarGap computes vector minus sin-vector exacto_pct', () => {
    const { evaluarGap } = require('../scripts/_test_coloquial.js');
    assert.strictEqual(evaluarGap(76.9, 74.6), 2.3);
  });

  test('gap < 5 -> REJECTED; gap >= 5 -> conditional', () => {
    const { evaluarGate } = require('../scripts/_test_coloquial.js');
    assert.strictEqual(evaluarGate(4.9), 'REJECTED');
    assert.strictEqual(evaluarGate(5.0), 'conditional');
    assert.strictEqual(evaluarGate(0), 'REJECTED');
  });
});