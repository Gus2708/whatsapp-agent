const test = require('node:test');
const assert = require('node:assert');
const {
  estimateConstructionMaterials,
  detectConstructionTask
} = require('../lib/construction-estimator.js');

test('estimateConstructionMaterials: pegar_bloques calculation', () => {
  const result = estimateConstructionMaterials('pegar_bloques', 200);
  assert.strictEqual(result.tarea, 'pegar_bloques');
  assert.strictEqual(result.cantidad, 200);
  assert.deepStrictEqual(result.materiales, [
    { nombre: 'cemento gris', cantidad: 7, unidad: 'sacos' },
    { nombre: 'arena lavada', cantidad: 1, unidad: 'metros cubicos' }
  ]);
  assert.strictEqual(result.items_presupuesto, '7 sacos de cemento gris, 1 metro de arena lavada');
});

test('estimateConstructionMaterials: vaciar_piso_losa calculation', () => {
  const result = estimateConstructionMaterials('vaciar_piso_losa', 20);
  assert.strictEqual(result.tarea, 'vaciar_piso_losa');
  assert.strictEqual(result.cantidad, 20);
  assert.deepStrictEqual(result.materiales, [
    { nombre: 'cemento gris', cantidad: 16, unidad: 'sacos' },
    { nombre: 'arena lavada', cantidad: 1, unidad: 'metros cubicos' },
    { nombre: 'piedra picada', cantidad: 1.5, unidad: 'metros cubicos' },
    { nombre: 'malla truckson', cantidad: 20, unidad: 'metros cuadrados' }
  ]);
  assert.strictEqual(
    result.items_presupuesto,
    '16 sacos de cemento gris, 1 metro de arena lavada, 1.5 metros de piedra picada, 20 metros de malla truckson'
  );
});

test('estimateConstructionMaterials: frisar_pared calculation', () => {
  const result = estimateConstructionMaterials('frisar_pared', 30);
  assert.strictEqual(result.tarea, 'frisar_pared');
  assert.strictEqual(result.cantidad, 30);
  assert.deepStrictEqual(result.materiales, [
    { nombre: 'cemento gris', cantidad: 5, unidad: 'sacos' },
    { nombre: 'arena fina', cantidad: 0.8, unidad: 'metros cubicos' }
  ]);
  assert.strictEqual(result.items_presupuesto, '5 sacos de cemento gris, 0.8 metros de arena fina');
});

test('estimateConstructionMaterials: cerca_alambre_pua calculation', () => {
  const result = estimateConstructionMaterials('cerca_alambre_pua', 50);
  assert.strictEqual(result.tarea, 'cerca_alambre_pua');
  assert.strictEqual(result.cantidad, 50);
  assert.deepStrictEqual(result.materiales, [
    { nombre: 'alambre de pua', cantidad: 200, unidad: 'metros' },
    { nombre: 'grapas para alambre de pua', cantidad: 1, unidad: 'empaque 500gr' }
  ]);
  assert.strictEqual(
    result.items_presupuesto,
    '200 metros de alambre de pua, 1 empaque de grapas para alambre de pua'
  );
});

test('estimateConstructionMaterials: pintar_superficie calculation', () => {
  const result = estimateConstructionMaterials('pintar_superficie', 80);
  assert.strictEqual(result.tarea, 'pintar_superficie');
  assert.strictEqual(result.cantidad, 80);
  assert.deepStrictEqual(result.materiales, [
    { nombre: 'cuñete de pintura caucho blanco', cantidad: 1, unidad: 'cuñete' },
    { nombre: 'rodillo para pintar', cantidad: 1, unidad: 'unidad' },
    { nombre: 'brocha para pintar', cantidad: 1, unidad: 'unidad' },
    { nombre: 'tirro de papel', cantidad: 1, unidad: 'unidad' }
  ]);
  assert.strictEqual(
    result.items_presupuesto,
    '1 cuñete de pintura caucho blanco, 1 rodillo para pintar, 1 brocha para pintar, 1 tirro de papel'
  );
});

test('detectConstructionTask: recognizes various project formulations with dimensions', () => {
  const q1 = detectConstructionTask('cuanto material se va para pegar 200 bloques');
  assert.strictEqual(q1?.tarea, 'pegar_bloques');
  assert.strictEqual(q1?.cantidad, 200);

  const q2 = detectConstructionTask('que necesito para vaciar una placa de 20 metros cuadrados');
  assert.strictEqual(q2?.tarea, 'vaciar_piso_losa');
  assert.strictEqual(q2?.cantidad, 20);

  const q3 = detectConstructionTask('materiales para frisar 30 metros de pared');
  assert.strictEqual(q3?.tarea, 'frisar_pared');
  assert.strictEqual(q3?.cantidad, 30);

  const q4 = detectConstructionTask('para armar una cerca de 50 metros con alambre de pua');
  assert.strictEqual(q4?.tarea, 'cerca_alambre_pua');
  assert.strictEqual(q4?.cantidad, 50);

  const q5 = detectConstructionTask('cuanta pintura para pintar 80 metros cuadrados');
  assert.strictEqual(q5?.tarea, 'pintar_superficie');
  assert.strictEqual(q5?.cantidad, 80);
});

test('detectConstructionTask: flags missing dimension for project inquiries', () => {
  const q1 = detectConstructionTask('que necesito para vaciar un piso');
  assert.strictEqual(q1?.match, true);
  assert.strictEqual(q1?.requires_dimension, true);
  assert.strictEqual(q1?.tarea, 'vaciar_piso_losa');

  const q2 = detectConstructionTask('cuanto cemento para pegar bloques');
  assert.strictEqual(q2?.match, true);
  assert.strictEqual(q2?.requires_dimension, true);
  assert.strictEqual(q2?.tarea, 'pegar_bloques');
});

test('detectConstructionTask: fail-closed on standard product queries', () => {
  assert.strictEqual(detectConstructionTask('bloque #10'), null);
  assert.strictEqual(detectConstructionTask('cemento gris'), null);
  assert.strictEqual(detectConstructionTask('cabilla 1/2'), null);
  assert.strictEqual(detectConstructionTask('tubo de herreria 2x1'), null);
  assert.strictEqual(detectConstructionTask('lamina de zinc'), null);
});

test('detectConstructionTask & estimate: integration with parseItems', () => {
  const { parseItems } = require('../lib/serrucho-search.js');
  const task = detectConstructionTask('que necesito para vaciar un piso de 20 metros cuadrados');
  assert.strictEqual(task?.match, true);
  const estimate = estimateConstructionMaterials(task.tarea, task.cantidad);
  const parsedQuoteItems = parseItems(estimate.items_presupuesto);
  assert.strictEqual(parsedQuoteItems.length, 4);
  assert.deepStrictEqual(parsedQuoteItems, [
    { nombre: 'cemento gris', cantidad: 16 },
    { nombre: 'arena lavada', cantidad: 1 },
    { nombre: 'piedra picada', cantidad: 1.5 },
    { nombre: 'malla truckson', cantidad: 20 }
  ]);
});

test('estimateConstructionMaterials: invalid quantity handling', () => {
  assert.strictEqual(estimateConstructionMaterials('pegar_bloques', 0).cantidad, 0);
  assert.strictEqual(estimateConstructionMaterials('pegar_bloques', -5).cantidad, 0);
  assert.strictEqual(estimateConstructionMaterials('pegar_bloques', NaN).cantidad, 0);
  assert.strictEqual(estimateConstructionMaterials('unknown_task', 10).materiales.length, 0);
});

