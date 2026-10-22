'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buscarLive } = require('./support/load-live-buscar');
const wf = require('../n8n_workflow.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const node = name => wf.nodes.find(n => n.name === name);
const source = name => fs.readFileSync(path.join(__dirname, '../scratch_live', name), 'utf8');
function context(message, store, session = 'shop', enabled = 'true', chat = 'a') {
  const input = { cliente_nombre: 'Ana' };
  const $ = name => ({ first: () => ({ json: { body: { session, payload: { from: chat, body: message } } } }) });
  return new AsyncFunction('$', '$input', '$env', '$getWorkflowStaticData', source('live_conversation_context.js'))(
    $, { first: () => ({ json: input }) }, enabled === null ? {} : { CONVERSATION_STATE_ENABLED: enabled }, () => store,
  );
}
test('workflow code resolves follow-ups, isolates accounts, and honors default off', async () => {
  const store = {};
  await context('cable thwn #12 azul por metro', store);
  const [next] = await context('y el #8', store);
  assert.equal(next.json.conversation_context.query, 'cable thwn #8 azul por metro');
  assert.deepEqual(next.json.conversation_context.previous_product,
    { variant: 'thwn', gauge: '12', color: 'azul', presentation: 'metro' });
  assert.equal(next.json.conversation_context.state.gauge, '8');
  assert.equal(next.json.cliente_nombre, 'Ana');
  assert.equal((await context('y el #8', store, 'other'))[0].json.conversation_context.action, 'clarify');
  const before = JSON.stringify(store);
  assert.equal((await context('y el #8', store, 'shop', null))[0].json.conversation_context.action, 'disabled');
  assert.equal((await context('y el #8', store, 'shop', 'false'))[0].json.conversation_context.action, 'disabled');
  // Disabled executions cannot mutate or read retained context.
  const disabledStore = {};
  await context('cable #12', disabledStore, 'shop', null);
  assert.deepEqual(disabledStore, {});
  assert.ok(before.length > 2);
  assert.equal(JSON.stringify(store), before);
});
test('expired state is pruned and missing store fails to clarification', async () => {
  const store = {};
  await context('cable #12', store);
  for (const value of Object.values(store.conversations)) value.expires_at = 1;
  assert.equal((await context('y el #8', store))[0].json.conversation_context.action, 'clarify');
  assert.equal((await context('y el #8', null))[0].json.conversation_context.action, 'clarify');
});
test('production matcher returns structured actions on exact, vague and missing exits', async () => {
  for (const [query, action] of [['lamina', 'show_results'], ['hola', 'clarify'], ['quarkonium', 'handoff']]) {
    const { result } = await buscarLive(query);
    assert.equal(result.decision_version, 1);
    assert.equal(result.action, action);
  }
});
test('sanitizer consumes actual tool observations and pre-agent clarification without network', async () => {
  const fn = new AsyncFunction('items', '$', '$env', 'require', source('live_sanitize.js'));
  const observation = JSON.stringify({ decision_version: 1, action: 'confirm', match_status: 'approximate', requires_confirmation: true, productos: [{ nombre: 'Cable' }] });
  const run = async (action, steps, output = 'Cuesta 10$') => {
    const $ = name => ({ first: () => ({ json: name === 'Prepare Conversation Context'
      ? { conversation_context: { action } } : { body: { payload: {} } } }) });
    let calls = 0;
    const deny = () => { calls++; throw Error('Network not allowed'); };
    const result = (await fn([{ json: { output, intermediateSteps: steps } }], $, {}, () => ({ get: deny, post: deny })))[0].json;
    assert.equal(calls, 0);
    return result;
  };
  assert.match((await run('clarify', [])).output, /producto/);
  assert.equal((await run('disabled', undefined, '¡Hola! ¿En qué te ayudo?')).output, '¡Hola! ¿En qué te ayudo?');
  assert.equal((await run('disabled', [], '¡Hola! ¿En qué te ayudo?')).output, '¡Hola! ¿En qué te ayudo?');
  assert.equal((await run('pass', undefined, 'Abrimos de lunes a sábado.')).output, 'Abrimos de lunes a sábado.');
  assert.equal((await run('pass', [], 'Abrimos de lunes a sábado.')).output, 'Abrimos de lunes a sábado.');
  assert.match((await run('disabled', 'invalid-steps')).output, /producto/, 'invalid non-array step shape fails closed');
  const guarded = await run('search', [{ action: { tool: 'buscar_productos' }, observation }]);
  assert.doesNotMatch(guarded.output, /10\$/);
  assert.equal(guarded.intermediateSteps, undefined);
  assert.equal((await run('clarify', [], '[ESCALAR_HUMANO]')).output, '[ESCALAR_HUMANO]');
});
test('generated workflow connects context and enables the tool observation contract', () => {
  assert.equal(node('AI Agent').parameters.options.returnIntermediateSteps, true);
  assert.match(node('AI Agent').parameters.text, /Prepare Conversation Context/);
  assert.equal(wf.connections['Cliente Memoria'].main[0][0].node, 'Prepare Conversation Context');
  assert.equal(wf.connections['Prepare Conversation Context'].main[0][0].node, 'Jev Shadow Decision');
  assert.equal(wf.connections['Jev Shadow Decision'].main[0][0].node, 'Needs Product Clarification?');
  assert.equal(wf.connections['Needs Product Clarification?'].main[0][0].node, 'Sanitize Agent Output');
  assert.equal(wf.connections['Needs Product Clarification?'].main[1][0].node, 'AI Agent');
  const branch = wf.nodes.find(node => node.name === 'Needs Product Clarification?');
  assert.equal(branch.parameters.conditions.options.typeValidation, 'strict');
  assert.equal(branch.parameters.conditions.conditions[0].operator.type, 'boolean');
  assert.equal(branch.parameters.conditions.conditions[0].rightValue, true);
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    visited.add(name);
    assert.doesNotMatch(JSON.stringify(node(name).parameters), /\$\(['"]AI Agent['"]\)|\$node\[['"]AI Agent['"]\]/,
      name + ' must work when the Agent was bypassed');
    for (const edges of wf.connections[name]?.main || []) for (const edge of edges) visit(edge.node);
  }
  visit('Sanitize Agent Output');
});
