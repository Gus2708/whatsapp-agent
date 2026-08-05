// Despliega los dumps canónicos (scratch_live/*) a los nodos Code del workflow VIVO.
// La cadena de verdad del proyecto es: lib -> scratch_live -> n8n. Este script cierra
// el último tramo, que hasta ahora se hacía con un patch_*.js distinto por cambio.
//
//   node scripts/deploy_nodos.js           # despliega buscar + presupuesto + prompt
//   node scripts/deploy_nodos.js --dry     # muestra qué cambiaría, sin tocar n8n
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const key = (fs.readFileSync(path.join(ROOT, '.env'), 'utf8').match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };
const DRY = process.argv.includes('--dry');

const lf = s => s.replace(/\r\n/g, '\n');
const leer = f => lf(fs.readFileSync(path.join(ROOT, 'scratch_live', f), 'utf8'));

// nodo -> [campo, contenido]
const MAPA = [
  { nodo: 'buscar_productos_tool', campo: 'jsCode', valor: leer('live_buscar.js') },
  { nodo: 'hacer_presupuesto_tool', campo: 'jsCode', valor: leer('live_presupuesto.js') },
  { nodo: 'AI Agent', campo: 'systemMessage', valor: leer('live_systemMessage.txt'), enOptions: true },
];

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let cambios = 0;

  for (const m of MAPA) {
    const n = wf.nodes.find(x => x.name === m.nodo);
    if (!n) { console.log(`AVISO: no existe el nodo "${m.nodo}"`); continue; }
    const cont = m.enOptions ? (n.parameters.options = n.parameters.options || {}) : n.parameters;
    const actual = lf(String(cont[m.campo] || ''));
    if (actual === m.valor) { console.log(`· ${m.nodo}: ya está al día (${m.valor.length} chars)`); continue; }
    console.log(`✓ ${m.nodo}: ${actual.length} -> ${m.valor.length} chars`);
    cont[m.campo] = m.valor;
    cambios++;
  }

  if (!cambios) { console.log('\nSin cambios que desplegar.'); return; }
  if (DRY) { console.log(`\n--dry: ${cambios} nodo(s) cambiarían; no se tocó n8n.`); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const put = await fetch(`${BASE}/workflows/${ID}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }),
  });
  console.log('\nPUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log(`OK — ${cambios} nodo(s) desplegados a n8n.`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
