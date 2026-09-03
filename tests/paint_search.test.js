// Hermetic rewrite: same 10 assertions as before, but driven through a fake axios + fixture
// catalog instead of live Supabase (see sdd/testing-foundation design D1-D6). The unmodified
// scratch_live/live_buscar.js is exercised through its existing injected (query, axios, $env)
// seam via tests/support/load-live-buscar.js.
const test = require('node:test');
const assert = require('node:assert');
const { buscarLive } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

async function buscar(p_busqueda) {
  const { result, fake } = await buscarLive(p_busqueda);
  assertAllMatched(fake);
  return result;
}

test('Karla incident: Hay pintura cris para exterior', async () => {
  const res = await buscar('Hay pintura cris para exterior');
  assert.strictEqual(res.encontrados > 0, true, 'Should find paint products');
  const names = res.productos.map(p => p.nombre);
  const hasExteriorPaint = names.some(n => /Gris/i.test(n) && (/Clase A/i.test(n) || /Aceite/i.test(n) || /Sun Deco/i.test(n) || /Pro/i.test(n)));
  assert.strictEqual(hasExteriorPaint, true, 'Should return grey exterior paint');
});

test('Color typo: pintura cris', async () => {
  const res = await buscar('pintura cris');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Gris/i.test(p.nombre)), true);
});

test('Paint Class A: pintura clase a blanca', async () => {
  const res = await buscar('pintura clase a blanca');
  assert.strictEqual(res.encontrados > 0, true);
  const first = res.productos[0];
  assert.strictEqual(/Blanco/i.test(first.nombre), true);
  assert.strictEqual(/Sun Deco|Clase A|Tipo A|\bA\b/i.test(first.nombre), true);
});

test('Paint Class B: pintura clase b azul', async () => {
  const res = await buscar('pintura clase b azul');
  assert.strictEqual(res.encontrados > 0, true);
  const first = res.productos[0];
  assert.strictEqual(/Azul/i.test(first.nombre), true);
  assert.strictEqual(/Mar Deco|Clase B|Tipo B|\bB\b/i.test(first.nombre), true);
});

test('Paint Class C: pintura clase c', async () => {
  const res = await buscar('pintura clase c');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Rio Deco|Clase C|Tipo C|\bC\b/i.test(p.nombre)), true);
});

test('Oil/Enamel Paint: pintura de aceite gris', async () => {
  const res = await buscar('pintura de aceite gris');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Aceite/i.test(p.nombre) && /Gris/i.test(p.nombre)), true);
});

test('Satin Paint: pintura satinada marfil', async () => {
  const res = await buscar('pintura satinada marfil');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Seda Styl|Satinad|Marfil/i.test(p.nombre)), true);
});

test('Cuñete Presentation: cuñete de pintura blanca', async () => {
  const res = await buscar('cuñete de pintura blanca');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Cuñete|4G/i.test(p.nombre) && /Blanc/i.test(p.nombre)), true);
});

test('Liliana incident: Buenas tardes por casualidad que marca de pintura clase B para exterior tiene', async () => {
  const res = await buscar('Buenas tardes por casualidad que marca de pintura clase B para exterior tiene');
  assert.strictEqual(res.encontrados > 0, true, 'Should find paint products');
  const names = res.productos.map(p => p.nombre);
  assert.strictEqual(names.some(n => /Floripaint/i.test(n)), true, 'Should include Floripaint');
  assert.strictEqual(names.some(n => /Mar Deco|Impacto|Vinilevery/i.test(n)), true, 'Should include Impacto or other Clase B brands');
});

test('Floripaint Class B: pintura floripaint clase b', async () => {
  const res = await buscar('pintura floripaint clase b');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.productos.some(p => /Floripaint/i.test(p.nombre) && /\bB\b/i.test(p.nombre)), true);
});
