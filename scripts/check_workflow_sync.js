// Guard: the code embedded in n8n_workflow.json must match the canonical scratch_live dumps.
// Fails (non-zero exit) on drift. Run via `npm test`.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
// Normalize CRLF->LF to match build_workflow.js (which writes clean LF into the JSON).
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const wf = JSON.parse(fs.readFileSync(path.join(root, 'n8n_workflow.json'), 'utf8'));
const wantJs = {
  buscar_productos: read('scratch_live/live_buscar.js'),
  hacer_presupuesto: read('scratch_live/live_presupuesto.js'),
};
const wantSys = read('scratch_live/live_systemMessage.txt');

const seen = new Set();
for (const node of wf.nodes) {
  const p = node.parameters || {};
  if (p.name && Object.prototype.hasOwnProperty.call(wantJs, p.name)) {
    assert.strictEqual(p.jsCode, wantJs[p.name],
      `n8n_workflow.json node "${p.name}" jsCode drifted from scratch_live`);
    seen.add(p.name);
  }
  if (node.name === 'AI Agent') {
    assert.strictEqual(p.options && p.options.systemMessage, wantSys,
      'AI Agent systemMessage drifted from scratch_live/live_systemMessage.txt');
    seen.add('sys');
  }
}
assert.ok(seen.has('buscar_productos') && seen.has('hacer_presupuesto') && seen.has('sys'),
  'did not find all 3 expected nodes in n8n_workflow.json');
console.log('workflow in sync with scratch_live: OK');
