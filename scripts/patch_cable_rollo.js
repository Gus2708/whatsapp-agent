// Despliega: fix "rollo" (buscar/presupuesto ya editados en new_*.js) + 2 ajustes de prompt:
//   - Escalar a humano cuando el cliente rechaza la IA / pide una persona / se molesta.
//   - Mantener el contexto del producto cuando el cliente da solo un número (ej. "y el #8").
// Idempotente y anclado.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const newBuscar = fs.readFileSync(path.join(__dirname, 'new_buscar.js'), 'utf8');
const newPresu = fs.readFileSync(path.join(__dirname, 'new_presupuesto.js'), 'utf8');

const ESC_ANCHOR = '- Pida explícitamente hablar con una persona o empleado.';
const ESC_ADD = ESC_ANCHOR +
  '\n- Diga que NO quiere hablar con la IA/bot, pida que lo atienda "usted"/una persona/un humano de verdad, o muestre molestia o frustración con tus respuestas (ej. "respóndame usted y no IA", "no quiero bot", "quiero una persona", "hablar con alguien real"). NUNCA insistas ni digas que tú eres una persona: responde solo [ESCALAR_HUMANO].';

const CTX_ANCHOR = 'si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".';
const CTX_ADD = CTX_ANCHOR +
  '\n- CONTEXTO DE LA CHARLA: si el cliente da solo un número, calibre o medida continuando un producto del que ya venían hablando (ej. "y el #8" o "el 12" después de hablar de cable), INCLUYE la palabra del producto en la búsqueda (busca "cable 8", NO solo "8"): un número suelto trae productos sin relación.';

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = newBuscar; log.push('buscar(rollo)'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = newPresu; log.push('presupuesto(rollo)'); }
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      if (!sm.includes('no quiero bot')) {
        if (!sm.includes(ESC_ANCHOR)) throw new Error('anchor escalacion no encontrado');
        sm = sm.replace(ESC_ANCHOR, ESC_ADD); log.push('prompt:escalacion');
      }
      if (!sm.includes('un número suelto trae')) {
        if (!sm.includes(CTX_ANCHOR)) throw new Error('anchor contexto no encontrado');
        sm = sm.replace(CTX_ANCHOR, CTX_ADD); log.push('prompt:contexto');
      }
      n.parameters.options.systemMessage = sm;
    }
  }
  console.log(log.join(', ') || 'sin cambios');
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
