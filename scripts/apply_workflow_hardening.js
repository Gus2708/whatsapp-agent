// Deploy the canonical workflow to the live n8n instance.
//
// Direction of truth is ONE WAY: scratch_live/* -> n8n_workflow.json -> n8n.
//
// This script used to GET the live workflow, mutate two nodes in memory, and write the
// result back over n8n_workflow.json. That silently published production on top of
// staging: on 2026-09-09 it reverted a staged matcher (credential guard + LÁMINA fix)
// while deploying only the Sanitize node, and nothing flagged it. It never writes the
// local file any more, and it refuses to run if the file has drifted from scratch_live.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = 'http://localhost:5678/api/v1';
const ROOT = path.join(__dirname, '..');

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const keyMatch = env.match(/^N8N_API_KEY=(.+)$/m);
if (!keyMatch) throw new Error('Falta N8N_API_KEY en .env');
const H = {
  'X-N8N-API-KEY': keyMatch[1].trim(),
  'Content-Type': 'application/json',
  accept: 'application/json',
};

// Preflight: no se despliega staging que no case con los fuentes canonicos. Si esto
// falla, correr `node scripts/build_workflow.js` y revisar el diff antes de insistir.
console.log('Verificando que n8n_workflow.json este en sync con scratch_live...');
execFileSync(process.execPath, [path.join(__dirname, 'check_workflow_sync.js')], {
  stdio: 'inherit',
});

const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n_workflow.json'), 'utf8'));

// El blindaje anti-crash del AI Agent es parte del contrato desplegado; check_workflow_sync
// ya lo afirma, esto solo evita publicar un archivo manipulado a mano.
const aiNode = wf.nodes.find((n) => n.name === 'AI Agent');
if (!aiNode) throw new Error('No se encontró el nodo AI Agent en n8n_workflow.json');
if (aiNode.onError !== 'continueRegularOutput') {
  throw new Error('AI Agent perdió onError=continueRegularOutput — abortado, no se despliega');
}
if (!wf.nodes.some((n) => n.name === 'Sanitize Agent Output')) {
  throw new Error('No se encontró el nodo Sanitize Agent Output en n8n_workflow.json');
}

// La API de n8n solo acepta este subconjunto de settings en el PUT.
const ALLOWED = [
  'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
  'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
];

(async () => {
  // Se consulta lo vivo solo para informar del cambio; NO se usa como fuente.
  let antes = null;
  try {
    const res = await fetch(`${BASE}/workflows/${ID}`, { headers: H });
    if (res.ok) antes = await res.json();
  } catch (e) {
    console.warn('Aviso: no se pudo leer el estado previo:', e.message);
  }
  if (antes) {
    const codeDe = (w, nombre) => {
      const n = w.nodes.find((x) => (x.parameters || {}).name === nombre);
      return n ? n.parameters.jsCode : '';
    };
    for (const nombre of ['buscar_productos', 'hacer_presupuesto']) {
      const cambia = codeDe(antes, nombre) !== codeDe(wf, nombre);
      console.log(`  ${nombre}: ${cambia ? 'SE ACTUALIZA' : 'sin cambios'}`);
    }
  }

  const cs = {};
  for (const k of ALLOWED) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const putRes = await fetch(`${BASE}/workflows/${ID}`, {
    method: 'PUT', headers: H, body: JSON.stringify(body),
  });
  if (!putRes.ok) {
    throw new Error(`Error en PUT a n8n: ${putRes.status} ${await putRes.text()}`);
  }
  console.log('✅ Workflow desplegado en n8n live (HTTP 200). n8n_workflow.json NO se tocó.');
})();
