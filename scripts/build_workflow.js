// Build from the user-selected published snapshot, never from stale development dumps.
const fs = require('node:fs');
const path = require('node:path');
require('./build_conversation_sources');
require('./build_jev_sources');
const { buildWorkflow } = require('../lib/workflow-overlay');
const baseline = require('../workflows/production-baseline.json');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const workflow = buildWorkflow(baseline, {
  context: read('scratch_live/live_conversation_context.js'),
  jev: read('scratch_live/live_jev_shadow.js'),
});
fs.writeFileSync(path.join(root, 'n8n_workflow.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log('Built inactive workflow from selected production baseline with pilot overlay');
