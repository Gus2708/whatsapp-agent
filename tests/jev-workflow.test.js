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

test('shadow classification cannot change routing without explicit enablement', async () => {
  const node = wf.nodes.find(n => n.name === 'Jev Shadow Decision');
  const condition = wf.nodes.find(n => n.name === 'Needs Product Clarification?').parameters.conditions.conditions[0].leftValue;
  const selected = new Function('$json', 'return ' + condition.slice(3, -2));
  const run = new AsyncFunction('$input', '$', '$env', 'require', node.parameters.jsCode);
  const lookup = () => ({ first: () => ({ json: { body: { payload: {
    body: 'hasta que hora abren', from: '15551234567@c.us', fromMe: false
  } } } }) });
  const original = { conversation_context: { action: 'pass', query: 'hasta que hora abren' } };
  const answers = Object.fromEntries(Object.entries(jevQuestions()).map(([name, q]) => {
    const choice = name === 'intent' ? 'store_info' : name === 'continuation' ? 'new' : Object.keys(q.criteria)[0];
    return [name, { type: 'choice', choice, confidence: 0.95,
      probabilities: Object.fromEntries(Object.keys(q.criteria).map(key => [key, key === choice ? 1 : 0])) }];
  }));
  const axios = { post: async (url, body) => ({ status: 200, data: { model: body.model, answers,
    usage: { input_tokens: 1, output_tokens: 1 } } }) };
  for (const mode of ['off', 'shadow']) {
    const [item] = await run({ first: () => ({ json: original }) }, lookup,
      { JEV_MODE: mode, TYPESAFE_API_KEY: 'fake' }, () => axios);
    assert.deepEqual(item.json.conversation_context, original.conversation_context);
    assert.equal(selected(item.json), false);
  }
  const [enabled] = await run({ first: () => ({ json: original }) }, lookup,
    { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'fake', JEV_ROUTING_ENABLED: 'true',
      JEV_ROUTING_SCOPE: 'canary', JEV_CANARY_PHONE: '+15551234567' }, () => axios);
  assert.equal(enabled.json.conversation_context.action, 'respond');
  assert.equal(selected(enabled.json), true);
});

test('product and quote classifications stay on the Agent branch in both enabled scopes', async () => {
  const node = wf.nodes.find(n => n.name === 'Jev Shadow Decision');
  const condition = wf.nodes.find(n => n.name === 'Needs Product Clarification?').parameters.conditions.conditions[0].leftValue;
  const selected = new Function('$json', 'return ' + condition.slice(3, -2));
  const run = new AsyncFunction('$input', '$', '$env', 'require', node.parameters.jsCode);
  for (const scope of ['canary', 'all']) {
    for (const [message, intent] of [
      ['presupuesto de 2 sacos de cemento y 4 bombillos', 'quote'],
      ['tienen cemento', 'product_inquiry'],
    ]) {
      const lookup = () => ({ first: () => ({ json: { body: { payload: {
        body: message, from: '15551234567@c.us', fromMe: false
      } } } }) });
      const answers = Object.fromEntries(Object.entries(jevQuestions()).map(([name, q]) => {
        const choice = name === 'intent' ? intent : Object.keys(q.criteria)[0];
        return [name, { type: 'choice', choice, confidence: 0.95,
          probabilities: Object.fromEntries(Object.keys(q.criteria).map(key => [key, key === choice ? 1 : 0])) }];
      }));
      const original = { conversation_context: { action: 'pass', query: message } };
      const [item] = await run({ first: () => ({ json: original }) }, lookup,
        { JEV_MODE: 'shadow', TYPESAFE_API_KEY: 'fake', JEV_ROUTING_ENABLED: 'true',
          JEV_ROUTING_SCOPE: scope, JEV_CANARY_PHONE: '+15551234567' },
        () => ({ post: async (url, body) => ({ status: 200, data: { model: body.model, answers,
          usage: { input_tokens: 1, output_tokens: 1 } } }) }));
      assert.equal(item.json.jev_shadow.intent, intent);
      assert.equal(item.json.conversation_context.action, 'pass', `${scope}: ${intent}`);
      assert.equal(selected(item.json), false, `${scope}: ${intent}`);
    }
  }
  assert.equal(wf.connections['Needs Product Clarification?'].main[1][0].node, 'AI Agent');
  assert.ok(wf.nodes.find(n => n.name === 'hacer_presupuesto_tool'));
});

test('generated Jev node routes only a standalone corroborated greeting', async () => {
  const code = fs.readFileSync('scratch_live/live_jev_shadow.js', 'utf8');
  const run = new AsyncFunction('$input', '$', '$env', 'require', 'AbortController', code);
  const answersFor = intent => Object.fromEntries(Object.entries(jevQuestions()).map(([name, q]) => {
    const choice = name === 'intent' ? intent : name === 'continuation' ? 'new' : Object.keys(q.criteria)[0];
    return [name, { type: 'choice', choice, confidence: 0.97,
      probabilities: Object.fromEntries(Object.keys(q.criteria).map(key => [key, key === choice ? 1 : 0])) }];
  }));
  const env = { JEV_MODE: 'shadow', JEV_ROUTING_ENABLED: 'true',
    JEV_ROUTING_SCOPE: 'canary', JEV_CANARY_PHONE: '+15551234567', TYPESAFE_API_KEY: 'fake' };
  for (const [message, intent, action, expected] of [
    ['Hola', 'general', 'pass', 'respond'],
    ['Hola, tienen cemento', 'general', 'pass', 'pass'],
    ['¿A qué hora abren y tienen cable?', 'store_info', 'pass', 'pass'],
    ['Hola', 'general', 'clarify', 'clarify']
  ]) {
    const original = { pedir_nombre: 'si', conversation_context: { action, query: message } };
    const $ = () => ({ first: () => ({ json: { body: { payload: {
      body: message, from: '15551234567@c.us', fromMe: false
    } } } }) });
    const [item] = await run({ first: () => ({ json: original }) }, $, env,
      () => ({ post: async (_url, body) => ({ status: 200, data: {
        model: body.model, answers: answersFor(intent), usage: { input_tokens: 1, output_tokens: 1 }
      } }) }), undefined);
    assert.equal(item.json.conversation_context.action, expected, message);
    if (expected === 'respond') assert.match(item.json.conversation_context.reply, /Con qui[eé]n tengo el gusto/i);
  }
});

test('canary routing is fail-closed for scope, sender and outbound messages', async () => {
  const code = fs.readFileSync('scratch_live/live_jev_shadow.js', 'utf8');
  const run = new AsyncFunction('$input', '$', '$env', 'require', 'AbortController', code);
  const answers = Object.fromEntries(Object.entries(jevQuestions()).map(([name, question]) => {
    const choice = name === 'intent' ? 'general' : name === 'continuation' ? 'new' : Object.keys(question.criteria)[0];
    return [name, { type: 'choice', choice, confidence: 0.97,
      probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }];
  }));
  const baseEnv = { JEV_MODE: 'shadow', JEV_ROUTING_ENABLED: 'true',
    JEV_ROUTING_SCOPE: 'canary', JEV_CANARY_PHONE: '+15551234567', TYPESAFE_API_KEY: 'fake' };
  const cases = [
    ['matching inbound JID', {}, '15551234567@c.us', false, 'respond'],
    ['routing flag off', { JEV_ROUTING_ENABLED: 'false' }, '15551234567@c.us', false, 'pass'],
    ['mode off', { JEV_MODE: 'off' }, '15551234567@c.us', false, 'pass'],
    ['missing scope', { JEV_ROUTING_SCOPE: undefined }, '15551234567@c.us', false, 'pass'],
    ['unknown scope', { JEV_ROUTING_SCOPE: 'global' }, '15551234567@c.us', false, 'pass'],
    ['missing phone', { JEV_CANARY_PHONE: undefined }, '15551234567@c.us', false, 'pass'],
    ['malformed phone', { JEV_CANARY_PHONE: '1555-123-4567' }, '15551234567@c.us', false, 'pass'],
    ['another sender', {}, '15557654321@c.us', false, 'pass'],
    ['outbound', {}, '15551234567@c.us', true, 'pass'],
    ['unknown direction', {}, '15551234567@c.us', undefined, 'pass'],
    ['group sender', {}, '15551234567@g.us', false, 'pass'],
    ['LID sender', {}, '15551234567@lid', false, 'pass'],
    ['malformed sender', {}, '15551234567@c.us/other', false, 'pass'],
    ['missing sender', {}, undefined, false, 'pass'],
  ];
  for (const [label, overrides, from, fromMe, expected] of cases) {
    const env = { ...baseEnv, ...overrides };
    const original = { conversation_context: { action: 'pass', query: 'Hola' } };
    const $ = () => ({ first: () => ({ json: { body: { payload: { body: 'Hola', from, fromMe } } } }) });
    const [item] = await run({ first: () => ({ json: original }) }, $, env,
      () => ({ post: async (_url, body) => ({ status: 200, data: { model: body.model, answers,
        usage: { input_tokens: 1, output_tokens: 1 } } }) }), undefined);
    assert.equal(item.json.conversation_context.action, expected, label);
    assert.equal(item.json.jev_shadow.status, env.JEV_MODE === 'off' ? 'disabled' : 'ok', label);
  }
});

test('all scope routes only valid inbound private senders while preserving canary isolation', async () => {
  const code = wf.nodes.find(n => n.name === 'Jev Shadow Decision').parameters.jsCode;
  const run = new AsyncFunction('$input', '$', '$env', 'require', 'AbortController', code);
  const answers = Object.fromEntries(Object.entries(jevQuestions()).map(([name, question]) => {
    const choice = name === 'intent' ? 'general' : name === 'continuation' ? 'new' : Object.keys(question.criteria)[0];
    return [name, { type: 'choice', choice, confidence: 0.97,
      probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }];
  }));
  const baseEnv = { JEV_MODE: 'shadow', JEV_ROUTING_ENABLED: 'true',
    JEV_ROUTING_SCOPE: 'all', JEV_CANARY_PHONE: undefined, TYPESAFE_API_KEY: 'fake' };
  const cases = [
    ['valid private sender without canary phone', {}, '15557654321@c.us', false, 'respond'],
    ['routing switch off', { JEV_ROUTING_ENABLED: 'false' }, '15557654321@c.us', false, 'pass'],
    ['mode off', { JEV_MODE: 'off' }, '15557654321@c.us', false, 'pass'],
    ['canary scope with another sender', { JEV_ROUTING_SCOPE: 'canary', JEV_CANARY_PHONE: '+15551234567' }, '15557654321@c.us', false, 'pass'],
    ['off scope', { JEV_ROUTING_SCOPE: 'off' }, '15557654321@c.us', false, 'pass'],
    ['unknown scope', { JEV_ROUTING_SCOPE: 'everyone' }, '15557654321@c.us', false, 'pass'],
    ['outbound', {}, '15557654321@c.us', true, 'pass'],
    ['unknown direction', {}, '15557654321@c.us', undefined, 'pass'],
    ['group sender', {}, '15557654321@g.us', false, 'pass'],
    ['LID sender', {}, '15557654321@lid', false, 'pass'],
    ['missing sender', {}, undefined, false, 'pass'],
    ['zero-leading sender', {}, '05557654321@c.us', false, 'pass'],
    ['too short sender', {}, '1234567@c.us', false, 'pass'],
    ['too long sender', {}, '1234567890123456@c.us', false, 'pass'],
    ['non-digit sender', {}, '1555765432x@c.us', false, 'pass'],
    ['malformed sender', {}, '15557654321@c.us/other', false, 'pass'],
  ];
  for (const [label, overrides, from, fromMe, expected] of cases) {
    const env = { ...baseEnv, ...overrides };
    const original = { conversation_context: { action: 'pass', query: 'Hola' } };
    const $ = () => ({ first: () => ({ json: { body: { payload: { body: 'Hola', from, fromMe } } } }) });
    const [item] = await run({ first: () => ({ json: original }) }, $, env,
      () => ({ post: async (_url, body) => ({ status: 200, data: { model: body.model, answers,
        usage: { input_tokens: 1, output_tokens: 1 } } }) }), undefined);
    assert.equal(item.json.conversation_context.action, expected, label);
    assert.equal(item.json.jev_shadow.status, env.JEV_MODE === 'off' ? 'disabled' : 'ok', label);
  }
});

test('Docker passes canary configuration with safe defaults', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  const example = fs.readFileSync('.env.example', 'utf8');
  assert.match(compose, /JEV_ROUTING_SCOPE=\$\{JEV_ROUTING_SCOPE:-off\}/);
  assert.match(compose, /JEV_CANARY_PHONE=\$\{JEV_CANARY_PHONE:-\}/);
  assert.match(example, /^JEV_ROUTING_SCOPE=off$/m);
  assert.match(example, /^JEV_CANARY_PHONE=$/m);
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
