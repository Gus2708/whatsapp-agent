const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = 'http://localhost:5678/api/v1';
const env = fs.readFileSync('.env', 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

// El cuerpo del nodo Sanitize vive en scratch_live/live_sanitize.js, igual que
// live_buscar.js / live_presupuesto.js. Antes estaba embebido aqui como template
// literal, y eso ataba cualquier cambio del nodo a un PUT en vivo: no habia forma de
// editarlo sin desplegar. Ahora `node scripts/build_workflow.js` lo sincroniza en local
// y este script solo se usa cuando de verdad se quiere desplegar.
const SANITIZE_SRC = path.join(__dirname, '..', 'scratch_live', 'live_sanitize.js');
const newSanitizeJs = fs.readFileSync(SANITIZE_SRC, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');

(async () => {
  console.log('Obteniendo workflow desde n8n API...');
  const res = await fetch(`${BASE}/workflows/${ID}`, { headers: H });
  if (!res.ok) {
    throw new Error(`Error al consultar workflow: ${res.status} ${await res.text()}`);
  }
  const wf = await res.json();

  // 1. Blindar nodo AI Agent
  const aiNode = wf.nodes.find(n => n.name === 'AI Agent');
  if (!aiNode) {
    throw new Error('No se encontró el nodo AI Agent en el workflow');
  }
  aiNode.onError = 'continueRegularOutput';
  console.log('✅ Configurado onError: continueRegularOutput en AI Agent');

  // 2. Blindar nodo Sanitize Agent Output
  const sanitizeNode = wf.nodes.find(n => n.name === 'Sanitize Agent Output');
  if (!sanitizeNode) {
    throw new Error('No se encontró el nodo Sanitize Agent Output en el workflow');
  }
  sanitizeNode.parameters.jsCode = newSanitizeJs;
  console.log('✅ Actualizado código de Sanitize Agent Output para captura de errores y respuesta garantizada');

  // 3. Preparar settings permitidos
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  // 4. Guardar archivo local n8n_workflow.json
  fs.writeFileSync('n8n_workflow.json', JSON.stringify(wf, null, 2), 'utf8');
  console.log('✅ Guardado n8n_workflow.json en disco');

  // 5. Enviar PUT a la API de n8n
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const putRes = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  if (!putRes.ok) {
    throw new Error(`Error en PUT a n8n: ${putRes.status} ${await putRes.text()}`);
  }
  console.log('✅ Workflow actualizado exitosamente en n8n live (HTTP 200)');
})();
