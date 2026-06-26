// Deploy: empuja los cuerpos corregidos al workflow vivo.
//   buscar_productos_tool  <- scratch_live/live_buscar.js
//   hacer_presupuesto_tool <- scratch_live/live_presupuesto.js
// Fixes de medida/calibre (ambas tools comparten la lógica de medPresent+norm):
//   - "N metros"/"N pies" (largo/talla) matchea "X6MTS"/"12 PIES"; calibre "30"/"0.30"/"0,30" -> "CAL.30".
//   - par dimensional con sufijo de unidad: "1.10x6" matchea "1.10X6MTS".
//   - cero final: "1.1"=="1.10", "0.2"=="0.20".  + coma decimal "0,30"->"0.30".
//   - ranking: umbral relevancia 0.5->2 (un AGOTADO no supera a un disponible por ruido).
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const TARGETS = [
  { node: 'buscar_productos_tool', file: 'scratch_live/live_buscar.js' },
  { node: 'hacer_presupuesto_tool', file: 'scratch_live/live_presupuesto.js' },
];
const MARKERS = ['largo en metros', 'calibre de 2 digitos', 'ruido de conteo de palabras', 'tolera sufijo de unidad', 'cero final', "replace(/(\\d)\\s*,\\s*(\\d)/g"];

(async () => {
  const code = {};
  for (const t of TARGETS) {
    code[t.node] = fs.readFileSync(path.join(__dirname, '..', t.file), 'utf8');
    for (const m of MARKERS) if (!code[t.node].includes(m)) { console.error('ABORT: falta marcador "' + m + '" en ' + t.file); process.exit(1); }
  }
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let changed = false;
  for (const t of TARGETS) {
    const node = wf.nodes.find(n => n.name === t.node);
    if (!node) { console.error('ABORT: no encontré', t.node); process.exit(1); }
    if ((node.parameters.jsCode || '').trim() === code[t.node].trim()) { console.log('· ' + t.node + ' ya idéntico.'); continue; }
    node.parameters.jsCode = code[t.node];
    console.log('✓ ' + t.node + ' actualizado (' + code[t.node].length + ' chars)');
    changed = true;
  }
  if (!changed) { console.log('Nada que desplegar.'); return; }

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
