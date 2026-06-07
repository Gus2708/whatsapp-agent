// Inserta nodo Code "Cliente Memoria" entre Is Manual Handover (rama normal) y AI Agent.
// Recall determinista + guardado automatico del nombre. Inyecta nombre/notas al AI Agent.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json','accept':'application/json' };
const jsCode = fs.readFileSync(path.join(__dirname,'cliente_memoria.js'),'utf8');

const AGENT_TEXT = '={{ "[CONTEXTO INTERNO, no mostrar al cliente] telefono_cliente=" + $(\'Webhook Trigger\').first().json.body.payload.from + " | nombre_guardado=" + ($(\'Cliente Memoria\').first().json.cliente_nombre || \'desconocido\') + " | notas_guardadas=" + ($(\'Cliente Memoria\').first().json.cliente_notas || \'ninguna\') + " ||| Mensaje del cliente: " + $(\'Webhook Trigger\').first().json.body.payload.body }}';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  fs.writeFileSync(path.join(__dirname,'_wf_snapshot_pre_nodo_'+Date.now()+'.json'), JSON.stringify(wf,null,1));

  if (!wf.nodes.find(n=>n.name==='Cliente Memoria')) {
    wf.nodes.push({
      parameters: { jsCode },
      id: 'cliente_memoria_node',
      name: 'Cliente Memoria',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: [620, 470],
      onError: 'continueRegularOutput'
    });
  } else {
    wf.nodes.find(n=>n.name==='Cliente Memoria').parameters.jsCode = jsCode;
  }

  // Reconectar: Is Manual Handover? rama normal (main[1]) -> Cliente Memoria -> AI Agent
  const imh = wf.connections['Is Manual Handover?'];
  imh.main[1] = [{ node: 'Cliente Memoria', type: 'main', index: 0 }];
  wf.connections['Cliente Memoria'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };

  // Inyectar nombre/notas al AI Agent
  const ai = wf.nodes.find(n=>n.name==='AI Agent');
  ai.parameters.text = AGENT_TEXT;

  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify({ name:wf.name, nodes:wf.nodes, connections:wf.connections, settings:cs }) });
  console.log('PUT', put.status); if(!put.ok) console.log(await put.text()); else console.log('Nodo Cliente Memoria insertado y cableado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
