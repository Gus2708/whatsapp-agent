// Despliega: "fibra de piso/concreto" -> macrofibra (buscar + presupuesto) + nota en el prompt.
// Idempotente y anclado. La macrofibra es la fibra sintetica estructural que se mezcla en el concreto/piso;
// antes "fibra de piso" devolvia malla mosquitera / cinta de fibra de vidrio (sin relacion).
const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

// regla dentro de expandir(): fibra + contexto de piso/concreto -> macrofibra
const ANCHOR = "'cal preparada'); ";
const FIBRA_RULE = "if(/\\bfibra\\b/.test(s)&&/\\b(pisos?|concreto|vaciado|losa|estructural)\\b/.test(s)) s=s.replace(/\\bfibra\\b/g,'macrofibra'); ";
function addFibraRule(code) {
  if (code.includes('macrofibra')) return { code, changed: false };
  if (!code.includes(ANCHOR)) throw new Error('anchor expandir/cal no encontrado');
  return { code: code.replace(ANCHOR, ANCHOR + FIBRA_RULE), changed: true };
}

// nota en el prompt, despues de la nota de RIELES
const SM_ANCHOR = 'la herramienta ya entiende riel = tubo herrería.';
const SM_NOTE = '\n- FIBRA PARA PISO/CONCRETO = MACROFIBRA: si piden "fibra de piso", "fibra para concreto/vaciado", "fibra estructural", etc., es la MACROFIBRA (fibra sintética que se mezcla en el concreto/piso para reforzarlo), NO la malla mosquitera ni la cinta de fibra de vidrio. Búscala con la herramienta tal cual (ya entiende fibra de piso = macrofibra).';
function patchSM(sm) {
  if (sm.includes('= MACROFIBRA')) return { sm, changed: false };
  if (!sm.includes(SM_ANCHOR)) throw new Error('anchor del prompt (nota rieles) no encontrado');
  return { sm: sm.replace(SM_ANCHOR, SM_ANCHOR + SM_NOTE), changed: true };
}

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const out = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool' || n.name === 'hacer_presupuesto_tool') {
      const r = addFibraRule(n.parameters.jsCode); n.parameters.jsCode = r.code; out.push(`${n.name}: ${r.changed ? 'OK' : 'ya'}`);
    }
    if (n.name === 'AI Agent') {
      const r = patchSM(n.parameters.options.systemMessage || ''); n.parameters.options.systemMessage = r.sm; out.push(`prompt: ${r.changed ? 'OK' : 'ya'}`);
    }
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
