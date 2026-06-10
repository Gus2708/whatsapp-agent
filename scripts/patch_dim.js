// Despliega el fix de DIMENSIONES de perfiles (tubo/angulo/lamina) al workflow n8n:
//   - medPresent(): pares AxB order-independent (40x100 == 100x40) + match de 2da dimension
//   - hacer_presupuesto: si el match exacto esta AGOTADO, ofrece sustitutos DISPONIBLES de la misma familia
//   - (norm × -> x ya venia del fix de rieles; aqui queda como no-op)
// Usa la MISMA biblioteca verificada (_dimfix_lib.applyFixes) para que lo desplegado == lo probado.
// Idempotente y anclado (si un anchor falta, aborta sin desplegar).
const fs = require('fs');
const path = require('path');
const { applyFixes } = require('./_dimfix_lib');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const out = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') {
      const r = applyFixes(n.parameters.jsCode, 'buscar'); n.parameters.jsCode = r.code; out.push('buscar: ' + r.log.join(' '));
    }
    if (n.name === 'hacer_presupuesto_tool') {
      const r = applyFixes(n.parameters.jsCode, 'presupuesto'); n.parameters.jsCode = r.code; out.push('presupuesto: ' + r.log.join(' '));
    }
  }
  console.log(out.join('\n'));

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
