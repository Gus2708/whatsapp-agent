// Despliega el fix: el recargo por pago en bolivares deja de estar hardcodeado (1.40 = 40%)
// y pasa a leerse de presupuesto_config.markup_porcentaje en Supabase (hoy = 30%).
// Empuja el jsCode ya regenerado en n8n_workflow.json (por build_workflow.js) a los nodos
// buscar_productos_tool y hacer_presupuesto_tool del workflow vivo.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const local = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'n8n_workflow.json'), 'utf8'));
const localBuscar = local.nodes.find(n => n.parameters && n.parameters.name === 'buscar_productos').parameters.jsCode;
const localPresu = local.nodes.find(n => n.parameters && n.parameters.name === 'hacer_presupuesto').parameters.jsCode;

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const out = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = localBuscar; out.push('buscar: recargo dinamico'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = localPresu; out.push('presupuesto: recargo dinamico'); }
  }
  console.log(out.join('\n'));

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
