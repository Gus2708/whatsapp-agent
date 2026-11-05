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
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(/Clase C/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Rio Deco|Floripaint/i.test(res.resumen_pinturas_texto), true);
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
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(/Floripaint/i.test(res.resumen_pinturas_texto), true, 'Should include Floripaint');
  assert.strictEqual(/Mar Deco|Impacto/i.test(res.resumen_pinturas_texto), true, 'Should include Impacto or other Clase B brands');
});

test('Floripaint Class B: pintura floripaint clase b', async () => {
  const res = await buscar('pintura floripaint clase b');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(/Floripaint/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Clase B/i.test(res.resumen_pinturas_texto), true);
});

test('Water-based paint: Pintura de agua color Beige maps to pintura caucho', async () => {
  const res = await buscar('Pintura de agua color Beige');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.action, 'show_results');
  assert.strictEqual(res.match_status, 'exact');
  assert.strictEqual(res.requires_confirmation, false);
  assert.strictEqual(res.productos.every(p => /Beige/i.test(p.nombre)), true);
});

test('Pink Beige incident: Pintura de agua color pink Beige never hallucinates Agua Marina', async () => {
  const res = await buscar('Pintura de agua color pink Beige');
  assert.strictEqual(res.encontrados > 0, true);
  // Never return Agua Marina (which was the bug)
  assert.strictEqual(res.productos.some(p => /Agua Marina/i.test(p.nombre)), false, 'Must not return Agua Marina');
  // Must return Beige alternatives
  assert.strictEqual(res.productos.every(p => /Beige/i.test(p.nombre)), true, 'Should find Beige paint');
  // Must enforce confirmation because an attribute (pink/rosad) was dropped
  assert.strictEqual(res.action, 'confirm', 'Must require confirmation when dropping color attribute');
  assert.strictEqual(res.match_status, 'relaxed');
  assert.strictEqual(res.requires_confirmation, true);
  assert.strictEqual(res.parcial, true);
});

test('Paint presentation: 4 litros maps to galon without measure_mismatch', async () => {
  const res = await buscar('pinturas de caucho , de 4 litros');
  assert.strictEqual(res.encontrados > 0, true);
  assert.notStrictEqual(res.match_status, 'measure_mismatch');
  assert.strictEqual(!res.instruccion || !res.instruccion.includes('medida/calibre "4" NO existe'), true);
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(res.consulta_generica_pintura, true);
  assert.strictEqual(/Gal[oó]n/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(Array.isArray(res.colores_disponibles) && res.colores_disponibles.length > 0, true);
});

test('Paint presentation with specific color: 4 litros de pintura blanca', async () => {
  const res = await buscar('4 litros de pintura blanca');
  assert.strictEqual(res.encontrados > 0, true);
  assert.notStrictEqual(res.match_status, 'measure_mismatch');
  assert.strictEqual(res.productos.every(p => /Blanc/i.test(p.nombre)), true);
  assert.strictEqual(res.consulta_generica_pintura, undefined);
});

test('Eliseth incident: Buenas tardes! Me pueden pasar la paleta de colores disponible? Y que tipo de clase es porfa', async () => {
  const res = await buscar('Buenas tardes! Me pueden pasar la paleta de colores disponible? Y que tipo de clase es porfa');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.match_status, 'exact');
  assert.strictEqual(res.action, 'show_results');
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(/Clase A/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Clase B/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Clase C/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Floripaint/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(/Impacto/i.test(res.resumen_pinturas_texto), true);
  assert.strictEqual(Array.isArray(res.colores_disponibles) && res.colores_disponibles.length > 0, true);
  assert.strictEqual(!res.instruccion || !res.instruccion.includes('prepintada'), true);
});

test('General paint query: a como tienen las pinturas', async () => {
  const res = await buscar('a como tienen las pinturas');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.modo_resumen_pintura, true);
  assert.strictEqual(res.productos.length, 0);
  assert.strictEqual(res.match_status, 'exact');
});

test('Color specific paint query: tienen pintura blanca?', async () => {
  const res = await buscar('tienen pintura blanca?');
  assert.strictEqual(res.encontrados > 0, true);
  assert.strictEqual(res.modo_resumen_pintura, undefined);
  assert.strictEqual(res.productos.length > 0, true);
  assert.strictEqual(res.productos.every(p => /Blanc/i.test(p.nombre)), true);
  assert.strictEqual(res.productos.every(p => p.disponible === true), true);
});
