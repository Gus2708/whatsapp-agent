// Despliega el ajuste al systemMessage del AI Agent: quita el "40%" hardcodeado
// (ahora el recargo es dinamico via presupuesto_config), para que no quede una cifra
// obsoleta en el prompt aunque nunca se la muestre al cliente.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const systemMessage = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_systemMessage.txt'), 'utf8').replace(/\r\n/g, '\n');

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let updated = false;
  for (const n of wf.nodes) {
    if (n.name === 'AI Agent') { n.parameters.options.systemMessage = systemMessage; updated = true; }
  }
  if (!updated) throw new Error('AI Agent node no encontrado');
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
