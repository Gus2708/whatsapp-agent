'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateCorpus, evaluateCorpus, fetchTransport } = require('../lib/jev-evaluation');
const corpus = require('./fixtures/jev-synthetic.json');
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
