'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildToolContextProbe } = require('../scripts/build_jev_tool_probe');

test('isolated Tool Code probe contains only synthetic items and no external side effects', () => {
  const workflow = buildToolContextProbe();
  assert.equal(workflow.active, false);
  assert.equal(workflow.nodes.length, 3);
  assert.equal(workflow.nodes[0].type, 'n8n-nodes-base.manualTrigger');
  assert.equal(workflow.nodes[2].type, '@n8n/n8n-nodes-langchain.toolCode');
  assert.ok(workflow.nodes.every(node => !node.credentials));
  assert.doesNotMatch(JSON.stringify(workflow), /https?:\/\/|supabase|waha|AI_GATEWAY_API_KEY/i);
  assert.match(workflow.nodes[1].parameters.jsCode, /request_id: 'first'/);
  assert.match(workflow.nodes[1].parameters.jsCode, /request_id: 'second'/);
  assert.match(workflow.nodes[2].parameters.jsCode, /\$\('Jev Shadow Decision'\)/);
  assert.match(workflow.nodes[2].parameters.jsCode, /\.all\(\)\.length/);
  assert.equal(buildToolContextProbe({ singleItem: true }).nodes[1].parameters.jsCode.includes("request_id: 'second'"), false);
});
