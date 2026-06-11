// READ-ONLY: vuelca el código realmente desplegado en n8n para auditarlo.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

(async () => {
  const out = path.join(__dirname, '..', 'scratch_live');
  fs.mkdirSync(out, { recursive: true });
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const summary = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') {
      fs.writeFileSync(path.join(out, 'live_buscar.js'), n.parameters.jsCode, 'utf8');
      summary.push('buscar len=' + n.parameters.jsCode.length);
    }
    if (n.name === 'hacer_presupuesto_tool') {
      fs.writeFileSync(path.join(out, 'live_presupuesto.js'), n.parameters.jsCode, 'utf8');
      summary.push('presupuesto len=' + n.parameters.jsCode.length);
    }
    if (n.name === 'AI Agent') {
      fs.writeFileSync(path.join(out, 'live_systemMessage.txt'), n.parameters.options.systemMessage || '', 'utf8');
      summary.push('systemMessage len=' + (n.parameters.options.systemMessage || '').length);
    }
  }
  // huellas rápidas
  const presu = fs.readFileSync(path.join(out, 'live_presupuesto.js'), 'utf8');
  console.log('NODES:', wf.nodes.map(n => n.name).join(', '));
  console.log(summary.join(' | '));
  console.log('--- huellas en hacer_presupuesto desplegado ---');
  console.log('tiene medPresent:', presu.includes('function medPresent'));
  console.log('tiene normMedida:', presu.includes('function normMedida'));
  console.log('tiene alts/alternativas:', presu.includes('alternativas_texto'));
  console.log('version comment:', (presu.split('\n')[0] || '').slice(0, 90));
  console.log('filtra existencia gt.0 en buscarUno:', presu.includes('existencia=gt.0'));
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
