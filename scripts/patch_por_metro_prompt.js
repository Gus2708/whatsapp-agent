// El modelo quita "por metro" al buscar -> instruirlo a conservarlo (hay productos vendidos por metro)
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const anchor = 'si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".';
const add = anchor + '\n- VENTA POR METRO: si el cliente dice "por metro", "al metro", "x metro", "el metro" o "cuánto el metro", INCLUYE esas palabras EXACTAS en la búsqueda (ej. buscar_productos con "cable 10 por metro", no solo "cable 10"). Hay productos que se venden POR METRO (cable, manguera, malla, nylon, cadena) a un precio por metro distinto al del rollo completo; si quitas "por metro" mostrarás el rollo equivocado.';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  let changed = false;
  for (const n of wf.nodes) {
    if (n.name === 'AI Agent') {
      const sm = n.parameters.options.systemMessage;
      if (sm.includes('VENTA POR METRO')) { console.log('prompt: regla por metro ya existe'); }
      else if (sm.includes(anchor)) { n.parameters.options.systemMessage = sm.replace(anchor, add); changed = true; }
      else console.log('AVISO: no encontre el anchor en el prompt');
    }
  }
  if (!changed) { console.log('Sin cambios'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Prompt actualizado | PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
