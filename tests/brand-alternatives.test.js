'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveConversation } = require('../lib/conversation-context');

test('1.1.b RED: brand rejection "otra marca" preserves base query and accumulates excluded_brands', () => {
  const session = 'test-session';
  const now = Date.now();
  
  // Previous turn where user searched for a water pump and was offered Griven
  const previous = {
    version: 1,
    session,
    confirmed: false,
    expires_at: now + 30 * 60000,
    base_query: 'bomba de agua 1/2 hp',
    last_brand: 'griven',
    excluded_brands: []
  };

  const result = resolveConversation('de otra marca', previous, session, now);
  assert.equal(result.action, 'search');
  assert.equal(result.query, 'bomba de agua 1/2 hp');
  assert.deepEqual(result.state.excluded_brands, ['griven']);
});

test('1.1.d TRIANGULATE: explicit brand request and multiple brand rejections', () => {
  const session = 'test-session';
  const now = Date.now();

  const previous = {
    version: 1,
    session,
    confirmed: false,
    expires_at: now + 30 * 60000,
    base_query: 'bomba de agua 1/2 hp',
    last_brand: 'griven',
    excluded_brands: ['total']
  };

  // Turn: second brand rejection
  const secondRejection = resolveConversation('otra marca', previous, session, now);
  assert.equal(secondRejection.action, 'search');
  assert.equal(secondRejection.query, 'bomba de agua 1/2 hp');
  assert.deepEqual(secondRejection.state.excluded_brands, ['total', 'griven']);

  // Turn: explicit brand request
  const explicit = resolveConversation('en marca pedrollo', previous, session, now);
  assert.equal(explicit.action, 'search');
  assert.equal(explicit.query, 'bomba de agua 1/2 hp pedrollo');
  assert.equal(explicit.state.brand, 'pedrollo');
});

test('2.1.b RED: catalog search filters out excluded brands', async () => {
  const { buscarLive } = require('./support/load-live-buscar');

  // Baseline search without brand exclusion returns Cunete as top result
  const baseline = await buscarLive('pintura blanco');
  assert.ok(baseline.result.productos.length > 0);
  assert.match(baseline.result.productos[0].nombre, /Cunete/i);

  // Search with marcas_excluidas = ['cunete'] must NOT include Cunete
  const filtered = await buscarLive('pintura blanco', { marcas_excluidas: ['cunete'] });
  assert.ok(filtered.result.productos.length > 0);
  for (const prod of filtered.result.productos) {
    assert.doesNotMatch(prod.nombre, /Cunete/i);
  }
});

test('2.1.d TRIANGULATE: search with all candidate brands excluded excludes all of them', async () => {
  const { buscarLive } = require('./support/load-live-buscar');
  // Exclude all specific paint brands present in fixture for blanco
  const filtered = await buscarLive('pintura blanco', { marcas_excluidas: ['cunete', 'sun', 'floripaint'] });
  assert.ok(filtered.result);
  for (const prod of (filtered.result.productos || [])) {
    assert.doesNotMatch(prod.nombre, /cunete|sun|floripaint/i);
  }
});

test('3.1.b RED: fast-path routes explicit human request directly to handoff', () => {
  const session = 'test-session';
  const now = Date.now();

  const humanQueries = [
    'quiero hablar con un humano',
    'comunicame con un asesor por favor',
    'puedo hablar con una persona?',
    'pasame con un empleado'
  ];

  for (const msg of humanQueries) {
    const res = resolveConversation(msg, null, session, now);
    assert.equal(res.action, 'handoff', `Failed for query: "${msg}"`);
  }
});

test('3.1.d TRIANGULATE: multi-turn product -> brand alternative -> human handoff', () => {
  const session = 'test-session';
  let now = Date.now();

  // Turn 1: base query
  const t1 = resolveConversation('cable thwn #12 azul por metro', null, session, now);
  assert.equal(t1.action, 'search');
  assert.equal(t1.state.variant, 'thwn');
  t1.state.base_query = 'cable thwn #12';
  t1.state.last_brand = 'tric';

  // Turn 2: brand alternative
  now += 5000;
  const t2 = resolveConversation('otra marca', t1.state, session, now);
  assert.equal(t2.action, 'search');
  assert.deepEqual(t2.state.excluded_brands, ['tric']);

  // Turn 3: human handoff
  now += 5000;
  const t3 = resolveConversation('comunicame con un asesor', t2.state, session, now);
  assert.equal(t3.action, 'handoff');
  assert.equal(t3.state, null);
});



