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

// FIX-REGRESION-FN (change fix-regresion-fn, R-ALIAS/R-FN/R-TILDES): tabla hermética permanente.
// La fila central ("lamina de zinc" sin color/perfil) es la regresión del alias: sin la copia
// defensiva (`let lf = unicos.filter(() => true)` en lugar de `let lf = unicos`), el bloque final
// (unicos.length = 0; for..of lf) auto-vacía la lista porque lf ES unicos, y la regla devuelve 0.
// "lamina sinz" ejercita el mismo bug vía wantZinc con typo. La fila con tilde es la probe de
// Phase C: devuelve > 0 con Phase A sola (norm() quita los acentos del query antes de
// wantCuadrada), lo que deja Phase C como no adoptada/skipped.
const REGRESION_LAMINA_TABLE = [
  { q: 'lamina de zinc', min: 1, label: 'alias regression: sin sub-filtro no debe auto-vaciar (R-ALIAS)' },
  { q: 'lamina sinz', min: 1, label: 'alias variant: "sinz" dispara wantZinc sin sub-filtro' },
  { q: 'lamina de zinc azul', exact: 4, all: p => /Azul/i.test(p.nombre), label: 'control azul == 4' },
  { q: 'lamina de zinc rojo', min: 1, label: 'control rojo' },
  { q: 'lamina prepintada', min: 1, label: 'control prepintada' },
  { q: 'lamina arquitectonica 6 metros', min: 1, some: p => /Arquitectonica|7 Canales/i.test(p.nombre), label: 'control cuadrada/arquitectonica' },
  { q: 'tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho q presio la tienes', min: 1, label: 'tilde probe (Phase C gate)' },
];

test('LÁMINA: tabla de regresión de 7 filas (fix-regresion-fn)', async () => {
  for (const row of REGRESION_LAMINA_TABLE) {
    const res = await buscar(row.q);
    const prods = res.productos || [];
    if (row.exact !== undefined) {
      assert.strictEqual(res.encontrados, row.exact, `${row.label}: "${row.q}"`);
    } else {
      assert.strictEqual(res.encontrados > 0, true, `${row.label}: "${row.q}"`);
    }
    if (row.all) assert.ok(prods.every(row.all), `${row.label}: todos los resultados deben cumplir`);
    if (row.some) assert.ok(prods.some(row.some), `${row.label}: debe incluir el producto esperado`);
  }
});
