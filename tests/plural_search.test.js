// Plural stemming through the real matcher (scratch_live/live_buscar.js), hermetic fixture.
// Regression: singular() tests /[aeiou]s$/ before /[^aeiou]es$/, so "cajetines" became
// "cajetine" and `ilike *cajetine*` missed "CAJETIN 2X4 PLAST CREOLE" -> needless handoff.
const test = require('node:test');
const assert = require('node:assert');
const { buscarLive } = require('./support/load-live-buscar');
const { assertAllMatched } = require('./support/fake-axios');

const row = (codigo_interno, descripcion, existencia = 10) =>
  ({ codigo_interno, descripcion, precio_venta: 1.5, existencia });

const ROWS = [
  row('CAJ-001', 'CAJETIN 2X4 PLAST CREOLE', 40),
  row('CAJ-002', 'CAJETIN 4X2 PLASTICO EXXEL', 25),
  row('CAJ-003', 'CAJETIN PLASTICO 4X2" NORTE', 12),
  row('CAJ-004', 'CAJETIN RECTANGULAR 4X2 FQ PLAST', 8),
  row('CAJ-005', 'CAJETIN OCTAGONAL 4X4 METALICO', 5),
  row('PAP-001', 'PAPEL LIJA AGUA 120', 30),
  row('TAP-001', 'TAPON PVC 1/2 ROSCADO', 30),
  row('CON-001', 'CONEXION FLEXIBLE LAVAMANO 1/2', 30),
  row('TUB-001', 'TUBO PVC AGUAS BLANCAS 1/2', 30),
  row('CAB-001', 'CABLE THW 12 X MT', 30),
  row('LLA-001', 'LLAVE DE PASO PVC 1/2', 30),
  row('CUR-001', 'CURVA PVC ELECTRICIDAD 3/4', 30),
  row('NIV-001', 'NIVEL ALUMINIO 24 PULG', 30),
];

async function buscar(q) {
  const { result, fake } = await buscarLive(q, { rows: ROWS });
  assertAllMatched(fake);
  return result;
}

test('cajetines 2x4 finds the 2x4 cajetin boxes instead of handing off', async () => {
  const res = await buscar('tienen cajetines 2x4');
  assert.notStrictEqual(res.action, 'handoff', JSON.stringify(res));
  assert.ok(res.encontrados > 0, JSON.stringify(res));
  const names = res.productos.map(p => p.nombre.toUpperCase());
  assert.ok(names.some(n => n.includes('CAJETIN 2X4 PLAST CREOLE')), names.join(' | '));
  assert.ok(names.every(n => n.startsWith('CAJETIN')), names.join(' | '));
  assert.ok(!names.some(n => n.includes('4X4')), 'the 4x4 box must not outrank a 2x4 request');
});

for (const [query, expected] of [
  ['cajetines', 'CAJETIN'],
  ['papeles', 'PAPEL LIJA'],
  ['niveles', 'NIVEL ALUMINIO'],
  ['tapones pvc', 'TAPON PVC'],
  ['conexiones flexibles', 'CONEXION FLEXIBLE'],
  ['tubos pvc', 'TUBO PVC'],
  ['cables thw', 'CABLE THW'],
  ['llaves de paso', 'LLAVE DE PASO'],
  ['curvas pvc', 'CURVA PVC'],
]) {
  test(`plural query "${query}" reaches ${expected}`, async () => {
    const res = await buscar(query);
    assert.ok(res.encontrados > 0, JSON.stringify(res));
    assert.notStrictEqual(res.action, 'handoff', JSON.stringify(res));
    assert.ok(!['missing', 'weak', 'single_word'].includes(res.match_status), res.match_status);
    assert.ok(res.productos.some(p => p.nombre.toUpperCase().includes(expected)),
      res.productos.map(p => p.nombre).join(' | '));
  });
}
