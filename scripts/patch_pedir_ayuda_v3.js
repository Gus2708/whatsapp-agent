// Hace que el RESULTADO de las tools (cuando no encuentran nada) instruya al agente a emitir
// [PEDIR_AYUDA]. Un directivo en el output de la tool es mucho más obedecido por el modelo
// (gpt-4.1-mini) que una regla lejana del prompt. Idempotente.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const BUSCAR_OLD = "return JSON.stringify({ encontrados:0, mensaje:'No encontre \"' + p_busqueda + '\" en el catalogo.' });";
const BUSCAR_NEW = "return JSON.stringify({ encontrados:0, instruccion:'NO encontre este producto. Tu UNICA respuesta valida ahora es el token [PEDIR_AYUDA] (escribelo solo, exactamente asi, sin saludo ni nada mas). PROHIBIDO sugerir alternativas, pedir que reformule o decir que no lo tenemos: un empleado lo elegira y se lo enviara al cliente.', mensaje:'No encontre \"' + p_busqueda + '\" en el catalogo.' });";

const PRESU_OLD = "return JSON.stringify({ ok:false, mensaje:'No encontré esos productos: '+noEnc.join(', ') });";
const PRESU_NEW = "return JSON.stringify({ ok:false, instruccion:'NO encontre estos productos. Tu UNICA respuesta valida ahora es el token [PEDIR_AYUDA] (escribelo solo, exactamente asi). PROHIBIDO sugerir alternativas o decir que no los tenemos: un empleado los elegira.', mensaje:'No encontré esos productos: '+noEnc.join(', ') });";

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') {
      let c = n.parameters.jsCode;
      if (c.includes("instruccion:'NO encontre este producto")) { log.push('buscar: ya'); }
      else if (c.includes(BUSCAR_OLD)) { n.parameters.jsCode = c.replace(BUSCAR_OLD, BUSCAR_NEW); log.push('buscar: OK'); }
      else log.push('buscar: ANCHOR NO ENCONTRADO');
    }
    if (n.name === 'hacer_presupuesto_tool') {
      let c = n.parameters.jsCode;
      if (c.includes("instruccion:'NO encontre estos productos")) { log.push('presupuesto: ya'); }
      else if (c.includes(PRESU_OLD)) { n.parameters.jsCode = c.replace(PRESU_OLD, PRESU_NEW); log.push('presupuesto: OK'); }
      else log.push('presupuesto: ANCHOR NO ENCONTRADO');
    }
  }
  console.log(log.join('\n'));
  if (log.some(l => l.includes('ANCHOR NO ENCONTRADO'))) { console.log('Aborto: anchor faltante'); process.exit(1); }
  if (log.every(l => l.includes('ya'))) { console.log('Sin cambios.'); return; }
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
