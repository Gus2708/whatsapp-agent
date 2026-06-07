// Refina la regla de negocio "cemento": generico = SOLO gris (CSC/Catatumbo);
// si especifican tipo (blanco / asfaltico-plastico / contacto-pega) muestra solo ese tipo.
// Reemplaza el filtro simple de "excluir contacto" por un filtro de tipo completo,
// en buscar_productos_tool y hacer_presupuesto_tool. Tambien ajusta el prompt del AI Agent.
const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';

const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
if (!key) { console.error('No N8N_API_KEY in .env'); process.exit(1); }
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const MARK = 'tipo de cemento solicitado';

const oldBuscar = `{ const nbq = norm(p_busqueda); if (qTokens.includes('cemento') && !nbq.includes('contacto') && !nbq.includes('pega')) { const filt = unicos.filter(p => !norm(p.descripcion).includes('contacto')); if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }`;
const newBuscar = `{ const nbq = norm(p_busqueda); if (qTokens.includes('cemento')) { let tipo='gris'; if(nbq.includes('blanco')) tipo='blanco'; else if(nbq.includes('asfalt')||nbq.includes('plastic')||nbq.includes('bituplast')||nbq.includes('edil')) tipo='plastico'; else if(nbq.includes('contacto')||nbq.includes('pega')) tipo='contacto'; const matchTipo=(d)=>{ d=norm(d); if(tipo==='blanco') return d.includes('blanco'); if(tipo==='plastico') return d.includes('plastico')||d.includes('bituplast')||d.includes('edil')||d.includes('asfalt'); if(tipo==='contacto') return d.includes('contacto')||d.includes('pega'); return d.includes('gris'); }; const filt = unicos.filter(p => matchTipo(p.descripcion)); if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }`;

const oldPresu = `{ const nbq = norm(nombre); if (qTokens.includes('cemento') && !nbq.includes('contacto') && !nbq.includes('pega')) { const filt = cand.filter(p => !norm(p.descripcion).includes('contacto')); if (filt.length>0) cand = filt; } }`;
const newPresu = `{ const nbq = norm(nombre); if (qTokens.includes('cemento')) { let tipo='gris'; if(nbq.includes('blanco')) tipo='blanco'; else if(nbq.includes('asfalt')||nbq.includes('plastic')||nbq.includes('bituplast')||nbq.includes('edil')) tipo='plastico'; else if(nbq.includes('contacto')||nbq.includes('pega')) tipo='contacto'; const matchTipo=(d)=>{ d=norm(d); if(tipo==='blanco') return d.includes('blanco'); if(tipo==='plastico') return d.includes('plastico')||d.includes('bituplast')||d.includes('edil')||d.includes('asfalt'); if(tipo==='contacto') return d.includes('contacto')||d.includes('pega'); return d.includes('gris'); }; const filt = cand.filter(p => matchTipo(p.descripcion)); if (filt.length>0) cand = filt; } }`;

const oldPromptLine = '- IMPORTANTE: "cemento" (de construccion: gris CSC, Catatumbo, blanco) NO es "Cemento Contacto / de Contacto" (es pega/adhesivo, ej. pega de zapato). Si piden "cemento" sin especificar, muestra SOLO cemento de construccion; NUNCA ofrezcas Cemento Contacto salvo que pidan explicitamente "pega" o "cemento de contacto".';
const newPromptLine = '- IMPORTANTE sobre "cemento" (segun el ' + MARK + '): si piden "cemento" a secas (sin decir tipo), muestra SOLO cemento GRIS de construccion (CSC, Catatumbo); NO ofrezcas Cemento Blanco, Cemento Plastico/Asfaltico ni Cemento Contacto. Si especifican el tipo ("cemento blanco", "cemento asfaltico"/"plastico", "cemento de contacto"/"pega"), muestra SOLO ese tipo especifico. "Cemento Contacto" es pega/adhesivo (pega de zapato): jamas lo ofrezcas salvo que lo pidan explicitamente.';

(async () => {
  const getRes = await fetch(`${BASE}/workflows/${ID}`, { headers: H });
  if (!getRes.ok) { console.error('GET failed', getRes.status, await getRes.text()); process.exit(1); }
  const wf = await getRes.json();
  const changed = [];

  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') {
      const code = n.parameters.jsCode;
      if (code.includes(oldBuscar)) {
        n.parameters.jsCode = code.replace(oldBuscar, newBuscar);
        changed.push('buscar_productos');
      } else if (code.includes(MARK)) {
        console.log('buscar_productos: ya tiene el patch nuevo, sin cambios');
      } else {
        console.log('buscar_productos: NO se encontro el bloque viejo (revisar)');
      }
    }

    if (n.name === 'hacer_presupuesto_tool') {
      const code = n.parameters.jsCode;
      if (code.includes(oldPresu)) {
        n.parameters.jsCode = code.replace(oldPresu, newPresu);
        changed.push('hacer_presupuesto');
      } else if (code.includes(MARK)) {
        console.log('hacer_presupuesto: ya tiene el patch nuevo, sin cambios');
      } else {
        console.log('hacer_presupuesto: NO se encontro el bloque viejo (revisar)');
      }
    }

    if (n.name === 'AI Agent') {
      const sm = n.parameters.options.systemMessage;
      if (sm.includes(oldPromptLine)) {
        n.parameters.options.systemMessage = sm.replace(oldPromptLine, newPromptLine);
        changed.push('prompt');
      } else if (sm.includes(MARK)) {
        console.log('prompt: ya tiene el texto nuevo, sin cambios');
      } else {
        console.log('prompt: NO se encontro la linea vieja (revisar)');
      }
    }
  }

  if (changed.length === 0) { console.log('Sin cambios (ya aplicados o no encontrados).'); return; }

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
