'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { jevQuestions } = require('../lib/jev-shadow');
const wf = require('../n8n_workflow.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
test('shadow node preserves all original fields, route and outputs across disabled/error/success outcomes', async () => {
  const node = wf.nodes.find(n => n.name === 'Jev Shadow Decision');
  assert.ok(node);
  assert.equal(wf.connections['Prepare Conversation Context'].main[0][0].node, node.name);
  assert.equal(wf.connections[node.name].main[0][0].node, 'Needs Product Clarification?');
  const run = new AsyncFunction('$input', '$', '$env', 'require', 'AbortController', node.parameters.jsCode);
  const input = { output: 'untouched', cliente_nombre: 'Private Name', conversation_context: {
    action: 'clarify', query: 'y el #8', previous_product: { gauge: '12' }, state: null } };
  const before = JSON.stringify(input);
  const $ = () => ({ first: () => ({ json: { body: { payload: { body: 'y el #8', from: 'private-id' } } } }) });
  for (const mode of ['off', 'shadow']) {
    for (const provider of ['typesafe', 'vercel']) {
    for (const status of [200, 429]) {
      let calls = 0;
      const requireMock = () => ({ CancelToken: { source: () => ({ token: {}, cancel() {} }) }, post: async (url, body, options) => {
        calls++;
        assert.equal(url, provider === 'vercel' ? 'https://ai-gateway.vercel.sh/typesafe/v1/systemone' : 'https://api.typesafe.ai/v1/systemone');
        assert.equal(options.headers.Authorization, provider === 'vercel' ? 'Bearer gateway-fake' : 'Bearer fake');
        assert.equal(options.maxRedirects, 0);
        assert.equal(options.maxContentLength, 16000);
        assert.equal(options.timeout, 1500);
        assert.doesNotMatch(JSON.stringify(body), /Private Name|private-id|untouched/);
        const answers = Object.fromEntries(Object.entries(jevQuestions()).map(([name, q]) => {
          const choice = name === 'intent' ? 'product_inquiry' : (name === 'continuation' ? 'continue' : Object.keys(q.criteria)[0]);
          return [name, { type: 'choice', choice, confidence: 0.9,
            probabilities: Object.fromEntries(Object.keys(q.criteria).map(k => [k, k === choice ? 1 : 0])) }];
        }));
        return { status, data: { model: body.model, answers, usage: { input_tokens: 1, output_tokens: 1 } } };
      } });
      const [item] = await run({ first: () => ({ json: input }) }, $, { JEV_MODE: mode, JEV_PROVIDER: provider, TYPESAFE_API_KEY: 'fake', AI_GATEWAY_API_KEY: 'gateway-fake' }, requireMock);
      const { jev_shadow: metadata, ...rest } = item.json;
      assert.deepEqual(rest, input);
      assert.equal(JSON.stringify(input), before);
      assert.equal(calls, mode === 'off' ? 0 : 1);
      assert.equal(metadata.status, mode === 'off' ? 'disabled' : status === 200 ? 'ok' : 'http_error');
    }
    }
  }
});
test('sanitizer removes shadow metadata before downstream delivery', async () => {
  const code = fs.readFileSync('scratch_live/live_sanitize.js', 'utf8');
  const run = new AsyncFunction('items', '$', '$env', 'require', code);
  const $ = name => ({ first: () => ({ json: name === 'Prepare Conversation Context'
    ? { conversation_context: { action: 'pass' } } : { body: { payload: {} } } }) });
  const [item] = await run([{ json: { output: 'Hola', intermediateSteps: [], jev_shadow: { intent: 'general' } } }], $, {}, () => ({}));
  assert.equal(item.json.output, 'Hola');
  assert.equal(item.json.jev_shadow, undefined);
});

test('shadow deadline aborts axios with frozen Promise prototypes and no AbortController', async () => {
  const code = fs.readFileSync('scratch_live/live_jev_shadow.js', 'utf8');
  const run = new AsyncFunction('$input', '$', '$env', 'require', 'AbortController', code);
  const original = { output: 'unchanged' };
  let attempted = 0;
  let aborted = 0;
  const axios = {
    CancelToken: { source() { throw new TypeError("Cannot assign to read only property 'then'"); } },
    post: (url, body, options) => new Promise((resolve, reject) => {
      attempted++;
      assert.equal(options.cancelToken, undefined);
      assert.equal(options.signal.aborted, false);
      const onAbort = () => {
        aborted++;
        assert.equal(options.signal.aborted, true);
        options.signal.removeEventListener('abort', onAbort);
        reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' }));
      };
      options.signal.addEventListener('abort', onAbort);
    }),
  };
  const [item] = await run({ first: () => ({ json: original }) }, () => ({ first: () => ({ json: {} }) }),
    { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'fake', JEV_TIMEOUT_MS: '10' }, () => axios, undefined);
  assert.equal(attempted, 1);
  assert.equal(aborted, 1);
  assert.equal(item.json.jev_shadow.status, 'timeout');
  assert.equal(item.json.output, original.output);
});
