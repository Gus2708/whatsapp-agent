// Refuerza el prompt: prohibir decir "no tenemos" sin buscar; obligar a re-buscar cuando
// el cliente reformula o pide una variante (la memoria NO cuenta como busqueda).
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const anchor = 'Si la búsqueda arroja resultados, significa que sí lo vendemos y debes ofrecerlos.';
const add = anchor + '\n- PROHIBIDO decir "no tenemos", "no manejamos" o "no está en el catálogo" SIN haber llamado buscar_productos en ESTE mismo mensaje. La memoria de la conversación NO cuenta como búsqueda. Aunque un mensaje anterior parezca cubrir el tema, si el cliente REFORMULA o pide una VARIANTE distinta (otro material, tipo, color o medida; ej. "de aceite" en vez de "de caucho", "blanca" en vez de "azul", "estriada" en vez de "lisa"), es OBLIGATORIO volver a llamar buscar_productos con los términos NUEVOS antes de responder. Cada mensaje que mencione un producto exige su propia búsqueda, sin excepción.';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  let changed = false;
  for (const n of wf.nodes) {
    if (n.name === 'AI Agent') {
      const sm = n.parameters.options.systemMessage;
      if (sm.includes('PROHIBIDO decir "no tenemos"')) { console.log('prompt: regla ya existe'); }
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
  console.log('Prompt reforzado | PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
