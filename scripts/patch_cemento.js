// Aplica cambios al workflow n8n via API REST (body limpio).
// 1) excluir "cemento contacto" (pega) cuando piden cemento de construccion
//    en buscar_productos y hacer_presupuesto
// 2) temperatura del modelo -> 0
// 3) refuerzo del prompt del AI Agent
const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';

const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
if (!key) { console.error('No N8N_API_KEY in .env'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const MARK = 'cemento contacto (pega/adhesivo)';

(async () => {
  const getRes = await fetch(`${BASE}/workflows/${ID}`, { headers: H });
  if (!getRes.ok) { console.error('GET failed', getRes.status, await getRes.text()); process.exit(1); }
  const wf = await getRes.json();
  const changed = [];

  for (const n of wf.nodes) {
    if (n.name === 'OpenRouter Chat Model') {
      n.parameters.options = n.parameters.options || {};
      if (n.parameters.options.temperature !== 0) { n.parameters.options.temperature = 0; changed.push('temperatura=0'); }
    }

    if (n.name === 'buscar_productos_tool') {
      const find = 'for(const p of res){ if(!seen.has(p.codigo_interno)){ seen.add(p.codigo_interno); unicos.push(p); } }';
      const code = n.parameters.jsCode;
      if (code.includes(find) && !code.includes(MARK)) {
        const ins = find + "\n// Regla negocio: " + MARK + " != cemento construccion\n{ const nbq = norm(p_busqueda); if (qTokens.includes('cemento') && !nbq.includes('contacto') && !nbq.includes('pega')) { const filt = unicos.filter(p => !norm(p.descripcion).includes('contacto')); if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }";
        n.parameters.jsCode = code.replace(find, ins);
        changed.push('buscar_productos');
      }
    }

    if (n.name === 'hacer_presupuesto_tool') {
      const find = '  if (cand.length===0) return null;';
      const code = n.parameters.jsCode;
      if (code.includes(find) && !code.includes(MARK)) {
        const ins = find + "\n  // Regla negocio: " + MARK + " != cemento construccion\n  { const nbq = norm(nombre); if (qTokens.includes('cemento') && !nbq.includes('contacto') && !nbq.includes('pega')) { const filt = cand.filter(p => !norm(p.descripcion).includes('contacto')); if (filt.length>0) cand = filt; } }";
        n.parameters.jsCode = code.replace(find, ins);
        changed.push('hacer_presupuesto');
      }
    }

    if (n.name === 'AI Agent') {
      const find = 'no ofrezcas "cepillo de alambre").';
      const sm = n.parameters.options.systemMessage;
      const add = "\n- IMPORTANTE: \"cemento\" (de construccion: gris CSC, Catatumbo, blanco) NO es \"Cemento Contacto / de Contacto\" (es pega/adhesivo, ej. pega de zapato). Si piden \"cemento\" sin especificar, muestra SOLO cemento de construccion; NUNCA ofrezcas Cemento Contacto salvo que pidan explicitamente \"pega\" o \"cemento de contacto\".";
      if (sm.includes(find) && !sm.includes('NO es \"Cemento Contacto')) {
        n.parameters.options.systemMessage = sm.replace(find, find + add);
        changed.push('prompt');
      }
    }
  }

  if (changed.length === 0) { console.log('Sin cambios (ya aplicados).'); return; }

  // La API publica solo acepta ciertas claves en settings; filtramos el resto (ej. binaryMode)
  const allowedSettings = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cleanSettings = {};
  for (const k of allowedSettings) { if (wf.settings && wf.settings[k] !== undefined) cleanSettings[k] = wf.settings[k]; }
  if (cleanSettings.executionOrder === undefined) cleanSettings.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cleanSettings };
  const putRes = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  const txt = await putRes.text();
  console.log('Cambios:', changed.join(', '));
  console.log('PUT status:', putRes.status);
  if (!putRes.ok) console.log('Resp:', txt.slice(0, 500));
  else console.log('OK actualizado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
