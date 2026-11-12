// Hardens "Es Cliente Real?" so health probes ({} or {"probe":true}) and
// malformed payloads without a sender "@" route straight to "Descartar"
// instead of reaching Reply Non-Text and crashing WAHA /api/sendText with 500.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';

const FROM_EXPR = '={{ $json.body.payload ? $json.body.payload.from : $json.body.from }}';
const SAFE_WH_FROM = "($('Webhook Trigger').first().json.body.payload ? $('Webhook Trigger').first().json.body.payload.from : ($('Webhook Trigger').first().json.body.from || ''))";

const EXTRA_CONDITIONS = [
  {
    id: 'c_has_sender',
    leftValue: FROM_EXPR,
    rightValue: '@',
    operator: { type: 'string', operation: 'contains' },
  },
  {
    id: 'c_not_probe',
    leftValue: '={{ Boolean($json.body && $json.body.probe) }}',
    rightValue: true,
    operator: { type: 'boolean', operation: 'notEquals' },
  },
];

function patchWorkflow(wf) {
  let changed = false;
  const node = (wf.nodes || []).find((n) => n.name === 'Es Cliente Real?');
  if (!node) throw new Error('Node "Es Cliente Real?" not found');
  const conds = node.parameters?.conditions?.conditions;
  if (!Array.isArray(conds)) throw new Error('Invalid conditions structure in "Es Cliente Real?"');

  for (const extra of EXTRA_CONDITIONS) {
    if (!conds.some((c) => c.id === extra.id)) {
      conds.push(structuredClone(extra));
      changed = true;
    }
  }

  for (const name of ['Send Agent Response', 'Send Handover Message', 'Send Bridge Message']) {
    const sn = (wf.nodes || []).find((n) => n.name === name);
    if (sn?.parameters?.jsonBody?.includes("$('Webhook Trigger').first().json.body.payload.from")) {
      sn.parameters.jsonBody = sn.parameters.jsonBody.replace(
        /\$\('Webhook Trigger'\)\.first\(\)\.json\.body\.payload\.from/g,
        SAFE_WH_FROM
      );
      changed = true;
    }
  }

  return changed;
}

function patchJsonFile(relPath) {
  const full = path.join(ROOT, relPath);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  const changed = patchWorkflow(wf);
  if (changed) {
    fs.writeFileSync(full, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  }
  console.log(`${relPath}: ${changed ? 'updated' : 'already up to date'}`);
}

async function patchLive() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const key = ((env.match(/^N8N_API_KEY=(.+)$/m) || [])[1] || '').trim();
  if (!key) throw new Error('N8N_API_KEY missing in .env');
  const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const changed = patchWorkflow(wf);
  if (!changed) {
    console.log(`n8n live (${ID}): already up to date`);
    return;
  }

  const ALLOWED = [
    'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
  ];
  const cs = {};
  for (const k of ALLOWED) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const put = await fetch(`${BASE}/workflows/${ID}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }),
  });
  if (!put.ok) throw new Error(`PUT failed: ${put.status} ${await put.text()}`);
  console.log(`n8n live (${ID}): updated (HTTP ${put.status})`);
}

(async () => {
  patchJsonFile('workflows/production-baseline.json');
  patchJsonFile('n8n_workflow.json');
  if (!process.argv.includes('--files-only')) {
    await patchLive();
  }
})().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
