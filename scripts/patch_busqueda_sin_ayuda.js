// Deploy v11 "búsqueda sin ayuda": empuja los 3 campos canónicos (buscar_productos,
// hacer_presupuesto, systemMessage) desde los dumps scratch_live/* al workflow vivo.
// Idempotente: si el nodo ya tiene el contenido exacto del dump, no reescribe.
// Fuente de verdad = scratch_live/live_*.  Corre `npm test` ANTES para garantizar sync.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const root = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(root, '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const BASE = ((env.match(/^N8N_API_URL_LOCAL=(.+)$/m) || [])[1] || 'http://localhost:5678/api/v1').trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

const buscar = read('scratch_live/live_buscar.js');
const presupuesto = read('scratch_live/live_presupuesto.js');
const systemMessage = read('scratch_live/live_systemMessage.txt');

(async () => {
  if (!key) throw new Error('N8N_API_KEY no está en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];
  for (const n of wf.nodes) {
    const p = n.parameters || {};
    if (n.name === 'buscar_productos_tool') {
      if (p.jsCode === buscar) log.push('buscar (sin cambios)');
      else { p.jsCode = buscar; log.push('buscar ACTUALIZADO'); }
    } else if (n.name === 'hacer_presupuesto_tool') {
      if (p.jsCode === presupuesto) log.push('presupuesto (sin cambios)');
      else { p.jsCode = presupuesto; log.push('presupuesto ACTUALIZADO'); }
    } else if (n.name === 'AI Agent') {
      if (p.options && p.options.systemMessage === systemMessage) log.push('systemMessage (sin cambios)');
      else { p.options = p.options || {}; p.options.systemMessage = systemMessage; log.push('systemMessage ACTUALIZADO'); }
    }
  }
  console.log(log.join('\n'));
  if (!log.some(l => l.includes('ACTUALIZADO'))) { console.log('nada que desplegar'); return; }
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
