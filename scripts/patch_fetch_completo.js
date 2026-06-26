// Fix: el fetch amplio por categoría traía solo `limit=60/30` SIN order, en orden
// arbitrario. Con 144 "tubo" (cap servidor=1000) los calibres baratos/disponibles/más
// vendidos (2x1 0.80 @10$ pos.111; 3x1 0.90 @14.5$) quedaban FUERA del lote -> el pool
// solo tenía calibres agotados -> el bot los cotizaba marcando "(Agotado)".
// Solución: traer la categoría COMPLETA (limit=1000) ordenada por existencia desc
// (disponibles primero, red de seguridad ante el cap de 1000). Idempotente y anclado.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const ORD = '&order=existencia.desc.nullslast';

// buscar_productos_tool: función ilike() — una sola línea de URL cubre todos los callers
const BUSCAR_OLD = "+(extra?('&'+extra):'')+'&limit='+(limit||30);";
const BUSCAR_NEW = "+(extra?('&'+extra):'')+'" + ORD + "&limit=1000';";

// hacer_presupuesto_tool: tres fetch en buscarUno (granel, categoría, fallback token)
const PRESU = [
  ["existencia&'+q+'&'+GRANEL_OR+'&limit=60'", "existencia&'+q+'&'+GRANEL_OR+'" + ORD + "&limit=1000'"],
  ["existencia&'+q+'&limit=60'",               "existencia&'+q+'" + ORD + "&limit=1000'"],
  ["existencia&'+q+'&limit=30'",               "existencia&'+q+'" + ORD + "&limit=1000'"],
];

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let changed = false;

  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') {
      let code = n.parameters.jsCode;
      if (code.includes(BUSCAR_NEW.slice(0, 40))) {
        console.log('· buscar_productos: ya parchado');
      } else if (code.includes(BUSCAR_OLD)) {
        code = code.split(BUSCAR_OLD).join(BUSCAR_NEW);
        console.log('✓ buscar_productos: fetch ilike -> categoría completa + order');
        changed = true;
      } else {
        console.log('AVISO: no encontré anchor en buscar_productos');
      }
      n.parameters.jsCode = code;
    }

    if (n.name === 'hacer_presupuesto_tool') {
      let code = n.parameters.jsCode;
      let applied = 0, already = 0;
      // Idempotencia por anchor VIEJO (único). Los newS de #2 y #3 coinciden,
      // así que chequear includes(newS) saltaría #3 por error.
      for (const [oldS, newS] of PRESU) {
        if (code.includes(oldS)) { code = code.split(oldS).join(newS); applied++; }
        else already++;
      }
      console.log(`· hacer_presupuesto: ${applied} aplicados, ${already} ya estaban`);
      if (applied > 0) changed = true;
      n.parameters.jsCode = code;
    }
  }

  if (!changed) { console.log('Sin cambios que aplicar (idempotente).'); return; }

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
