// Hermetic rewrite: same 9 assertions as before, but driven through a fake axios + fixture
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

test('Cliente WhatsApp: Q vale la lámina prepintada canal redonda', async () => {
  const res = await buscar('Q vale la lámina prepintada canal redonda');
  assert.strictEqual(res.encontrados > 0, true, 'Debe encontrar láminas');
  const prods = res.productos;
  const hasPrepintadaOndulada = prods.some(p => /Zinc Ondu|Ondulado|Techolit|PVC.*OND/i.test(p.nombre) && /Rojo|Azul/i.test(p.nombre));
  assert.strictEqual(hasPrepintadaOndulada, true, 'Debe incluir láminas prepintadas onduladas');
  assert.strictEqual(prods[0].disponible, true, 'La primera opción debe estar disponible');
});

test('Cliente WhatsApp: Si nesecito de 12 pies canal ondulado prepintada', async () => {
  const res = await buscar('Si nesecito de 12 pies canal ondulado prepintada');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const all12Pies = prods.every(p => /12\s*Pies?|12PIES|3\.66/i.test(p.nombre));
  assert.strictEqual(all12Pies, true, 'Todas las opciones deben ser de 12 pies');
  const hasInStock = prods.some(p => p.disponible === true);
  assert.strictEqual(hasInStock, true, 'Debe tener opciones en stock');
});

test('Cliente WhatsApp: de las prepintadas 12 pies', async () => {
  const res = await buscar('de las prepintadas 12 pies');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allLaminas = prods.every(p => /Lamina/i.test(p.nombre));
  assert.strictEqual(allLaminas, true, 'Solo debe retornar láminas (no cables ni tornillos)');
});

test('Lámina Arquitectónica 6 metros', async () => {
  const res = await buscar('lamina arquitectonica 6 metros');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const hasArquitectonica = prods.some(p => /Arquitectonica|7 Canales/i.test(p.nombre));
  assert.strictEqual(hasArquitectonica, true, 'Debe retornar lámina arquitectónica');
});

test('Lámina Techolit Roja', async () => {
  const res = await buscar('lamina techolit roja');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  assert.strictEqual(prods.some(p => /Techolit/i.test(p.nombre)), true, 'Debe retornar lámina Techolit');
});

test('Lámina prepintada azul', async () => {
  const res = await buscar('lamina prepintada azul');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allBlue = prods.every(p => /Azul/i.test(p.nombre));
  assert.strictEqual(allBlue, true, 'Todas las opciones deben ser azules');
});

test('Lámina prepintada roja', async () => {
  const res = await buscar('lamina prepintada roja');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allRed = prods.every(p => /Roj[oa]|Techolit/i.test(p.nombre));
  assert.strictEqual(allRed, true, 'Todas las opciones deben ser rojas o Techolit');
});

test('Lámina techo PVC azul', async () => {
  const res = await buscar('lamina techo pvc azul');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  assert.strictEqual(prods.some(p => /PVC/i.test(p.nombre) && /Azul/i.test(p.nombre)), true);
});

test('Láminas de colores para techo', async () => {
  const res = await buscar('laminas de colores para techo');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const hasColor = prods.some(p => /Roj[oa]|Azul|Techolit/i.test(p.nombre));
  assert.strictEqual(hasColor, true, 'Debe sugerir láminas de colores');
});
