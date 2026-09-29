const test = require('node:test');
const assert = require('node:assert/strict');
const { jevQuestions, validateJevResponse } = require('../lib/jev-shadow');

test('Phase 1 - Jev Decision Schema includes department and material slot questions', async (t) => {
  await t.test('jevQuestions defines department and material questions', () => {
    const q = jevQuestions();
    assert.ok(q.department, 'jevQuestions should define department question');
    assert.equal(q.department.type, 'choice');
    assert.ok(q.department.criteria);
    assert.ok(q.department.criteria.techos_laminas, 'Should include techos_laminas');
    assert.ok(q.department.criteria.electricidad_cables, 'Should include electricidad_cables');
    assert.ok(q.department.criteria.hierro_perfiles, 'Should include hierro_perfiles');
    assert.ok(q.department.criteria.plomeria_griferia, 'Should include plomeria_griferia');
    assert.ok(q.department.criteria.herramientas_discos, 'Should include herramientas_discos');
    assert.ok(q.department.criteria.pinturas, 'Should include pinturas');

    assert.ok(q.material, 'jevQuestions should define material question');
    assert.equal(q.material.type, 'choice');
    assert.ok(q.material.criteria.madera, 'Should include madera');
    assert.ok(q.material.criteria.metal, 'Should include metal');
    assert.ok(q.material.criteria.concreto, 'Should include concreto');
    assert.ok(q.material.criteria.general_o_no_aplica, 'Should include general_o_no_aplica');
  });

  await t.test('validateJevResponse validates department and material choices', () => {
    const q = jevQuestions();
    const model = 'typesafe/systemone-v1';
    const makeAnswer = (name, choice) => {
      const labels = Object.keys(q[name].criteria);
      const probabilities = Object.fromEntries(labels.map(l => [l, l === choice ? 1 : 0]));
      return { type: 'choice', choice, confidence: 0.95, probabilities };
    };

    const validBody = {
      model,
      answers: {
        intent: makeAnswer('intent', 'product_inquiry'),
        continuation: makeAnswer('continuation', 'new'),
        department: makeAnswer('department', 'techos_laminas'),
        material: makeAnswer('material', 'metal')
      },
      usage: { input_tokens: 10, output_tokens: 10 }
    };

    assert.equal(validateJevResponse(validBody, model), true);
  });

  await t.test('validateJevResponse rejects invalid department and material choices', () => {
    const q = jevQuestions();
    const model = 'typesafe/systemone-v1';
    const makeAnswer = (name, choice) => {
      const labels = Object.keys(q[name].criteria);
      const probabilities = Object.fromEntries(labels.map(l => [l, l === choice ? 1 : 0]));
      return { type: 'choice', choice, confidence: 0.95, probabilities };
    };

    const invalidDept = {
      model,
      answers: {
        intent: makeAnswer('intent', 'product_inquiry'),
        continuation: makeAnswer('continuation', 'new'),
        department: { type: 'choice', choice: 'non_existent_dept', confidence: 0.95, probabilities: { non_existent_dept: 1 } },
        material: makeAnswer('material', 'metal')
      },
      usage: { input_tokens: 10, output_tokens: 10 }
    };
    assert.equal(validateJevResponse(invalidDept, model), false);

    const invalidMaterial = {
      model,
      answers: {
        intent: makeAnswer('intent', 'product_inquiry'),
        continuation: makeAnswer('continuation', 'new'),
        department: makeAnswer('department', 'techos_laminas'),
        material: { type: 'choice', choice: 'oro_puro', confidence: 0.95, probabilities: { oro_puro: 1 } }
      },
      usage: { input_tokens: 10, output_tokens: 10 }
    };
    assert.equal(validateJevResponse(invalidMaterial, model), false);
  });

  await t.test('classifyShadow captures department and material in result envelope', async () => {
    const { classifyShadow } = require('../lib/jev-shadow');
    const env = { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'test-key' };
    const q = jevQuestions();
    const makeAnswer = (name, choice) => {
      const labels = Object.keys(q[name].criteria);
      const probabilities = Object.fromEntries(labels.map(l => [l, l === choice ? 1 : 0]));
      return { type: 'choice', choice, confidence: 0.92, probabilities };
    };

    const transport = async () => ({
      status: 200,
      body: {
        model: 'jev-1.13.0',
        answers: {
          intent: makeAnswer('intent', 'product_inquiry'),
          continuation: makeAnswer('continuation', 'new'),
          department: makeAnswer('department', 'techos_laminas'),
          material: makeAnswer('material', 'metal')
        },
        usage: { input_tokens: 50, output_tokens: 12 }
      }
    });

    const result = await classifyShadow({ message: 'sinz de 6 metros', env, transport });
    assert.equal(result.status, 'ok');
    assert.equal(result.department, 'techos_laminas');
    assert.equal(result.department_confidence, 0.92);
    assert.equal(result.material, 'metal');
    assert.equal(result.material_confidence, 0.92);
  });
});

test('Phase 2 - Category Alignment Scoring & False-Positive Suppression', async (t) => {
  const L = require('../lib/serrucho-search');

  await t.test('detectProductDepartment accurately identifies macro-departments', () => {
    assert.equal(L.detectProductDepartment('Lamina Techo Galv 6MTS 0.30MM Canal Cuadrado'), 'techos_laminas');
    assert.equal(L.detectProductDepartment('Malla Electrosoldada 6X6 100MTS'), 'hierro_perfiles');
    assert.equal(L.detectProductDepartment('Cable Electrico Thwn AWG N°12 100% Cobre'), 'electricidad_cables');
    assert.equal(L.detectProductDepartment('Disco Corte P/metal 14X1/8'), 'herramientas_discos');
  });

  await t.test('scoreMatch with category alignment boosts matching department and penalizes conflicting department', () => {
    const qTokens = ['lamina', 'zinc', '6', 'metros'];
    const alignment = { department: 'techos_laminas', department_confidence: 0.94 };

    const scoreLamina = L.scoreMatch('Lamina Techo Galv 6MTS 0.30MM Canal Cuadrado', qTokens, alignment);
    const scoreMalla = L.scoreMatch('Malla Electrosoldada 6X6 100MTS', qTokens, alignment);

    assert.ok(scoreLamina > scoreMalla, `Lamina (${scoreLamina}) should rank significantly higher than Malla (${scoreMalla})`);
    assert.ok(scoreLamina - scoreMalla > 50, `Alignment gap should exceed 50 points (got ${scoreLamina - scoreMalla})`);
  });

  await t.test('scoreMatch with material alignment penalizes conflicting material', () => {
    const qTokens = ['disco', 'corte', 'madera', '14'];
    const alignment = { department: 'herramientas_discos', department_confidence: 0.95, material: 'madera' };

    const scoreMetal = L.scoreMatch('Disco Corte P/metal 14X1/8', qTokens, alignment);
    const scoreMadera = L.scoreMatch('Disco Sierra Circular P/madera 14', qTokens, alignment);

    assert.ok(scoreMadera > scoreMetal, `Wood disc (${scoreMadera}) should rank higher than metal disc (${scoreMetal})`);
    assert.ok(scoreMetal < 0, `Metal disc should receive heavy penalty for wood query (got ${scoreMetal})`);
  });

  await t.test('fail-closed fallback: confidence < 0.80 or unclear does not apply department penalties', () => {
    const qTokens = ['lamina', 'zinc', '6', 'metros'];
    const baselineMalla = L.scoreMatch('Malla Electrosoldada 6X6 100MTS', qTokens);

    const lowConfScore = L.scoreMatch('Malla Electrosoldada 6X6 100MTS', qTokens, {
      department: 'techos_laminas',
      department_confidence: 0.75
    });
    assert.equal(lowConfScore, baselineMalla, 'Low confidence should not apply penalties (fail-closed)');

    const unclearScore = L.scoreMatch('Malla Electrosoldada 6X6 100MTS', qTokens, {
      department: 'unclear',
      department_confidence: 0.95
    });
    assert.equal(unclearScore, baselineMalla, 'Unclear department should not apply penalties');

    const nullScore = L.scoreMatch('Malla Electrosoldada 6X6 100MTS', qTokens, null);
    assert.equal(nullScore, baselineMalla, 'Null context should match baseline exactly');
  });
});


