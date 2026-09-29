'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { jevQuestions, validateJevResponse, classifyShadow } = require('../lib/jev-shadow');
const { resolveDynamicSolutions, resolveProblemSolutions } = require('../lib/serrucho-search');
const { buscarLive } = require('./support/load-live-buscar');

test('Phase 1 - Generalized Action Archetypes in Jev System 1', async t => {
  await t.test('jevQuestions defines action archetypes covering all hardware repairs', () => {
    const q = jevQuestions();
    assert.ok(q.problem_intent, 'problem_intent question must exist in jevQuestions');
    assert.equal(q.problem_intent.type, 'choice');

    const criteria = q.problem_intent.criteria;
    const requiredActions = [
      'pegar_adherir',
      'lubricar_destrabar',
      'destapar_drenar',
      'limpiar_desoxidar',
      'aislar_proteger',
      'goteras_impermeabilizacion',
      'fuga_agua_plomeria',
      'ninguno_o_especifico'
    ];

    for (const action of requiredActions) {
      assert.ok(criteria[action], `criteria must include action archetype "${action}"`);
      assert.ok(criteria[action].length > 10, `criteria for "${action}" must have descriptive instructions`);
    }
  });

  await t.test('validateJevResponse validates new action choices', () => {
    const q = jevQuestions();
    const answer = (crit, choice) => ({
      type: 'choice',
      choice,
      confidence: 0.92,
      probabilities: Object.fromEntries(Object.keys(crit).map(k => [k, k === choice ? 1 : 0]))
    });

    const body = {
      model: 'jev-1.13.0',
      answers: {
        intent: answer(q.intent.criteria, 'product_inquiry'),
        continuation: answer(q.continuation.criteria, 'new'),
        department: answer(q.department.criteria, 'construccion_aridos'),
        problem_intent: answer(q.problem_intent.criteria, 'pegar_adherir')
      },
      usage: { input_tokens: 150, output_tokens: 12 }
    };

    assert.equal(validateJevResponse(body, 'jev-1.13.0'), true);
  });
});

test('Phase 2 - Dynamic Action x Department Solution Resolver', async t => {
  await t.test('resolveDynamicSolutions resolves pegar_adherir x construccion_aridos to pega piso', () => {
    assert.equal(typeof resolveDynamicSolutions, 'function', 'resolveDynamicSolutions must be defined');
    const res = resolveDynamicSolutions('pegar_adherir', 'construccion_aridos');
    assert.ok(res, 'resolver must return target object');
    assert.equal(res.department, 'construccion_aridos');
    assert.ok(res.searchTerms.includes('pega piso') || res.searchTerms.includes('cemento blanco'),
      'must include masonry adhesive search terms');
  });

  await t.test('resolveDynamicSolutions resolves lubricar_destrabar x herramientas to aflojatodo', () => {
    const res = resolveDynamicSolutions('lubricar_destrabar', 'herramientas_discos');
    assert.ok(res, 'resolver must return target object');
    assert.ok(res.searchTerms.includes('aflojatodo') || res.searchTerms.includes('grasa'),
      'must include lubricant search terms');
  });

  await t.test('resolveDynamicSolutions accepts custom dynamic terms array', () => {
    const res = resolveDynamicSolutions(null, 'construccion_aridos', ['pega piso gris', 'cemento blanco']);
    assert.ok(res, 'must resolve custom dynamic terms');
    assert.deepEqual(res.searchTerms, ['pega piso gris', 'cemento blanco']);
  });

  await t.test('fail-closed: ninguno_o_especifico or empty terms returns null', () => {
    assert.equal(resolveDynamicSolutions('ninguno_o_especifico', 'construccion_aridos'), null);
    assert.equal(resolveDynamicSolutions(null, 'construccion_aridos', []), null);
    assert.equal(resolveDynamicSolutions(null, null, null), null);
  });
});

test('Phase 3 - Live Search Dynamic Problem Expansion', async t => {
  await t.test('loose tile problem inquiry resolves dynamically to pega piso without hardcoded tile enum', async () => {
    const query = {
      p_busqueda: 'se me despego una baldosa del piso',
      problem_intent: 'pegar_adherir',
      problem_intent_confidence: 0.91,
      department: 'construccion_aridos',
      department_confidence: 0.90
    };

    const { result } = await buscarLive(query);
    assert.equal(result.encontrados > 0, true, 'must find solution products for loose tile');
    const titles = result.productos.map(p => p.nombre.toLowerCase());
    const hasPegaPiso = titles.some(t => t.includes('pega piso') || t.includes('cemento blanco'));
    assert.ok(hasPegaPiso, `expected pega piso or cemento blanco in results, got: ${titles.join(', ')}`);
  });

  await t.test('squeaky door inquiry resolves dynamically to aflojatodo/lubricant', async () => {
    const query = {
      p_busqueda: 'la puerta rechina mucho que le echo',
      problem_intent: 'lubricar_destrabar',
      problem_intent_confidence: 0.92,
      department: 'herramientas_discos',
      department_confidence: 0.90
    };

    const { result } = await buscarLive(query);
    assert.equal(result.encontrados > 0, true, 'must find lubricant solutions for squeaky door');
    const titles = result.productos.map(p => p.nombre.toLowerCase());
    const hasLubricant = titles.some(t => t.includes('aflojatodo') || t.includes('grasa') || t.includes('aceite'));
    assert.ok(hasLubricant, `expected lubricant in results, got: ${titles.join(', ')}`);
  });

  await t.test('direct product inquiry preserves standard search without side effects (fail-closed)', async () => {
    const query = {
      p_busqueda: 'saco de cemento gris',
      problem_intent: 'ninguno_o_especifico',
      problem_intent_confidence: 0.95,
      department: 'construccion_aridos',
      department_confidence: 0.95
    };

    const { result } = await buscarLive(query);
    assert.equal(result.encontrados > 0, true, 'must find cemento gris');
    assert.ok(result.productos[0].nombre.toLowerCase().includes('cemento gris'),
      'top result must be cemento gris, not adhesives');
  });
});
