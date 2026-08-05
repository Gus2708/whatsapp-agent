// Despliega la regla "VENTA POR ROLLO" en el systemMessage del nodo AI Agent.
// Simétrica a "VENTA POR METRO": obliga al LLM a CONSERVAR la palabra "rollo" en la
// búsqueda, para que "rollo de cable #10" cotice el rollo completo y no el precio por metro.
// Idempotente y anclado. Solo toca el nodo AI Agent.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const ANCHOR = 'si quitas "por metro" mostrarás el rollo equivocado.';
const ADD = ANCHOR +
  '\n- VENTA POR ROLLO: simétrico al anterior. Si el cliente dice "rollo", "rollos", "un rollo" o "el rollo" (de cable, manguera, malla, nylon, cadena, alambre, etc.), INCLUYE la palabra "rollo" EXACTA en la búsqueda (ej. buscar_productos con "rollo cable 10", no solo "cable 10"). El rollo COMPLETO cuesta MUCHO más que el metro suelto; si quitas "rollo" mostrarás el precio POR METRO y el cliente creerá que el rollo entero cuesta centavos. NUNCA respondas el precio por metro cuando pidieron el rollo.';

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];
  for (const n of wf.nodes) {
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      if (sm.includes('VENTA POR ROLLO')) { log.push('prompt:rollo (ya estaba)'); continue; }
      if (!sm.includes(ANCHOR)) throw new Error('anchor VENTA POR METRO no encontrado');
      sm = sm.replace(ANCHOR, ADD);
      n.parameters.options.systemMessage = sm;
      log.push('prompt:rollo');
    }
  }
  console.log(log.join(', ') || 'sin cambios');
  if (!log.includes('prompt:rollo')) { console.log('nada que desplegar'); return; }
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
