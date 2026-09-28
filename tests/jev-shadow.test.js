'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyShadow, redactMessage, productAttributes, jevQuestions } = require('../lib/jev-shadow');
const env = { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'synthetic-test-key' };
function response(overrides = {}) {
  const answer = (criteria, choice) => ({ type: 'choice', choice, confidence: 0.91,
    probabilities: Object.fromEntries(Object.keys(criteria).map(k => [k, k === choice ? 1 : 0])) });
  const q = jevQuestions();
  return { model: 'jev-1.13.0', answers: { intent: answer(q.intent.criteria, 'product_inquiry'),
    continuation: answer(q.continuation.criteria, 'continue') }, usage: { input_tokens: 120, output_tokens: 8 }, ...overrides };
}
const ok = async () => ({ status: 200, body: response() });
test('Vercel selects only its fixed endpoint, credential and exact model', async () => {
  const config = { ...env, JEV_PROVIDER: 'vercel', AI_GATEWAY_API_KEY: 'gateway-test-key' };
  const result = await classifyShadow({ env: config, transport: async request => {
    assert.equal(request.url, 'https://ai-gateway.vercel.sh/typesafe/v1/systemone');
    assert.equal(request.headers.Authorization, 'Bearer gateway-test-key');
    assert.equal(request.body.model, 'typesafe-ai/jev');
    return { status: 200, body: response({ model: 'typesafe-ai/jev' }) };
  } });
  assert.equal(result.status, 'ok');
  assert.equal(result.provider, 'vercel');
  assert.equal((await classifyShadow({ env: config, transport: ok })).status, 'invalid_response');
});
test('provider/key/model mismatches fail closed without transport', async () => {
  for (const [config, expected] of [
    [{ ...env, JEV_PROVIDER: 'vercel' }, 'missing_key'],
    [{ ...env, JEV_PROVIDER: 'other' }, 'invalid_config'],
    [{ ...env, JEV_PROVIDER: 'vercel', JEV_MODEL: 'jev-1.13.0' }, 'invalid_config'],
    [{ ...env, JEV_MODEL: 'typesafe-ai/jev' }, 'invalid_config'],
  ]) {
    const result = await classifyShadow({ env: config, transport: () => assert.fail('unexpected request') });
    assert.equal(result.status, expected);
    assert.equal(result.request_attempted, false);
  }
});
test('off, bad configuration and absent key perform zero requests', async () => {
  const transport = () => { throw Error('must not execute'); };
  for (const [config, status] of [[{}, 'disabled'], [{ JEV_MODE: 'active' }, 'invalid_config'],
    [{ JEV_MODE: 'shadow' }, 'missing_key'], [{ ...env, JEV_TIMEOUT_MS: '-2' }, 'invalid_config']]) {
    assert.equal((await classifyShadow({ env: config, transport })).status, status);
  }
});
test('request has official typed questions and only bounded sanitized product/message state', async () => {
  const input = { message: 'Soy Ana, ana@example.com +58 412 1234567. Quiero cable #12 azul por rollo',
    previous: { variant: 'thwn', gauge: '12', color: 'azul', presentation: 'metro', session: 'private', notes: 'secret' } };
  const before = JSON.stringify(input);
  const result = await classifyShadow({ ...input, env, transport: async request => {
    assert.equal(request.url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(request.headers.Authorization, 'Bearer synthetic-test-key');
    assert.equal(request.body.model, 'jev-1.13.0');
    assert.deepEqual(Object.keys(request.body.state).sort(), ['message', 'previous_product']);
    assert.doesNotMatch(JSON.stringify(request.body), /Ana|example|1234567|private|secret/);
    assert.equal(request.body.questions.intent.type, 'choice');
    assert.equal(request.redirect, 'error');
    assert.ok(request.signal);
    return ok();
  } });
  assert.equal(result.status, 'ok');
  assert.equal(result.intent, 'product_inquiry');
  assert.equal(result.intent_confidence, 0.91);
  assert.equal(result.intent_probability, 1);
  assert.equal(result.input_tokens, 120);
  assert.equal(result.estimated_cost_usd, null);
  assert.equal(JSON.stringify(input), before);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-test-key|Ana|message|probabilities/);
});
test('best-effort redaction strips explicit names, contacts, credentials and prices, retaining colloquial text', () => {
  const safe = redactMessage('Me llamo Maria Perez CI 12345678 $123.45 cable #8 https://secret.test token=ABC123');
  assert.match(safe, /cable #8/);
  assert.doesNotMatch(safe, /maria|perez|12345678|123\.45|secret|abc123/i);
  assert.equal(redactMessage('epa pana tienes unos tornillitos'), 'epa pana tienes unos tornillitos');
  assert.ok(redactMessage('cable '.repeat(1000)).length <= 500);
  assert.deepEqual(productAttributes({ variant: 'thwn', gauge: '123456789', color: 'Ana', session: 'secret' }), { variant: 'thwn' });
});
test('non-2xx and transport errors are bounded metadata with one attempt', async () => {
  for (const status of [302, 401, 429, 500, 529]) {
    let calls = 0;
    const result = await classifyShadow({ env, transport: async () => { calls++; return { status, body: 'SECRET_ERROR' }; } });
    assert.equal(calls, 1);
    assert.equal(result.status, 'http_error');
    assert.equal(result.http_status, status);
    assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  }
  assert.equal((await classifyShadow({ env, transport: async () => { throw Error('private'); } })).status, 'transport_error');
  assert.equal((await classifyShadow({ env })).status, 'transport_unavailable');
});
test('timeout cancels even a transport which never settles', async () => {
  let signal;
  const result = await classifyShadow({ env: { ...env, JEV_TIMEOUT_MS: '20' }, transport: request => {
    signal = request.signal;
    return new Promise(() => {});
  } });
  assert.equal(result.status, 'timeout');
  assert.equal(signal.aborted, true);
});
test('schema rejects invalid closed domains, distributions, confidence, usage and response size', async () => {
  const mutations = [r => { r.answers.intent.choice = 'invented'; },
    r => { r.answers.intent.confidence = 1.5; }, r => { r.answers.intent.confidence = NaN; },
    r => { r.answers.intent.probabilities.product_inquiry = 0.1; },
    r => { r.answers.intent.probabilities.extra = 0; },
    r => { r.answers.intent.probabilities.product_inquiry = 0.2; r.answers.intent.probabilities.quote = 0.8; },
    r => { delete r.answers.continuation; }, r => { r.usage.input_tokens = -1; },
    r => { r.model = 'other'; }, r => { r.extra = 'x'.repeat(17000); }];
  for (const mutate of mutations) {
    const data = response(); mutate(data);
    assert.equal((await classifyShadow({ env, transport: async () => ({ status: 200, body: data }) })).status, 'invalid_response');
  }
});
test('low confidence stays observational and cost requires an explicit rate', async () => {
  const data = response(); data.answers.intent.confidence = 0.2;
  const result = await classifyShadow({ env: { ...env, JEV_INPUT_USD_PER_MILLION: '0.042' },
    transport: async () => ({ status: 200, body: data }) });
  assert.equal(result.status, 'low_confidence');
  assert.equal(result.intent_probability, 1);
  assert.equal(result.estimated_cost_usd, 120 * 0.042 / 1000000);
  assert.equal(result.action, undefined);
});
