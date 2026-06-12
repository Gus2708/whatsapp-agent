// Regenerate the stale code in n8n_workflow.json from the canonical scratch_live dumps.
// Only touches: buscar_productos jsCode, hacer_presupuesto jsCode, AI Agent systemMessage.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
// Normalize CRLF->LF so the embedded code is clean LF and matches the guard.
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const wfPath = path.join(root, 'n8n_workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

const buscar = read('scratch_live/live_buscar.js');
const presupuesto = read('scratch_live/live_presupuesto.js');
const systemMessage = read('scratch_live/live_systemMessage.txt');

let updated = 0;
for (const node of wf.nodes) {
  const p = node.parameters || {};
  if (p.name === 'buscar_productos') { p.jsCode = buscar; updated++; }
  else if (p.name === 'hacer_presupuesto') { p.jsCode = presupuesto; updated++; }
  else if (node.name === 'AI Agent' && p.options && 'systemMessage' in p.options) {
    p.options.systemMessage = systemMessage; updated++;
  }
}
if (updated !== 3) {
  console.error('expected to update 3 nodes, updated ' + updated + ' — aborting, no file written');
  process.exit(1);
}
fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2) + '\n');
console.log('regenerated workflow: 3 nodes updated');
