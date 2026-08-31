const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// patch_handover_empleado.js
// Handoff humano: cuando un EMPLEADO le escribe al cliente desde el mismo WhatsApp
// de la tienda, el bot se calla (estado 'manual') y solo retoma tras 30 min sin
// respuesta al cliente.
//
// Cambios en el workflow en vivo:
//   1. Nuevo IF "¿Mensaje Saliente?" tras el Webhook: rutea los fromMe al detector.
//   2. Nuevo code "Detectar Handoff Empleado": distingue bot vs humano y marca 'manual'.
//   3. "Check Chat Session": reactivación automática tras 30 min (lee manual_since).
//   4. "Set Chat Manual": ahora también setea manual_since (escalación coherente).
//   5. "Sanitize Agent Output": registra en mensajes_bot lo que envía el bot.
//
// Requiere (ya aplicado por migración): chat_sessions.manual_since + tabla mensajes_bot.
// Requiere además cambiar WAHA a WHATSAPP_HOOK_EVENTS=message.any (docker-compose).
const fs = require('fs');
const path = require('path');

const N8N_URL = 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';

const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');

// ---------- código nuevo de los nodos ----------

const CHECK_SESSION_CODE = `// Check Chat Session via Supabase REST (reemplaza el nodo Postgres roto).
// Upsert por telefono con rate-limit por ventana de 60s. Devuelve {estado, msg_count, telefono}.
// Reactivación automática: si un humano tomó el chat pero lleva >30 min sin escribirle
// al cliente, el bot vuelve a responder solo.
const axios = require('axios');
const SB = '${SB}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
const REACTIVAR_MS = 30 * 60 * 1000; // 30 min sin respuesta al cliente -> el bot retoma
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
let estado = 'automatico', msg_count = 1;
try {
  if (telefono) {
    const r = await axios.get(SB + '/rest/v1/chat_sessions?telefono=eq.' + encodeURIComponent(telefono) + '&select=estado,msg_count,window_start,manual_since', { headers: H });
    const row = r.data && r.data[0];
    const now = Date.now();
    let window_start;
    let reactivar = false;
    if (row) {
      estado = row.estado || 'automatico';
      if (estado === 'manual') {
        const ms = row.manual_since ? new Date(row.manual_since).getTime() : 0;
        if (!ms || (now - ms > REACTIVAR_MS)) { estado = 'automatico'; reactivar = true; }
      }
      const ws = row.window_start ? new Date(row.window_start).getTime() : 0;
      if (now - ws > 60000) { msg_count = 1; window_start = new Date().toISOString(); }
      else { msg_count = (Number(row.msg_count) || 0) + 1; window_start = row.window_start; }
    } else {
      msg_count = 1; window_start = new Date().toISOString();
    }
    const up = { telefono, estado, msg_count, window_start, updated_at: new Date().toISOString() };
    if (reactivar) up.manual_since = null;
    await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', up, { headers: H });
  }
} catch (e) {}
return [{ json: { estado, msg_count, telefono } }];`;

const SET_MANUAL_CODE = `// Set Chat Manual via Supabase REST (reemplaza el nodo Postgres roto).
// Marca la sesion del cliente como 'manual' para que el bot deje de responder (lo atiende un humano).
// manual_since permite reactivar el bot solo tras 30 min de silencio (ver Check Chat Session).
const axios = require('axios');
const SB = '${SB}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
try { if (telefono) { await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono, estado: 'manual', manual_since: new Date().toISOString(), updated_at: new Date().toISOString() }, { headers: H }); } } catch (e) {}
return [{ json: $json }];`;

const DETECTOR_CODE = `// Detecta cuando un EMPLEADO le escribe al cliente desde el mismo WhatsApp de la tienda.
// Los salientes (fromMe) del propio BOT se ignoran comparándolos contra mensajes_bot y
// contra las plantillas fijas; cualquier otro saliente = un humano tomó el chat -> 'manual'.
const axios = require('axios');
const SB = '${SB}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
const norm = (t) => String(t || '').toLowerCase().replace(/\\*/g, '').replace(/\\s+/g, ' ').trim().slice(0, 300);
// Plantillas fijas que envía el bot (si cambian en los nodos Send*, actualizarlas aquí).
const PLANTILLAS_BOT = [
  norm('En un momento uno de nuestros asesores comerciales continuará atendiéndote de forma personalizada. ¡Muchas gracias por tu paciencia!'),
  norm('Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚'),
].filter(Boolean);
const CATCHUP = norm('🙏 ¡Disculpa la demora! Ya estoy de vuelta en línea 🪚');

let payload = null;
try { payload = $('Webhook Trigger').first().json.body.payload; } catch (e) {}
if (!payload) return [{ json: { skip: 'sin_payload' } }];

// En un saliente el cliente es el destinatario (to). Fallback defensivo a from.
const cliente = payload.to || payload.from || null;
console.log('[Handoff] saliente to=' + payload.to + ' from=' + payload.from + ' id=' + payload.id);

// Solo chats 1:1 de clientes (ignorar grupos, difusión, estados y newsletters).
if (!cliente || /@g\\.us|@broadcast|@newsletter/.test(cliente)) {
  return [{ json: { skip: 'no_cliente', cliente } }];
}

let texto = '';
try { texto = payload.body || (payload._data && payload._data.body) || ''; } catch (e) {}
let ntext = norm(texto);
if (CATCHUP && ntext.startsWith(CATCHUP)) ntext = ntext.slice(CATCHUP.length).trim();

let esBot = false;
if (ntext) {
  for (const tpl of PLANTILLAS_BOT) {
    if (ntext === tpl || ntext.includes(tpl) || tpl.includes(ntext)) { esBot = true; break; }
  }
  if (!esBot) {
    try {
      const since = new Date(Date.now() - 10 * 60000).toISOString();
      const r = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=eq.' + encodeURIComponent(cliente) + '&created_at=gte.' + since + '&select=texto_norm&order=created_at.desc&limit=20', { headers: H, timeout: 3000 });
      for (const rw of (r.data || [])) {
        const s = rw.texto_norm || '';
        if (s && (s === ntext || s.includes(ntext) || ntext.includes(s))) { esBot = true; break; }
      }
    } catch (e) {}
  }
}

if (esBot) return [{ json: { esBot: true, cliente } }];

// Un humano escribió al cliente -> callar al bot y registrar cuándo.
try {
  await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono: cliente, estado: 'manual', manual_since: new Date().toISOString(), updated_at: new Date().toISOString() }, { headers: H });
  console.log('[Handoff] EMPLEADO tomó el chat ' + cliente + ' -> manual');
} catch (e) {}
return [{ json: { esBot: false, handoff: true, cliente } }];`;

// Bloque que se inyecta en "Sanitize Agent Output" justo antes de `return items;`
const OUTBOX_SNIPPET = `
// [handoff] Registrar lo que envía el bot para distinguirlo de un empleado.
try {
  const _norm = (t) => String(t || '').toLowerCase().replace(/\\*/g, '').replace(/\\s+/g, ' ').trim().slice(0, 300);
  if (telefono) {
    for (const _it of items) {
      const _t = _it && _it.json ? _it.json.output : null;
      if (_t) { try { await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: telefono, texto_norm: _norm(_t) }, { headers: H }); } catch (e) {} }
    }
  }
} catch (e) {}
`;

async function main() {
  if (!API_KEY) throw new Error('N8N_API_KEY no está en el entorno ni en ../.env');
  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`GET falló: ${res.status} ${await res.text()}`);
  const wf = await res.json();
  const byName = (n) => wf.nodes.find((x) => x.name === n);

  // --- 3) Check Chat Session ---
  const cs = byName('Check Chat Session');
  if (!cs) throw new Error('Falta "Check Chat Session"');
  cs.parameters.jsCode = CHECK_SESSION_CODE;

  // --- 4) Set Chat Manual ---
  const scm = byName('Set Chat Manual');
  if (!scm) throw new Error('Falta "Set Chat Manual"');
  scm.parameters.jsCode = SET_MANUAL_CODE;

  // --- 5) Sanitize Agent Output: inyectar outbox ---
  const san = byName('Sanitize Agent Output');
  if (!san) throw new Error('Falta "Sanitize Agent Output"');
  if (!san.parameters.jsCode.includes('[handoff] Registrar')) {
    const idx = san.parameters.jsCode.lastIndexOf('return items;');
    if (idx < 0) throw new Error('No encontré "return items;" en Sanitize Agent Output');
    san.parameters.jsCode = san.parameters.jsCode.slice(0, idx) + OUTBOX_SNIPPET + '\n' + san.parameters.jsCode.slice(idx);
  } else {
    console.log('Sanitize ya tenía el outbox — no se reinyecta.');
  }

  // --- 1) IF "¿Mensaje Saliente?" (clona la estructura de un IF existente) ---
  const ifTmpl = byName('Es Cliente Real?');
  const webhook = byName('Webhook Trigger');
  const esCliente = byName('Es Cliente Real?');
  const detectorName = 'Detectar Handoff Empleado';
  const ifName = '¿Mensaje Saliente?';

  if (!byName(ifName)) {
    const ifNode = JSON.parse(JSON.stringify(ifTmpl));
    ifNode.id = 'if_saliente_node';
    ifNode.name = ifName;
    ifNode.position = [ -120, 460 ];
    ifNode.parameters.conditions.conditions = [{
      id: 'c_fromme_out',
      leftValue: '={{ $json.body.payload ? $json.body.payload.fromMe : ($json.body.fromMe || false) }}',
      rightValue: true,
      operator: { type: 'boolean', operation: 'equals' },
    }];
    wf.nodes.push(ifNode);
  }

  // --- 2) Code "Detectar Handoff Empleado" (clona la estructura de un code existente) ---
  if (!byName(detectorName)) {
    const codeNode = JSON.parse(JSON.stringify(cs)); // ya trae el jsCode nuevo; lo pisamos
    codeNode.id = 'detector_handoff_node';
    codeNode.name = detectorName;
    codeNode.position = [ 112, 560 ];
    codeNode.parameters = { jsCode: DETECTOR_CODE };
    wf.nodes.push(codeNode);
  }

  // --- Reconexiones ---
  const C = wf.connections;
  // Webhook -> ¿Mensaje Saliente?  (en vez de -> Es Cliente Real?)
  C['Webhook Trigger'] = { main: [[{ node: ifName, type: 'main', index: 0 }]] };
  // ¿Mensaje Saliente?  true -> detector ; false -> Es Cliente Real?
  C[ifName] = { main: [
    [{ node: detectorName, type: 'main', index: 0 }],
    [{ node: 'Es Cliente Real?', type: 'main', index: 0 }],
  ] };
  // detector -> Descartar
  C[detectorName] = { main: [[{ node: 'Descartar', type: 'main', index: 0 }]] };

  // --- PUT ---
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const settings = {};
  for (const k of allowed) if (wf.settings?.[k] !== undefined) settings[k] = wf.settings[k];
  if (!settings.executionOrder) settings.executionOrder = 'v1';

  const put = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings }),
  });
  if (!put.ok) throw new Error(`PUT falló: ${put.status} ${await put.text()}`);
  const updated = await put.json();

  // --- Verificación ---
  const has = (n) => updated.nodes.some((x) => x.name === n);
  const ok = has(ifName) && has(detectorName)
    && updated.connections['Webhook Trigger'].main[0][0].node === ifName
    && updated.connections[ifName].main[1][0].node === 'Es Cliente Real?'
    && updated.nodes.find((x) => x.name === 'Check Chat Session').parameters.jsCode.includes('REACTIVAR_MS')
    && updated.nodes.find((x) => x.name === 'Sanitize Agent Output').parameters.jsCode.includes('[handoff] Registrar');
  console.log(ok ? '✅ Patch aplicado y verificado.' : '⚠️ Patch aplicado pero la verificación no cuadra — revisar.');
  console.log('Nodos:', updated.nodes.length,
    '| ¿Mensaje Saliente?:', has(ifName),
    '| Detector:', has(detectorName));
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
