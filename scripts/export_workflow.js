// READ-ONLY del servidor: exporta el workflow vivo COMPLETO a n8n_workflow.json
// (snapshot fiel, incluye activeVersion/metadata). Despues correr build_workflow.js
// para normalizar a LF los 3 campos canonicos (buscar/presupuesto jsCode + AI Agent
// systemMessage) desde los dumps de scratch_live, y `npm test` para los guards.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'accept': 'application/json' };

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const res = await fetch(`${BASE}/workflows/${ID}`, { headers: H });
  if (!res.ok) throw new Error('GET fallo: ' + res.status + ' ' + (await res.text()));
  const wf = await res.json();
  const outPath = path.join(__dirname, '..', 'n8n_workflow.json');
  fs.writeFileSync(outPath, JSON.stringify(wf, null, 2) + '\n');
  console.log('exportado n8n_workflow.json | nodes:', (wf.nodes || []).length, '| versionCounter:', wf.versionCounter);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
