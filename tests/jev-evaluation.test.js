'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCorpus, evaluateCorpus, fetchTransport } = require('../lib/jev-evaluation');
const corpus = require('./fixtures/jev-synthetic.json');
const slotCorpus = require('./fixtures/jev-slots-synthetic.json');
test('offline validates all synthetic labels and rules without inventing provider accuracy', async () => {
  const result = await evaluateCorpus(corpus);
  assert.equal(result.mode, 'offline');
  assert.ok(result.total >= 10);
  assert.equal(result.intent_accuracy, null);
  assert.equal(result.provider_calls, 0);
  assert.equal(result.rows[0].jev, null);
  assert.throws(() => validateCorpus([{ id: 'bad', message: 'hola', expected: { intent: 'invented' } }]));
});
test('evaluation uses ground truth independently and keeps unknown baseline comparisons null', async () => {
  const result = await evaluateCorpus(corpus.slice(0, 2), async row => ({ status: 'ok', intent: row.expected.intent,
    continuation: row.expected.continuation, request_attempted: true, elapsed_ms: 15, input_tokens: 100, output_tokens: 2, estimated_cost_usd: null }));
  assert.equal(result.intent_accuracy, 1);
  assert.equal(result.continuation_accuracy, 1);
  assert.equal(result.provider_calls, 2);
  assert.equal(result.input_tokens, 200);
  assert.equal(result.latency_p95_ms, 15);
  assert.equal(result.rows[0].rule_intent_agreement, null);
  assert.doesNotMatch(JSON.stringify(result), /"message"|"previous"/);
});
test('fetch adapter forbids redirects and stops oversized response streaming', async () => {
  let canceled = false;
  const fake = async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.equal(options.method, 'POST');
    return { status: 200, body: { getReader: () => ({ read: async () => ({ value: new Uint8Array(16001), done: false }),
      cancel: async () => { canceled = true; } }) } };
  };
  await assert.rejects(() => fetchTransport({ url: 'https://api.typesafe.ai/v1/systemone', body: {}, headers: {} }, fake));
  assert.equal(canceled, true);
});
test('slot corpus is fixed, synthetic and covers distinct departments, materials and problems', async () => {
  validateCorpus(slotCorpus);
  assert.ok(slotCorpus.length <= 30);
  const result = await evaluateCorpus(slotCorpus);
  assert.equal(result.corpus, 'jev-slots-synthetic-v1');
  assert.equal(result.provider_calls, 0);
  assert.equal(result.slot_metrics.department.labeled, slotCorpus.filter(row => row.expected.department).length);
  assert.equal(result.slot_metrics.department.answered, 0);
  assert.equal(result.slot_metrics.department.accuracy, null);
  assert.ok(new Set(slotCorpus.map(row => row.expected.department)).size >= 5);
  assert.ok(new Set(slotCorpus.map(row => row.expected.material)).size >= 4);
  assert.ok(new Set(slotCorpus.map(row => row.expected.problem_intent)).size >= 5);
});

test('new Jev slots report coverage, accuracy and confident errors only for labeled answers', async () => {
  const rows = [{ id: 'roof-leak', message: 'tengo goteras en el techo', expected: {
    intent: 'product_inquiry', continuation: 'new', department: 'techos_laminas',
    material: 'general_o_no_aplica', problem_intent: 'goteras_impermeabilizacion' } },
  { id: 'metal-bit', message: 'broca para hierro', expected: {
    intent: 'product_inquiry', continuation: 'new', department: 'herramientas_discos',
    material: 'metal', problem_intent: 'ninguno_o_especifico' } }];
  const report = await evaluateCorpus(rows, async row => ({ status: 'ok', request_attempted: true,
    intent: 'product_inquiry', continuation: 'new', department: row.id === 'roof-leak' ? 'techos_laminas' : 'pinturas',
    department_confidence: 0.95, material: row.id === 'roof-leak' ? null : 'metal', material_confidence: 0.9,
    problem_intent: row.expected.problem_intent, problem_intent_confidence: 0.5 }));
  assert.equal(report.slot_metrics.department.labeled, 2);
  assert.equal(report.slot_metrics.department.answered, 2);
  assert.equal(report.slot_metrics.department.accuracy, 0.5);
  assert.equal(report.slot_metrics.department.confident_errors, 1);
  assert.equal(report.slot_metrics.material.answered, 1);
  assert.equal(report.slot_metrics.material.accuracy, 1);
  assert.equal(report.slot_metrics.problem_intent.confident_answered, 0);
  assert.equal(report.slot_metrics.problem_intent.accuracy, 1);
  assert.throws(() => validateCorpus([{ id: 'bad-slot', message: 'techo', expected: {
    intent: 'product_inquiry', continuation: 'new', department: 'invented' } }]));
});
