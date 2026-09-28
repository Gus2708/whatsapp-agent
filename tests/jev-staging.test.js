'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { buildStagingWorkflow } = require('../scripts/build_jev_staging');
const corpus = require('./fixtures/jev-synthetic.json');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

test('staging export is inactive, manual-only and contains no production nodes or credentials', () => {
  const workflow = buildStagingWorkflow();
  assert.deepEqual(JSON.parse(fs.readFileSync('docs/jev-staging-workflow.json', 'utf8')), workflow);
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.length, 4);
  assert.equal(workflow.nodes[0].type, 'n8n-nodes-base.manualTrigger');
  assert.ok(workflow.nodes.slice(1).every(node => node.type === 'n8n-nodes-base.code'));
  assert.ok(workflow.nodes.every(node => !node.credentials));
  assert.equal(Object.keys(workflow.connections).length, 3);
});

test('staging assertion detects any change to original routing, state, output or arbitrary fields', async () => {
  const workflow = buildStagingWorkflow();
  const fixture = await new AsyncFunction(workflow.nodes[1].parameters.jsCode)();
  const original = fixture[0].json;
  const run = new AsyncFunction('$input', '$', workflow.nodes[3].parameters.jsCode);
  const lookup = () => ({ first: () => ({ json: original }) });
  for (const status of ['disabled', 'ok', 'low_confidence']) {
    const result = await run({ first: () => ({ json: { ...original, jev_shadow: { status } } }) }, lookup);
    assert.equal(result[0].json.observation_unchanged, true);
  }
  for (const field of ['output', 'conversation_context', 'sentinel']) {
    await assert.rejects(() => run({ first: () => ({ json: { ...original, [field]: 'mutated', jev_shadow: { status: 'ok' } } }) }, lookup));
  }
  await assert.rejects(() => run({ first: () => ({ json: { ...original, jev_shadow: { status: 'http_error' } } }) }, lookup));
});

test('expanded corpus retains original cases and adds paired contextual followups and topic changes', () => {
  assert.equal(corpus.length, 30);
  assert.equal(corpus[13].id, 'delivery');
  for (const id of ['color-followup', 'color-orphan', 'topic-paint-explicit', 'topic-hours-context']) {
    assert.ok(corpus.some(row => row.id === id));
  }
});
