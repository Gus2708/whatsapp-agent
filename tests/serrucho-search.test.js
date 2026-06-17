const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/serrucho-search.js');

test('norm: lowercases, strips accents, collapses whitespace', () => {
  assert.strictEqual(L.norm('  Hólá   Múndo '), 'hola mundo');
  assert.strictEqual(L.norm('Tubo/Codo-2'), 'tubo/codo-2');
});

test('normMedida: normalizes composite measures', () => {
  assert.strictEqual(L.normMedida('3 x 1 1/2'), '3x1-1/2');
  assert.strictEqual(L.normMedida('10 mm'), '10mm');
  assert.strictEqual(L.normMedida('2x1'), '2x1');
});

test('medPresent: caliber equivalence + order-independent pairs', () => {
  assert.strictEqual(L.medPresent('1/2', L.normMedida('cabilla estriada 1/2')), true);
  assert.strictEqual(L.medPresent('12mm', L.normMedida('cabilla estriada 1/2')), true);
  assert.strictEqual(L.medPresent('40x100', L.normMedida('tubo 100x40 estructural')), true);
  assert.strictEqual(L.medPresent('5/8', L.normMedida('cabilla 1/2')), false);
});

test('esGranel: detects per-meter / bulk items', () => {
  assert.strictEqual(L.esGranel('CABLE THWN 12 X MT'), true);
  assert.strictEqual(L.esGranel('TORNILLO 1/2'), false);
});

test('singular: reduces Spanish plurals', () => {
  assert.strictEqual(L.singular('tubos'), 'tubo');
  assert.strictEqual(L.singular('cables'), 'cable');
  assert.strictEqual(L.singular('gris'), 'gris');
  assert.strictEqual(L.singular('alambrones'), 'alambron');
});

test('stemColor: neutralizes gender/number', () => {
  assert.strictEqual(L.stemColor('blanca'), 'blanc');
  assert.strictEqual(L.stemColor('blancos'), 'blanc');
});

test('expandir: applies synonyms (varilla -> cabilla)', () => {
  assert.strictEqual(L.expandir('varilla 1/2'), 'cabilla 1/2');
});

test('nUSD: money formatting', () => {
  assert.strictEqual(L.nUSD(2.5), '2.50');
  assert.strictEqual(L.nUSD(3), '3');
  assert.strictEqual(L.nUSD(0), '0');
});

test('tc: title-case, upcases short tokens and numbers', () => {
  assert.strictEqual(L.tc('TUBO pvc 1/2'), 'Tubo PVC 1/2');
});

test('parseItems: parses "name:qty" lists', () => {
  assert.deepStrictEqual(
    L.parseItems('cemento gris:2, cabilla 12mm:4'),
    [{ nombre: 'cemento gris', cantidad: 2 }, { nombre: 'cabilla 12mm', cantidad: 4 }]
  );
});
