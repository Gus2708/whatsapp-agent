// Conecta la escalación del bot a la cola 'atenciones_pendientes':
// agrega un nodo Code que inserta al cliente en espera (la app de empleados se entera por Realtime).
// Se cuelga en PARALELO de "Set Chat Manual" (no altera el envío del mensaje de handover).
// Idempotente: si el nodo ya existe, no lo duplica.
const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const NODE_NAME = 'Registrar Atencion Pendiente';
const SOURCE_NODE = 'Set Chat Manual';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';

const jsCode = [
  "// Encola al cliente en atenciones_pendientes cuando escala a un empleado.",
  "// La app de empleados se entera por Realtime. Dedup: una sola atencion 'pendiente' por telefono.",
  "const axios = require('axios');",
  "const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';",
  "const ANON = '" + ANON + "';",
  "const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };",
  "let telefono = null, motivo = null;",
  "try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}",
  "try { motivo = ($('Webhook Trigger').first().json.body.payload.body || '').toString().slice(0, 300) || null; } catch (e) {}",
  "try {",
  "  if (telefono) {",
  "    const ex = await axios.get(SB + '/rest/v1/atenciones_pendientes?status=eq.pendiente&select=id&telefono=eq.' + encodeURIComponent(telefono), { headers: H });",
  "    if (!ex.data || ex.data.length === 0) {",
  "      let nombre = null;",
  "      try { const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=eq.' + encodeURIComponent(telefono), { headers: H }); nombre = (c.data && c.data[0] && c.data[0].nombre) || null; } catch (e) {}",
  "      await axios.post(SB + '/rest/v1/atenciones_pendientes', { telefono, nombre, motivo, status: 'pendiente' }, { headers: H });",
  "    }",
  "  }",
  "} catch (e) {}",
  "return [{ json: $json }];",
].join('\n');

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();

  if (!wf.nodes.some(n => n.name === SOURCE_NODE)) throw new Error('no encontre el nodo "' + SOURCE_NODE + '"');

  let nodeChanged = false;
  if (!wf.nodes.some(n => n.name === NODE_NAME)) {
    const src = wf.nodes.find(n => n.name === SOURCE_NODE);
    const pos = src && src.position ? [src.position[0] + 8, src.position[1] - 150] : [1700, 112];
    wf.nodes.push({
      parameters: { jsCode },
      id: 'code_registrar_atencion_node',
      name: NODE_NAME,
      position: pos,
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      onError: 'continueRegularOutput',
    });
    nodeChanged = true;
  }

  // conectar Set Chat Manual -> Registrar Atencion Pendiente (en paralelo, sin tocar lo existente)
  wf.connections[SOURCE_NODE] = wf.connections[SOURCE_NODE] || { main: [[]] };
  wf.connections[SOURCE_NODE].main = wf.connections[SOURCE_NODE].main || [[]];
  wf.connections[SOURCE_NODE].main[0] = wf.connections[SOURCE_NODE].main[0] || [];
  let connChanged = false;
  if (!wf.connections[SOURCE_NODE].main[0].some(c => c.node === NODE_NAME)) {
    wf.connections[SOURCE_NODE].main[0].push({ node: NODE_NAME, type: 'main', index: 0 });
    connChanged = true;
  }

  console.log('nodo:', nodeChanged ? 'AGREGADO' : 'ya existe', '| conexion:', connChanged ? 'AGREGADA' : 'ya existe');
  if (!nodeChanged && !connChanged) { console.log('Sin cambios (idempotente).'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
