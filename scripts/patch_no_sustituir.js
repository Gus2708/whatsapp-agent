// Despliega los tools actualizados (new_*.js: detectan resultado "débil" -> instruccion [PEDIR_AYUDA]
// cuando lo hallado es de otra categoría o medida) + una línea de prompt para que el agente OBEDEZCA
// ese campo "instruccion" y nunca ofrezca un sustituto. Idempotente.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const newBuscar = fs.readFileSync(path.join(__dirname, 'new_buscar.js'), 'utf8');
const newPresu = fs.readFileSync(path.join(__dirname, 'new_presupuesto.js'), 'utf8');

const ANCHOR = 'Solo usa [PEDIR_AYUDA] tras haber buscado.';
const NOTE = 'Si una herramienta te devuelve un campo "instruccion", cúmplela AL PIE DE LA LETRA. NUNCA ofrezcas un sustituto de OTRA categoría o medida, ni digas "lo más parecido que tengo es...", "no tengo el exacto pero..." o algo dudoso: en esos casos responde SOLO con [PEDIR_AYUDA]. ';

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = newBuscar; log.push('buscar'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = newPresu; log.push('presupuesto'); }
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      if (!sm.includes('lo más parecido que tengo es')) {
        if (!sm.includes(ANCHOR)) throw new Error('anchor del prompt no encontrado');
        sm = sm.replace(ANCHOR, NOTE + ANCHOR); log.push('prompt:no-sustituir');
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
