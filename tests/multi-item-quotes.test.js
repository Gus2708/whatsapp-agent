const test = require('node:test');
const assert = require('node:assert');
const { parseItems } = require('../lib/serrucho-search.js');

test('parseItems: natural list with conjunction "y"', () => {
  const result = parseItems('2 sacos de cemento y 4 tubos 2x1 y 6 laminas de zinc');
  assert.deepStrictEqual(result, [
    { nombre: 'cemento', cantidad: 2 },
    { nombre: 'tubos 2x1', cantidad: 4 },
    { nombre: 'laminas de zinc', cantidad: 6 }
  ]);
});

test('parseItems: mixed commas and terminal conjunction (Oxford style)', () => {
  const result = parseItems('2 sacos de cemento, 4 cerchas y 10 tubos 1x1');
  assert.deepStrictEqual(result, [
    { nombre: 'cemento', cantidad: 2 },
    { nombre: 'cerchas', cantidad: 4 },
    { nombre: 'tubos 1x1', cantidad: 10 }
  ]);
});

test('parseItems: multi-line bullet points and numbered list markers', () => {
  const raw = '- 2 sacos de cemento\n* 4 tubos\n• 1 manto asfaltico\n1. 3 bombillos led';
  const result = parseItems(raw);
  assert.deepStrictEqual(result, [
    { nombre: 'cemento', cantidad: 2 },
    { nombre: 'tubos', cantidad: 4 },
    { nombre: 'manto asfaltico', cantidad: 1 },
    { nombre: 'bombillos led', cantidad: 3 }
  ]);
});

test('parseItems: written number quantities (un, dos, tres, etc.)', () => {
  const result = parseItems('un cuñete de pintura y dos sacos de cemento y tres rollos de teipe');
  assert.deepStrictEqual(result, [
    { nombre: 'cuñete de pintura', cantidad: 1 },
    { nombre: 'cemento', cantidad: 2 },
    { nombre: 'rollos de teipe', cantidad: 3 }
  ]);
});

test('parseItems: connective words "con", "mas/más", "ademas/además", "tambien/también"', () => {
  const result = parseItems('3 tubos pvc con 2 pegas mas 1 teflon tambien 4 codos');
  assert.deepStrictEqual(result, [
    { nombre: 'tubos pvc', cantidad: 3 },
    { nombre: 'pegas', cantidad: 2 },
    { nombre: 'teflon', cantidad: 1 },
    { nombre: 'codos', cantidad: 4 }
  ]);
});

test('parseItems: conjunction inside product description without quantity is preserved', () => {
  const result = parseItems('1 galon de pintura blanco y negro');
  assert.deepStrictEqual(result, [
    { nombre: 'galon de pintura blanco y negro', cantidad: 1 }
  ]);
});

test('parseItems: backwards compatibility with colon, equals, and x syntax', () => {
  const result1 = parseItems('cemento:2, tubos 2x1:4');
  assert.deepStrictEqual(result1, [
    { nombre: 'cemento', cantidad: 2 },
    { nombre: 'tubos 2x1', cantidad: 4 }
  ]);

  const result2 = parseItems('tubo pvc x 3; bombillo = 5');
  assert.deepStrictEqual(result2, [
    { nombre: 'tubo pvc', cantidad: 3 },
    { nombre: 'bombillo', cantidad: 5 }
  ]);
});

test('parseItems: decimal quantities and fractions', () => {
  const result = parseItems('2.5 metros de cable thw 12 y medio cuñete de pintura');
  assert.deepStrictEqual(result, [
    { nombre: 'cable thw 12', cantidad: 2.5 },
    { nombre: 'cuñete de pintura', cantidad: 0.5 }
  ]);
});

test('parseItems: fail-safe handling of empty, whitespace, and invalid inputs', () => {
  assert.deepStrictEqual(parseItems(''), []);
  assert.deepStrictEqual(parseItems('   '), []);
  assert.deepStrictEqual(parseItems(null), []);
  assert.deepStrictEqual(parseItems(undefined), []);
  assert.deepStrictEqual(parseItems(123), []);
});

