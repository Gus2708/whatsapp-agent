const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const L = require('../lib/serrucho-search.js');

const axios = {
  get: async (url, opts) => {
    const res = await fetch(url, { headers: opts && opts.headers });
    const data = await res.json();
    return { data };
  },
  post: async (url, body, opts) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: opts && opts.headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { data };
  }
};

const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

async function buscarLive(p_busqueda) {
  const query = { p_busqueda };
  const rawCode = fs.readFileSync(__dirname + '/../scratch_live/live_buscar.js', 'utf8');
  const code = rawCode.replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction('query', 'axios', code);
  const resultStr = await fn(query, axios);
  return JSON.parse(resultStr);
}

test('Karla incident: Hay pintura cris para exterior', async () => {
  const res = await buscarLive('Hay pintura cris para exterior');
  assert.strictEqual(res.encontrados > 0, true, 'Should find paint products');
  const names = res.productos.map(p => p.nombre);
  const hasExteriorPaint = names.some(n => /Gris/i.test(n) && (/Clase A/i.test(n) || /Aceite/i.test(n) || /Sun Deco/i.test(n) || /Pro/i.test(n)));
  assert.strictEqual(hasExteriorPaint, true, 'Should return grey exterior paint');
});

test('Color typo: pintura cris', async () => {
  const res = await buscarLive('pintura cris');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Gris/i.test(p.nombre)), true);
});

test('Paint Class A: pintura clase a blanca', async () => {
  const res = await buscarLive('pintura clase a blanca');
  assert.strictEqual(res.encontrados > 0, true);
  const first = res.productos[0];
  assert.strictEqual(/Blanco/i.test(first.nombre), true);
  assert.strictEqual(/Sun Deco|Clase A|Tipo A|\bA\b/i.test(first.nombre), true);
});

test('Paint Class B: pintura clase b azul', async () => {
  const res = await buscarLive('pintura clase b azul');
  assert.strictEqual(res.encontrados > 0, true);
  const first = res.productos[0];
  assert.strictEqual(/Azul/i.test(first.nombre), true);
  assert.strictEqual(/Mar Deco|Clase B|Tipo B|\bB\b/i.test(first.nombre), true);
});

test('Paint Class C: pintura clase c', async () => {
  const res = await buscarLive('pintura clase c');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Rio Deco|Clase C|Tipo C|\bC\b/i.test(p.nombre)), true);
});

test('Oil/Enamel Paint: pintura de aceite gris', async () => {
  const res = await buscarLive('pintura de aceite gris');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Aceite/i.test(p.nombre) && /Gris/i.test(p.nombre)), true);
});

test('Satin Paint: pintura satinada marfil', async () => {
  const res = await buscarLive('pintura satinada marfil');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Seda Styl|Satinad|Marfil/i.test(p.nombre)), true);
});

test('Cuñete Presentation: cuñete de pintura blanca', async () => {
  const res = await buscarLive('cuñete de pintura blanca');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Cuñete|4G/i.test(p.nombre) && /Blanc/i.test(p.nombre)), true);
});
