'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getInstallationKit,
  detectInstallationQuery,
  findComplementaryKit,
  INSTALLATION_KITS
} = require('../lib/installation-kits');
const { parseItems } = require('../lib/serrucho-search');

test('Installation Kits: definitions for all 5 core trade categories', () => {
  const categories = ['sanitario_poceta', 'lavamanos', 'fregadero', 'techo_laminas', 'tuberias_pvc'];

  for (const cat of categories) {
    const kit = getInstallationKit(cat);
    assert.ok(kit, `Kit for ${cat} must exist`);
    assert.strictEqual(kit.categoria, cat);
    assert.ok(kit.nombre && kit.nombre.length > 0);
    assert.ok(Array.isArray(kit.items) && kit.items.length >= 3, `${cat} must have at least 3 items`);
    assert.ok(kit.items_presupuesto && kit.items_presupuesto.length > 0);
    assert.ok(kit.consejo_tecnico && kit.consejo_tecnico.length > 0);
  }
});

test('Installation Kits: toilet installation kit contains mandatory plumbing fixtures', () => {
  const kit = getInstallationKit('sanitario_poceta');
  const names = kit.items.map(i => i.nombre.toLowerCase());

  assert.ok(names.some(n => n.includes('herraje')), 'Must include herraje');
  assert.ok(names.some(n => n.includes('canilla')), 'Must include canilla');
  assert.ok(names.some(n => n.includes('arresto')), 'Must include llave de arresto');
  assert.ok(names.some(n => n.includes('cera') || n.includes('goma')), 'Must include cuello de cera');
  assert.ok(names.some(n => n.includes('tornillo')), 'Must include tornillos de fijacion');
  assert.ok(names.some(n => n.includes('teflon')), 'Must include teflon');
});

test('Installation Kits: sink and washbasin kits have correct accessories', () => {
  const lav = getInstallationKit('lavamanos');
  const lavNames = lav.items.map(i => i.nombre.toLowerCase());
  assert.ok(lavNames.some(n => n.includes('griferia')), 'Lavamanos must have griferia');
  assert.ok(lavNames.some(n => n.includes('sifon')), 'Lavamanos must have sifon');

  const freg = getInstallationKit('fregadero');
  const fregNames = freg.items.map(i => i.nombre.toLowerCase());
  assert.ok(fregNames.some(n => n.includes('contracanasta')), 'Fregadero must have contracanasta');
  assert.ok(fregNames.some(n => n.includes('silicon')), 'Fregadero must have silicon');
});

test('Installation Kits: roofing and PVC pipe kits have correct accessories', () => {
  const techo = getInstallationKit('techo_laminas');
  const techoNames = techo.items.map(i => i.nombre.toLowerCase());
  assert.ok(techoNames.some(n => n.includes('gancho') || n.includes('tornillo')), 'Roofing must have fasteners');

  const pvc = getInstallationKit('tuberias_pvc');
  const pvcNames = pvc.items.map(i => i.nombre.toLowerCase());
  assert.ok(pvcNames.some(n => n.includes('pega')), 'PVC must have solvent cement');
  assert.ok(pvcNames.some(n => n.includes('limpiador')), 'PVC must have cleaner');
});

test('Installation Kits: detectInstallationQuery detects customer questions', () => {
  const q1 = detectInstallationQuery('que necesito para instalar una poceta');
  assert.ok(q1 && q1.match);
  assert.strictEqual(q1.categoria, 'sanitario_poceta');

  const q2 = detectInstallationQuery('materiales para montar un inodoro');
  assert.ok(q2 && q2.match);
  assert.strictEqual(q2.categoria, 'sanitario_poceta');

  const q3 = detectInstallationQuery('kit de instalacion para lavamanos');
  assert.ok(q3 && q3.match);
  assert.strictEqual(q3.categoria, 'lavamanos');

  const q4 = detectInstallationQuery('combo para instalar fregadero');
  assert.ok(q4 && q4.match);
  assert.strictEqual(q4.categoria, 'fregadero');

  const q5 = detectInstallationQuery('que necesito para colocar laminas de techo');
  assert.ok(q5 && q5.match);
  assert.strictEqual(q5.categoria, 'techo_laminas');
});

test('Installation Kits: fail-closed on single accessory queries', () => {
  assert.strictEqual(detectInstallationQuery('canilla para poceta'), null);
  assert.strictEqual(detectInstallationQuery('herraje de inodoro'), null);
  assert.strictEqual(detectInstallationQuery('gancho para techo'), null);
  assert.strictEqual(detectInstallationQuery('sifon de lavamanos'), null);
  assert.strictEqual(detectInstallationQuery('pega para pvc'), null);
});

test('Installation Kits: findComplementaryKit identifies upsell opportunities from primary fixtures', () => {
  const kit1 = findComplementaryKit('Poceta Blanca C/tanque 1Pza');
  assert.ok(kit1);
  assert.strictEqual(kit1.categoria, 'sanitario_poceta');

  const kit2 = findComplementaryKit('Fregadero Acero Inox Sencillo C/escurr');
  assert.ok(kit2);
  assert.strictEqual(kit2.categoria, 'fregadero');

  const kit3 = findComplementaryKit('Lavamanos Blanco de Pedestal');
  assert.ok(kit3);
  assert.strictEqual(kit3.categoria, 'lavamanos');

  const kit4 = findComplementaryKit('Lamina DE Zinc 12PIES Cuadrado 0.17MM');
  assert.ok(kit4);
  assert.strictEqual(kit4.categoria, 'techo_laminas');

  // Should return null for non-fixture products
  assert.strictEqual(findComplementaryKit('Cemento Gris 42.5KG'), null);
  assert.strictEqual(findComplementaryKit('Tubo Herreria 2X1 1.4MM'), null);
  assert.strictEqual(findComplementaryKit('Disco Corte DE Metal 4-1/2'), null);
});

test('Installation Kits: integration with parseItems() produces valid quote tokens', () => {
  for (const cat of Object.keys(INSTALLATION_KITS)) {
    const kit = INSTALLATION_KITS[cat];
    const parsed = parseItems(kit.items_presupuesto);
    assert.ok(parsed.length >= 3, `Kit ${cat} items_presupuesto must parse into >=3 items`);
    for (const item of parsed) {
      assert.ok(item.nombre && item.nombre.length > 0, 'Parsed item must have valid name');
      assert.ok(item.cantidad > 0, 'Parsed item must have positive quantity');
    }
  }
});
