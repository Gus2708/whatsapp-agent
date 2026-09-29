const test = require('node:test');
const assert = require('node:assert');
const { extractDepartmentAttributes } = require('../lib/serrucho-search');
const { productAttributes } = require('../lib/jev-shadow');
const { buscarLive } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

async function buscar(p_busqueda) {
  const { result, fake } = await buscarLive(p_busqueda);
  assertAllMatched(fake);
  return result;
}

test('Department Attributes: techos_laminas extracts length and caliber', () => {
  const attrs = extractDepartmentAttributes('precio de lamina de zinc de 6 metros calibre 30', 'techos_laminas');
  assert.strictEqual(attrs.length, '6m');
  assert.strictEqual(attrs.caliber, '30');

  const attrs12 = extractDepartmentAttributes('lamina de 12 pies cal 35', 'techos_laminas');
  assert.strictEqual(attrs12.length, '3.66m');
  assert.strictEqual(attrs12.caliber, '35');

  const attrs10 = extractDepartmentAttributes('laminas de 10 pies', 'techos_laminas');
  assert.strictEqual(attrs10.length, '3.05m');

  const attrs8 = extractDepartmentAttributes('lamina de 8 pies', 'techos_laminas');
  assert.strictEqual(attrs8.length, '2.44m');
});

test('Department Attributes: hierro_perfiles extracts dimension and thickness', () => {
  const attrs = extractDepartmentAttributes('tubo de herreria 2x1 de 1.1 milimetros', 'hierro_perfiles');
  assert.strictEqual(attrs.dimension, '2x1');
  assert.strictEqual(attrs.thickness, '1.1mm');

  const attrsEst = extractDepartmentAttributes('tubo estructural 100x100 calibre 2mm', 'hierro_perfiles');
  assert.strictEqual(attrsEst.dimension, '100x100');
  assert.strictEqual(attrsEst.thickness, '2.0mm');

  const attrs08 = extractDepartmentAttributes('tubo 1x1 0.8 mm', 'hierro_perfiles');
  assert.strictEqual(attrs08.dimension, '1x1');
  assert.strictEqual(attrs08.thickness, '0.8mm');
});

test('Department Attributes: pinturas extracts presentation, grade_class, finish and color', () => {
  const attrs = extractDepartmentAttributes('cuñete de pintura clase b blanca caucho', 'pinturas');
  assert.strictEqual(attrs.presentation, 'cuñete');
  assert.strictEqual(attrs.grade_class, 'b');
  assert.strictEqual(attrs.finish, 'caucho');
  assert.strictEqual(attrs.color, 'blanco');

  const attrsGalon = extractDepartmentAttributes('galon de pintura satinada azul', 'pinturas');
  assert.strictEqual(attrsGalon.presentation, 'galon');
  assert.strictEqual(attrsGalon.finish, 'satinada');
  assert.strictEqual(attrsGalon.color, 'azul');
});

test('Department Attributes: plomeria_griferia extracts diameter and usage', () => {
  const attrs = extractDepartmentAttributes('tubo de agua 1/2 pulgada', 'plomeria_griferia');
  assert.strictEqual(attrs.diameter, '1/2');

  const attrsAf = extractDepartmentAttributes('tubo pvc 3/4 agua fria', 'plomeria_griferia');
  assert.strictEqual(attrsAf.diameter, '3/4');
  assert.strictEqual(attrsAf.usage, 'agua fria');

  const attrsAn = extractDepartmentAttributes('tubo de 2 pulgadas para aguas negras', 'plomeria_griferia');
  assert.strictEqual(attrsAn.diameter, '2');
  assert.strictEqual(attrsAn.usage, 'aguas negras');
});

test('Department Attributes: auto-detects department when omitted', () => {
  const attrs = extractDepartmentAttributes('tubo 2x1 calibre 1.1');
  assert.strictEqual(attrs.dimension, '2x1');
  assert.strictEqual(attrs.thickness, '1.1mm');

  const paintAttrs = extractDepartmentAttributes('cuñete de pintura caucho blanca');
  assert.strictEqual(paintAttrs.presentation, 'cuñete');
  assert.strictEqual(paintAttrs.finish, 'caucho');
  assert.strictEqual(paintAttrs.color, 'blanco');
});

test('Jev Shadow Context: productAttributes persists multi-department attributes', () => {
  const rawContext = {
    variant: 'thwn',
    gauge: '12',
    color: 'azul',
    presentation: 'cuñete',
    length: '6m',
    caliber: '30',
    dimension: '2x1',
    thickness: '1.1mm',
    grade_class: 'b',
    finish: 'caucho',
    diameter: '1/2',
    usage: 'agua fria'
  };

  const filtered = productAttributes(rawContext);
  assert.strictEqual(filtered.length, '6m');
  assert.strictEqual(filtered.caliber, '30');
  assert.strictEqual(filtered.dimension, '2x1');
  assert.strictEqual(filtered.thickness, '1.1mm');
  assert.strictEqual(filtered.presentation, 'cuñete');
  assert.strictEqual(filtered.grade_class, 'b');
  assert.strictEqual(filtered.finish, 'caucho');
  assert.strictEqual(filtered.diameter, '1/2');
  assert.strictEqual(filtered.usage, 'agua fria');
  assert.strictEqual(filtered.color, 'azul');
});

test('Search Disambiguation: query without dimensions triggers clarification for multi-dimension family', async () => {
  const res = await buscar('tienen laminas de zinc?');
  assert.strictEqual(res.aclarar, true, 'Debe solicitar aclaratoria de medidas para laminas sin largo');
  assert.ok(res.instruccion, 'Debe incluir instruccion de medidas');
  assert.match(res.instruccion, /6 metros/i);
  assert.match(res.instruccion, /12 pies/i);
});

test('Search Disambiguation: query with exact dimension returns results without clarification', async () => {
  const res = await buscar('lamina de zinc de 6 metros');
  assert.notStrictEqual(res.aclarar, true, 'No debe pedir aclaratoria cuando la medida esta presente');
  assert.ok(res.encontrados > 0, 'Debe encontrar laminas');
  const first = res.productos[0];
  assert.match(first.nombre, /6\s*mts|6\s*metros|6m/i, 'La primera opcion debe ser de 6 metros');
});

test('Search Disambiguation: single-dimension items are not asked for dimensions', async () => {
  const res = await buscar('saco de cemento gris');
  assert.notStrictEqual(res.aclarar, true, 'Cemento no debe pedir aclaratoria de dimensiones');
  assert.ok(res.encontrados > 0, 'Debe encontrar cemento');
});
