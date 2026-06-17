// patch_fromme_filter.js
// Adds a fromMe !== true condition to "Es Cliente Real?" to prevent the bot
// from processing its own sent messages (which WAHA NOWEB fires as "message" events).
const fs = require('fs');
const path = require('path');

const N8N_URL = 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';

const NEW_CONDITION = {
  id: 'c_not_from_me',
  leftValue: '={{ $json.body.payload ? $json.body.payload.fromMe : ($json.body.fromMe || false) }}',
  rightValue: true,
  operator: {
    type: 'boolean',
    operation: 'notEquals'
  }
};

async function patch() {
  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  const wf = await res.json();

  const node = wf.nodes.find(n => n.name === 'Es Cliente Real?');
  if (!node) throw new Error('Node "Es Cliente Real?" not found');

  const conds = node.parameters.conditions.conditions;
  const already = conds.some(c => c.id === 'c_not_from_me' || (c.leftValue && c.leftValue.includes('fromMe')));
  if (already) {
    console.log('fromMe filter already present — nothing to do.');
    return;
  }

  conds.push(NEW_CONDITION);
  console.log('Added condition:', JSON.stringify(NEW_CONDITION, null, 2));
  console.log('Total conditions now:', conds.length);

  // n8n PUT only accepts a specific subset of settings keys
  const allowedSettings = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution',
    'saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {};
  for (const k of allowedSettings) if (wf.settings?.[k] !== undefined) cs[k] = wf.settings[k];
  if (!cs.executionOrder) cs.executionOrder = 'v1';

  const putRes = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs })
  });
  if (!putRes.ok) throw new Error(`PUT failed: ${putRes.status} ${await putRes.text()}`);

  const updated = await putRes.json();
  const updatedNode = updated.nodes.find(n => n.name === 'Es Cliente Real?');
  const updatedConds = updatedNode?.parameters?.conditions?.conditions || [];
  const confirmed = updatedConds.some(c => c.id === 'c_not_from_me');
  console.log(confirmed ? '✓ Patch deployed and verified.' : '✗ Patch NOT found in response!');
  updatedConds.forEach(c => console.log(' -', c.id, '|', c.leftValue.substring(0, 60)));
}

patch().catch(e => { console.error(e.message); process.exit(1); });
