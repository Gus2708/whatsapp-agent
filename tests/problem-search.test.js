'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { jevQuestions, validateJevResponse, classifyShadow } = require('../lib/jev-shadow');
const { resolveProblemSolutions } = require('../lib/serrucho-search');

test('Phase 1 - Problem Intent Schema in Jev System 1', async (t) => {
  await t.test('jevQuestions defines problem_intent question with 7 calibrated choices', () => {
    const q = jevQuestions();
    assert.ok(q.problem_intent, 'jevQuestions should define problem_intent');
    assert.ok(q.problem_intent.instructions);
    const expectedChoices = [
      'goteras_impermeabilizacion',
      'fuga_agua_plomeria',
      'sellado_grietas_ventanas',
      'oxido_corrosion',
      'fijacion_sin_taladrar',
      'preparacion_pared',
      'ninguno_o_especifico'
    ];
    for (const choice of expectedChoices) {
      assert.ok(q.problem_intent.criteria[choice], `problem_intent should define criteria for ${choice}`);
    }
  });

  await t.test('validateJevResponse validates problem_intent choice', () => {
    const q = jevQuestions();
    const answer = (criteria, choice) => ({
      type: 'choice', choice, confidence: 0.95,
      probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0]))
    });
    const valid = {
      model: 'jev-1.13.0',
      answers: {
        intent: answer(q.intent.criteria, 'product_inquiry'),
        continuation: answer(q.continuation.criteria, 'continue'),
        department: answer(q.department.criteria, 'techos_laminas'),
        material: answer(q.material.criteria, 'general_o_no_aplica'),
        problem_intent: answer(q.problem_intent.criteria, 'goteras_impermeabilizacion')
      },
      usage: { input_tokens: 10, output_tokens: 5 }
    };
    assert.equal(validateJevResponse(valid, 'jev-1.13.0'), true);
  });

  await t.test('classifyShadow captures problem_intent in result envelope', async () => {
    const q = jevQuestions();
    const answer = (criteria, choice) => ({
      type: 'choice', choice, confidence: 0.95,
      probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0]))
    });
    const mockTransport = async () => ({
      status: 200,
      body: {
        model: 'jev-1.13.0',
        answers: {
          intent: answer(q.intent.criteria, 'product_inquiry'),
          continuation: answer(q.continuation.criteria, 'continue'),
          department: answer(q.department.criteria, 'techos_laminas'),
          material: answer(q.material.criteria, 'general_o_no_aplica'),
          problem_intent: answer(q.problem_intent.criteria, 'goteras_impermeabilizacion')
        },
        usage: { input_tokens: 10, output_tokens: 5 }
      }
    });
    const res = await classifyShadow({
      message: 'algo para tapar gotera',
      env: { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'test-key' },
      transport: mockTransport
    });
    assert.equal(res.status, 'ok');
    assert.equal(res.problem_intent, 'goteras_impermeabilizacion');
    assert.equal(res.problem_intent_confidence, 0.95);
  });
});

test('Phase 2 - Deterministic Problem Solution Resolver', async (t) => {
  await t.test('resolveProblemSolutions maps leak repair to cemento plastico and manto', () => {
    assert.equal(typeof resolveProblemSolutions, 'function', 'resolveProblemSolutions must be a function');
    const res = resolveProblemSolutions('goteras_impermeabilizacion');
    assert.ok(res);
    assert.equal(res.department, 'techos_laminas');
    assert.ok(res.searchTerms.includes('cemento plastico'));
    assert.ok(res.searchTerms.includes('manto asfaltico'));
  });

  await t.test('resolveProblemSolutions returns null for ninguno_o_especifico (fail-closed)', () => {
    const res = resolveProblemSolutions('ninguno_o_especifico');
    assert.equal(res, null, 'Direct product inquiries must not be expanded');
  });

  await t.test('resolveProblemSolutions maps plumbing leaks to pega pvc and teflon', () => {
    const res = resolveProblemSolutions('fuga_agua_plomeria');
    assert.ok(res);
    assert.equal(res.department, 'plomeria_griferia');
    assert.ok(res.searchTerms.includes('pega pvc'));
  });

  await t.test('live search resolves leak repair problem intent into cemento plastico', async () => {
    const { buscarLive } = require('./support/load-live-buscar');
    const { result } = await buscarLive({
      p_busqueda: 'algo para tapar una gotera',
      problem_intent: 'goteras_impermeabilizacion',
      problem_intent_confidence: 0.95,
      department: 'techos_laminas',
      department_confidence: 0.90
    });
    assert.ok(result.encontrados > 0, 'Debe encontrar soluciones para goteras');
    assert.ok(result.productos.some(p => /cemento plastico|manto/i.test(p.nombre)), 'Debe retornar cemento plastico o manto');
  });

  await t.test('live search resolves plumbing leak problem intent into pega pvc', async () => {
    const { buscarLive } = require('./support/load-live-buscar');
    const { result } = await buscarLive({
      p_busqueda: 'para pegar tubo que bota agua',
      problem_intent: 'fuga_agua_plomeria',
      problem_intent_confidence: 0.95,
      department: 'plomeria_griferia',
      department_confidence: 0.90
    });
    assert.ok(result.encontrados > 0, 'Debe encontrar soluciones para fuga de agua');
    assert.ok(result.productos.some(p => /pega|teflon/i.test(p.nombre)), 'Debe retornar pega pvc o teflon');
  });

  await t.test('fail-closed: direct query or low confidence does not expand problem solutions', async () => {
    const { buscarLive } = require('./support/load-live-buscar');
    const { result } = await buscarLive({
      p_busqueda: 'lamina de zinc',
      problem_intent: 'goteras_impermeabilizacion',
      problem_intent_confidence: 0.70 // Below threshold
    });
    assert.ok(result.encontrados > 0);
    assert.ok(result.productos.every(p => /lamina/i.test(p.nombre)), 'Debe retornar solo laminas');
  });
});
