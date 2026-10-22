// Patch Sanitize Agent Output on live workflow ugHOTQv3Vb6cuTct
// Deploys the corrected searchGuard implementation which treats omitted intermediateSteps
// (tool-free turns) as null rather than failing closed to clarification.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

(async () => {
  if (!key) throw new Error('N8N_API_KEY not found in .env');
  const targetWf = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n_workflow.json'), 'utf8'));
  const newSanitize = targetWf.nodes.find(n => n.name === 'Sanitize Agent Output');
  if (!newSanitize || !newSanitize.parameters?.jsCode) {
    throw new Error('Could not find Sanitize Agent Output in n8n_workflow.json');
  }

  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const liveSanitize = wf.nodes.find(n => n.name === 'Sanitize Agent Output');
  if (!liveSanitize) {
    throw new Error('Sanitize Agent Output not found on live workflow');
  }

  const oldCode = liveSanitize.parameters.jsCode;
  const newCode = newSanitize.parameters.jsCode;

  if (oldCode === newCode) {
    console.log('Sanitize Agent Output is already up to date on live workflow.');
    return;
  }

  liveSanitize.parameters.jsCode = newCode;
  console.log(`Updated Sanitize Agent Output: ${oldCode.length} chars -> ${newCode.length} chars`);

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const put = await fetch(`${BASE}/workflows/${ID}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs })
  });

  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
  if (!put.ok) process.exit(1);
})().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
