// Fix 1: temperature 0 -> 0.3 en el modelo (la decodificación greedy con temp 0
//         provoca bucles de repetición degenerativa, p.ej. el id "call_q6q6q6..."
//         que se filtró al cliente como texto de una tool-call corrupta).
// Fix 3: nodo guardia "Sanitize Agent Output" entre AI Agent y Check Escalation.
//         Si la salida del agente parece una tool-call filtrada o un bucle de
//         repetición, la reemplaza por un fallback amable en vez de mandar basura
//         al cliente por WhatsApp. Cubre TODAS las rutas de envío (normal/escalar/ayuda).
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const SANITIZE_NAME = 'Sanitize Agent Output';
const SANITIZE_ID = 'sanitize_agent_output_node';

const SANITIZE_CODE = `// Guardia anti-salida-corrupta del agente.
// Si el LLM filtra una tool-call como texto ("Calling xxx_tool with input: ...")
// o entra en un bucle de repetición (degeneración), reemplaza la salida por un
// fallback amable: el cliente NUNCA debe recibir basura interna por WhatsApp.
const FALLBACK = 'Disculpa 🙏, se me enredó un cable procesando eso 👨🏻‍🔧. ¿Me repites qué necesitas (o tu lista de materiales)? Así te lo busco y te armo el presupuesto enseguida 🪚';

function looksCorrupt(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.length > 4000) return true;                              // ninguna respuesta legítima es tan larga
  if (/Calling\\s+[\\w-]+\\s+with input\\s*:/i.test(text)) return true; // tool-call filtrada como texto
  if (/"id"\\s*:\\s*"call_/.test(text)) return true;                  // id de tool_call de OpenAI filtrado
  const head = text.slice(0, 4000);
  if (/(.{1,4})\\1{20,}/s.test(head)) return true;                   // bucle: grupo de 1-4 chars repetido 20+ veces
  return false;
}

for (const item of items) {
  const out = item.json ? item.json.output : undefined;
  if (looksCorrupt(out)) {
    console.warn('[Sanitize] salida corrupta del agente -> fallback. Original (200 chars):', String(out).slice(0, 200));
    item.json.output = FALLBACK;
    item.json._sanitized = true;
  }
}
return items;`;

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let changed = false;

  // ---- FIX 1: temperatura ----
  const model = wf.nodes.find(n => n.name === 'OpenRouter Chat Model');
  if (model) {
    model.parameters = model.parameters || {};
    model.parameters.options = model.parameters.options || {};
    const cur = model.parameters.options.temperature;
    if (cur !== 0.3) {
      model.parameters.options.temperature = 0.3;
      console.log(`✓ Fix 1: temperature ${cur} -> 0.3`);
      changed = true;
    } else {
      console.log('· Fix 1 ya estaba aplicado (temperature 0.3)');
    }
  } else {
    console.log('AVISO: no encontré el nodo "OpenRouter Chat Model"');
  }

  // ---- FIX 3: nodo guardia + rewire ----
  const agent = wf.nodes.find(n => n.name === 'AI Agent');
  const escalar = wf.nodes.find(n => n.name === 'Check Escalation');
  if (!agent || !escalar) {
    console.log('AVISO: falta AI Agent o Check Escalation; no aplico Fix 3');
  } else {
    let guard = wf.nodes.find(n => n.name === SANITIZE_NAME);
    if (!guard) {
      const ax = agent.position[0], ay = agent.position[1];
      const ex = escalar.position[0];
      guard = {
        id: SANITIZE_ID,
        name: SANITIZE_NAME,
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [Math.round((ax + ex) / 2), ay],
        parameters: { jsCode: SANITIZE_CODE },
      };
      wf.nodes.push(guard);
      console.log('✓ Fix 3: nodo "Sanitize Agent Output" creado');
      changed = true;
    } else {
      // mantener el código del guardia al día (idempotente)
      if (guard.parameters.jsCode !== SANITIZE_CODE) {
        guard.parameters.jsCode = SANITIZE_CODE;
        console.log('✓ Fix 3: código del guardia actualizado');
        changed = true;
      } else {
        console.log('· Fix 3: nodo guardia ya existía y está al día');
      }
    }

    // rewire: AI Agent -> Sanitize -> Check Escalation
    const C = wf.connections;
    const aiOut = JSON.stringify(C['AI Agent'] && C['AI Agent'].main);
    const wantAi = [[{ node: SANITIZE_NAME, type: 'main', index: 0 }]];
    if (aiOut !== JSON.stringify(wantAi)) {
      C['AI Agent'] = C['AI Agent'] || {};
      C['AI Agent'].main = wantAi;
      console.log('✓ Fix 3: AI Agent -> Sanitize Agent Output');
      changed = true;
    } else {
      console.log('· Fix 3: AI Agent ya apunta al guardia');
    }
    const wantGuard = [[{ node: 'Check Escalation', type: 'main', index: 0 }]];
    const gOut = JSON.stringify(C[SANITIZE_NAME] && C[SANITIZE_NAME].main);
    if (gOut !== JSON.stringify(wantGuard)) {
      C[SANITIZE_NAME] = C[SANITIZE_NAME] || {};
      C[SANITIZE_NAME].main = wantGuard;
      console.log('✓ Fix 3: Sanitize Agent Output -> Check Escalation');
      changed = true;
    } else {
      console.log('· Fix 3: guardia ya apunta a Check Escalation');
    }
  }

  if (!changed) { console.log('Sin cambios que aplicar.'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK — workflow actualizado en n8n.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
