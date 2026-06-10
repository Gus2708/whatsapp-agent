// Despliega: sinonimo riel/rieles -> tubo herreria (buscar + presupuesto), normalizacion del signo ×
// (reusa fixNorm de _dimfix_lib para quedar byte-identico al trabajo de dimensiones pendiente),
// y una nota en el prompt del agente. Todo IDEMPOTENTE y anclado (si falta el anchor, aborta sin desplegar).
const fs = require('fs');
const path = require('path');

// norm(): convertir el signo × (U+00D7) y similares a la letra 'x' ANTES del strip de norm,
// para que "3×1" se interprete como medida "3x1". Idempotente y byte-identico a _dimfix_lib.fixNorm.
function fixNorm(code) {
  const A = ".toLowerCase().normalize('NFD')";
  const B = ".toLowerCase().replace(/[\\u00d7\\u2715\\u2716]/g,'x').normalize('NFD')";
  if (code.includes('\\u00d7')) return { code, changed: false };
  const i = code.indexOf(A);
  if (i < 0) throw new Error('anchor norm no encontrado');
  if (code.indexOf(A, i + A.length) >= 0) throw new Error('anchor norm AMBIGUO (>1)');
  return { code: code.slice(0, i) + B + code.slice(i + A.length), changed: true };
}

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

// --- sinonimo riel -> tubo herreria (singular y plural; el plural primero por el orden de length-desc del map) ---
function addSinonimoRiel(code) {
  if (code.includes("'riel':'tubo herreria'")) return { code, changed: false };
  const anchor = 'const SIN = {\n';
  if (!code.includes(anchor)) throw new Error('anchor SIN no encontrado');
  return { code: code.replace(anchor, anchor + "  'rieles':'tubo herreria','riel':'tubo herreria',\n"), changed: true };
}

// --- nota de rieles en el prompt del AI Agent ---
const SM_ANCHOR = 'El catálogo entiende singular/plural y sinónimos, así que SIEMPRE busca antes de decir que no hay.';
const SM_NOTE = '\n- RIELES = TUBO DE HERRERÍA: aquí mucha gente llama "rieles" a los tubos de HERRERÍA (estructural/metálico) según su medida. Si piden "rieles 2x1", "3 rieles de 3x1", "riel 3x1-1/2", etc., trátalos como tubo de herrería de esa medida y pásalos a la herramienta TAL CUAL (incluyendo la medida); la herramienta ya entiende riel = tubo herrería.';
function patchSystemMessage(sm) {
  if (sm.includes('RIELES = TUBO DE HERRERÍA')) return { sm, changed: false };
  if (!sm.includes(SM_ANCHOR)) throw new Error('anchor del prompt (TIPOS DE TUBO) no encontrado');
  return { sm: sm.replace(SM_ANCHOR, SM_ANCHOR + SM_NOTE), changed: true };
}

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool' || n.name === 'hacer_presupuesto_tool') {
      let code = n.parameters.jsCode;
      const s = addSinonimoRiel(code); code = s.code;
      const x = fixNorm(code); code = x.code;            // ×/✕/✖ -> 'x' (identico al dimfix)
      n.parameters.jsCode = code;
      changed.push(`${n.name}: syn:${s.changed ? 'OK' : 'ya'} normX:${x.changed ? 'OK' : 'ya'}`);
    }
    if (n.name === 'AI Agent') {
      const r = patchSystemMessage(n.parameters.options.systemMessage || '');
      n.parameters.options.systemMessage = r.sm;
      changed.push(`prompt: ${r.changed ? 'OK' : 'ya'}`);
    }
  }
  console.log(changed.join('\n'));

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
