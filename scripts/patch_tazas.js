// Revierte el nombre de la tabla en los nodos del agente: tasas -> tazas
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.parameters && typeof n.parameters.jsCode === 'string' && n.parameters.jsCode.includes('/rest/v1/tasas')) {
      n.parameters.jsCode = n.parameters.jsCode.split('/rest/v1/tasas').join('/rest/v1/tazas');
      changed.push(n.name);
    }
  }
  if (changed.length===0) { console.log('Sin cambios (no se encontro /rest/v1/tasas)'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Nodos actualizados:', changed.join(', '), '| PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
