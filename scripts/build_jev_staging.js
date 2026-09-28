'use strict';
const fs = require('node:fs');
const path = require('node:path');

function buildStagingWorkflow() {
  const code = (name, jsCode, index) => ({ id: `jev-staging-${index}`, name, type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [index * 280, 0], parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode } });
  const nodes = [
    { id: 'jev-staging-manual', name: 'Manual Test', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {} },
    code('Transcribir Nota de Voz', `// Synthetic fixture only: no customer, credentials, session or external input.
return [{ json: { body: { payload: { body: 'y el #8' } }, output: 'Synthetic reply unchanged', sentinel: 'preserve',
  conversation_context: { action: 'search', query: 'cable thwn #8 azul por metro',
    previous_product: { variant: 'thwn', gauge: '12', color: 'azul', presentation: 'metro' },
    state: { gauge: '8', confirmed: false } } } }];`, 1),
    code('Jev Shadow Decision', fs.readFileSync(path.join(__dirname, '../scratch_live/live_jev_shadow.js'), 'utf8').replace(/\r\n/g, '\n'), 2),
    code('Assert Observation Only', `const original = $('Transcribir Nota de Voz').first().json;
const { jev_shadow, ...rest } = $input.first().json;
if (JSON.stringify(rest) !== JSON.stringify(original)) throw Error('Shadow mutated original fields');
if (!['disabled', 'ok', 'low_confidence'].includes(jev_shadow?.status)) throw Error('Shadow probe failed: ' + (jev_shadow?.status || 'missing'));
return [{ json: { synthetic: true, observation_unchanged: true, jev_shadow } }];`, 3),
  ];
  const connections = {};
  for (let i = 0; i < nodes.length - 1; i++) connections[nodes[i].name] = { main: [[{ node: nodes[i + 1].name, type: 'main', index: 0 }]] };
  return { name: 'Jev isolated synthetic probe', active: false, nodes, connections, settings: { executionOrder: 'v1' } };
}
if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, '../docs/jev-staging-workflow.json'), JSON.stringify(buildStagingWorkflow(), null, 2) + '\n');
  console.log('Wrote inactive synthetic staging workflow. No runtime started or requests sent.');
}
module.exports = { buildStagingWorkflow };
