// Fix 1: "calibre XX" -> "cal XX" en SIN (los productos usan "CAL.30", no "CALIBRE 30")
// Fix 2: "color" a IGNORED (es descriptor, no parte del nombre del producto)
// Fix 3: system message — prohibir texto previo al tool call ("dame un momentico...")
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

// ── buscar_productos fixes ──────────────────────────────────────────────────

// Fix 1: añadir 'calibre':'cal' al SIN map
const SIN_ANCHOR = "'rieles':'tubo herreria','riel':'tubo herreria',";
const SIN_NEW    = "'calibre':'cal','cal.':'cal',\n  'rieles':'tubo herreria','riel':'tubo herreria',";

// Fix 2: añadir 'color' a IGNORED
const IGNORED_ANCHOR = "'rollo', 'rollos', 'saco', 'sacos',";
const IGNORED_NEW    = "'color',\n  'rollo', 'rollos', 'saco', 'sacos',";

// ── system message fix ─────────────────────────────────────────────────────

// Fix 3: reforzar la regla de búsqueda con prohibición explícita de texto previo
const SM_ANCHOR = 'REGLA ABSOLUTA (la más importante): para CUALQUIER pregunta sobre un producto, precio, disponibilidad o cotización, es OBLIGATORIO llamar la herramienta (buscar_productos o hacer_presupuesto) ANTES de responder. JAMÁS des un precio de tu memoria, JAMÁS inventes cifras ni nombres. Si respondes sin llamar la herramienta, estarás dando datos FALSOS al cliente y eso está terminantemente prohibido. Solo reporta lo que la herramienta devuelve.';
const SM_NEW    = 'REGLA ABSOLUTA (la más importante): para CUALQUIER pregunta sobre un producto, precio, disponibilidad o cotización, es OBLIGATORIO llamar la herramienta (buscar_productos o hacer_presupuesto) ANTES de responder. JAMÁS des un precio de tu memoria, JAMÁS inventes cifras ni nombres. Si respondes sin llamar la herramienta, estarás dando datos FALSOS al cliente y eso está terminantemente prohibido. Solo reporta lo que la herramienta devuelve.\nPROHIBIDO ABSOLUTO: NUNCA generes texto ANTES de llamar la herramienta. No escribas "dame un momentico", "déjame confirmarlo", "espera un instante", "voy a verificar", "déjame revisar" ni ninguna frase de transición previa. La herramienta es instantánea para el cliente; tu PRIMER OUTPUT ante cualquier consulta de producto debe ser la llamada directa a la herramienta, sin texto previo de ningún tipo.';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let changed = false;

  for (const n of wf.nodes) {
    // ── buscar_productos_tool ────────────────────────────────────────────
    if (n.name === 'buscar_productos_tool') {
      let code = n.parameters.jsCode;

      // Fix 1: calibre -> cal
      if (code.includes(SIN_NEW.split('\n')[0])) {
        console.log('· Fix 1 (calibre) ya estaba aplicado');
      } else if (code.includes(SIN_ANCHOR)) {
        code = code.replace(SIN_ANCHOR, SIN_NEW);
        console.log('✓ Fix 1 aplicado: calibre -> cal en SIN');
        changed = true;
      } else {
        console.log('AVISO: no encontré anchor SIN para calibre');
      }

      // Fix 2: 'color' a IGNORED
      if (code.includes("'color',")) {
        console.log('· Fix 2 (color en IGNORED) ya estaba aplicado');
      } else if (code.includes(IGNORED_ANCHOR)) {
        code = code.replace(IGNORED_ANCHOR, IGNORED_NEW);
        console.log('✓ Fix 2 aplicado: "color" añadido a IGNORED');
        changed = true;
      } else {
        console.log('AVISO: no encontré anchor IGNORED para color');
      }

      n.parameters.jsCode = code;
    }

    // ── AI Agent (system message) ────────────────────────────────────────
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;

      if (sm.includes('PROHIBIDO ABSOLUTO: NUNCA generes texto ANTES de llamar la herramienta')) {
        console.log('· Fix 3 (no momentico) ya estaba aplicado');
      } else if (sm.includes(SM_ANCHOR)) {
        sm = sm.replace(SM_ANCHOR, SM_NEW);
        console.log('✓ Fix 3 aplicado: prohibición de texto previo al tool call');
        changed = true;
      } else {
        console.log('AVISO: no encontré anchor en system message para fix 3');
      }

      n.parameters.options.systemMessage = sm;
      console.log('systemMessage length:', sm.length);
    }
  }

  if (!changed) { console.log('Sin cambios que aplicar.'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK — workflow actualizado en n8n.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
