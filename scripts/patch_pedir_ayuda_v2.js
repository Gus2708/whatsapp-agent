// Refuerza la instrucción [PEDIR_AYUDA] en el prompt: cuando la búsqueda no arroja resultados (o el
// cliente refuta) el agente DEBE responder solo con el token, en vez de decir "no lo encontré".
// Reemplaza la sección anterior (más débil). Idempotente.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const START = '═══ PEDIR AYUDA A UN EMPLEADO';
const END = '═══ ESCALAMIENTO (remitir a un empleado) ═══';
const NEW_SECTION = [
  '═══ PEDIR AYUDA A UN EMPLEADO (regla CRÍTICA) ═══',
  'Hay DOS situaciones en las que tu ÚNICA respuesta válida es el token [PEDIR_AYUDA] (escríbelo solo, exactamente así, SIN saludo, SIN explicación, SIN sugerir alternativas, aunque sea el primer mensaje):',
  '(a) Llamaste a buscar_productos o hacer_presupuesto y la herramienta NO devolvió el producto que el cliente pide (te respondió "No encontré..." o no trae lo que pidió).',
  '(b) El cliente dice que el producto, medida o precio que le diste está MAL, no es lo que quería, o te corrige.',
  'En esos dos casos está TERMINANTEMENTE PROHIBIDO responder "no lo encontré", "no lo tenemos", "no está en el catálogo", pedir que reformule, o sugerir otro producto/medida. NO adivines. Un empleado real verá tu [PEDIR_AYUDA], elegirá el/los producto(s) correcto(s) y el sistema se los enviará al cliente; por eso tu única salida es el token.',
  'EXCEPCIONES (NO uses [PEDIR_AYUDA]): si el artículo es de una categoría que NO vendemos (celulares, ropa, electrodomésticos, etc.) declina normal; y para reclamos/quejas o si piden hablar con una persona usa [ESCALAR_HUMANO]. Solo usa [PEDIR_AYUDA] tras haber buscado.',
  '', '',
].join('\n');

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const ai = wf.nodes.find(n => n.name === 'AI Agent');
  let sm = (ai.parameters.options && ai.parameters.options.systemMessage) || '';
  if (sm.includes('regla CRÍTICA')) { console.log('Ya reforzado (idempotente).'); return; }
  const si = sm.indexOf(START), ei = sm.indexOf(END);
  if (si < 0 || ei < 0 || ei < si) throw new Error('no encontré la sección [PEDIR_AYUDA] o ESCALAMIENTO');
  ai.parameters.options.systemMessage = sm.slice(0, si) + NEW_SECTION + sm.slice(ei);

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK reforzado' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
