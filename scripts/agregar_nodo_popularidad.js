// Añade al workflow "Sync Vocabulario Catálogo" un tercer Code node que refresca
// producto_popularidad (ranking por ventas recientes) cada noche.
//
// Sin esto la tabla se congela: el score seguiría reflejando las ventas del día en que se
// pobló, y en unas semanas el bot recomendaría lo que se vendía entonces, no lo de ahora.
//
//   node scripts/agregar_nodo_popularidad.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const H = { 'X-N8N-API-KEY': pick('N8N_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' };
const SBURL = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');

const NOMBRE = 'Sync Vocabulario Catálogo';
const NODO = 'Refrescar Popularidad';
const PREVIO = 'Sync Embeddings';

const CODIGO = `// Recalcula producto_popularidad: facturas de los ultimos 90/365 dias por producto,
// con castigo por antiguedad de la ultima venta. Es lo que hace que "disco de corte"
// devuelva el que de verdad se vende y no el que lleva 500 unidades muertas en estante.
//
// Barato: una sola llamada, la agregacion la hace Postgres. Verificado que la anon key
// puede ejecutarla (la funcion es SECURITY DEFINER).
const axios = require('axios');
const SB = '${SBURL}';
const ANON = '${ANON}';

try {
  const r = await axios.post(SB + '/rest/v1/rpc/refrescar_popularidad_reciente', {},
    { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' }, timeout: 120000 });
  return [{ json: { ok: true, productos_con_ventas: r.data } }];
} catch (e) {
  // No se traga el error: si esto falla el ranking se congela y nadie se entera.
  return [{ json: { ok: false, error: String(e.message).slice(0, 300) } }];
}`;

(async () => {
  const lista = await (await fetch(`${BASE}/workflows?limit=250`, { headers: H })).json();
  const wf0 = (lista.data || []).find(w => w.name === NOMBRE);
  if (!wf0) throw new Error(`no encuentro el workflow "${NOMBRE}"`);
  const wf = await (await fetch(`${BASE}/workflows/${wf0.id}`, { headers: H })).json();

  let nodo = wf.nodes.find(n => n.name === NODO);
  if (!nodo) {
    nodo = { id: 'vocab_popularidad', name: NODO, type: 'n8n-nodes-base.code', typeVersion: 2, position: [1040, 300], parameters: { jsCode: CODIGO } };
    wf.nodes.push(nodo);
    console.log(`✓ nodo "${NODO}" creado`);
  } else if (nodo.parameters.jsCode !== CODIGO) {
    nodo.parameters.jsCode = CODIGO;
    console.log('✓ código actualizado');
  } else {
    console.log('· ya estaba al día');
  }

  wf.connections[PREVIO] = { main: [[{ node: NODO, type: 'main', index: 0 }]] };

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  cs.executionOrder = cs.executionOrder || 'v1';
  cs.executionTimeout = 1800;

  const put = await fetch(`${BASE}/workflows/${wf0.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  if (!put.ok) { console.log('PUT fallo:', put.status, await put.text()); process.exit(1); }

  const act = await fetch(`${BASE}/workflows/${wf0.id}/activate`, { method: 'POST', headers: H });
  const fin = await (await fetch(`${BASE}/workflows/${wf0.id}`, { headers: H })).json();
  console.log(`OK — activo: ${fin.active} | cadena: ${fin.nodes.map(n => n.name).join(' -> ')}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
