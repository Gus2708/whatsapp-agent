// Check-only guard: the complete artifact must reproduce from the published baseline.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { buildWorkflow } = require('../lib/workflow-overlay');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const expected = buildWorkflow(require('../workflows/production-baseline.json'), {
  context: read('scratch_live/live_conversation_context.js'),
  jev: read('scratch_live/live_jev_shadow.js'),
});
assert.deepEqual(JSON.parse(read('n8n_workflow.json')), expected, 'Workflow drifted from published baseline and overlay');
console.log('Workflow in sync with production baseline and pilot overlay: OK');
