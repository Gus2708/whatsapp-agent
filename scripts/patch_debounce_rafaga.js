const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// patch_debounce_rafaga.js
// El cliente manda 2-3 mensajes seguidos ("hola" / "tienen cemento?" / "gris"). Cada uno
// abre su propia ejecucion en paralelo, ninguna ve a las otras, y el cliente recibe varias
// respuestas. Medido en mensajes_bot: 8 casos de doble respuesta con saludo completo,
// separados por 1-13 segundos (chat ...34@lid llego a tres seguidas el 6-ago).
//
// El rate-limit que ya existia NO cubre esto: corta a mas de 10 mensajes en 60s, es un
// anti-flood. Una rafaga de 2-3 pasa entera.
//
// Fix: nodo "Debounce Rafaga" entre "Filtro Anti-Duplicado" y "Transcribir Nota de Voz".
// Espera unos segundos y solo sobrevive la ULTIMA ejecucion de la rafaga; esa recoge los
// mensajes que quedaron sin responder y se los pasa al agente como contexto, para no perder
// lo que el cliente escribio antes ("necesito cemento" + "gris" tiene que llegar junto).
//
// Va ANTES de la transcripcion a proposito: los nodos de aguas abajo leen el payload via
// $('Transcribir Nota de Voz'), asi que cualquier cosa que se escriba despues de ese nodo
// seria invisible para ellos.
//
// setTimeout verificado en el sandbox del nodo Code de esta instancia (typeof 'function',
// durmio 1504ms reales) antes de escribir esto.
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';
const NOMBRE = 'Debounce Ráfaga';

const CODIGO = String.raw`// "Debounce Ráfaga": el cliente suele escribir en varios mensajes seguidos. Cada mensaje
// abre su propia ejecución y ninguna ve a las otras, así que respondía a todas por separado
// (8 casos medidos, con el saludo completo repetido). Aquí esperamos un momento y solo
// sobrevive la ÚLTIMA ejecución de la ráfaga, que se lleva los mensajes previos sin
// responder como contexto. Ante cualquier error deja pasar el mensaje tal cual: nunca
// puede callar al bot por su cuenta.
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const ESPERA_MS = 7000;   // cubre 7 de los 8 huecos observados (1,1,1,3,3,4,5 y 13 s)
const MAX_PREVIOS = 5;

const out = [];
for (const it of $input.all()) {
  const item = it.json || {};
  const payload = (item.body && item.body.payload) || {};
  const chatId = payload.from || null;
  const msgId = String(payload.id || '');
  if (!chatId || !msgId) { out.push({ json: item }); continue; }

  try { await new Promise(r => setTimeout(r, ESPERA_MS)); } catch (e) {}

  let superado = false;
  try {
    const u = await axios.get(SB + '/rest/v1/mensajes_procesados?chat_id=eq.' + encodeURIComponent(chatId) + '&select=message_id,procesado_at,texto&order=procesado_at.desc&limit=' + (MAX_PREVIOS + 1), { headers: H, timeout: 5000 });
    const filas = u.data || [];
    const idx = filas.findIndex(f => String(f.message_id) === msgId);
    // idx === -1: no me veo en la lista (fallo el insert, o llego una avalancha). Ante la
    // duda respondo: callarme por error es peor que responder de mas, y el rate-limit ya
    // corta las avalanchas de verdad.
    if (idx > 0) {
      superado = true;
      console.log('[Ráfaga] ' + chatId + ': llegó algo más nuevo, esta ejecución se calla');
    } else if (idx === 0) {
      // Soy el último. Recojo lo que el cliente escribió DESPUÉS de mi última respuesta:
      // eso es justo la ráfaga que quedó sin contestar.
      let desde = null;
      try {
        const b = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=eq.' + encodeURIComponent(chatId) + '&select=created_at&order=created_at.desc&limit=1', { headers: H, timeout: 5000 });
        if (b.data && b.data[0] && b.data[0].created_at) desde = new Date(b.data[0].created_at).getTime();
      } catch (e) {}
      if (!desde) desde = Date.now() - 5 * 60000;
      const previos = filas
        .filter(f => String(f.message_id) !== msgId && f.texto && new Date(f.procesado_at).getTime() > desde)
        .sort((a, b) => new Date(a.procesado_at) - new Date(b.procesado_at))
        .map(f => String(f.texto).trim())
        .filter(Boolean);
      if (previos.length) {
        payload._rafaga_previa = previos.join('\n').slice(0, 1500) + '\n';
        console.log('[Ráfaga] ' + chatId + ': uniendo ' + previos.length + ' mensaje(s) previo(s)');
      }
    }
  } catch (e) { console.warn('[Ráfaga] fallo la comprobación, dejo pasar: ' + (e && e.message)); }

  if (!superado) out.push({ json: item });
}
return out;`;

const TEXT_VIEJO = `+ " ||| Mensaje del cliente: " + $('Transcribir Nota de Voz').first().json.body.payload.body }}`;
const TEXT_NUEVO = `+ " ||| Mensaje del cliente: " + (($('Transcribir Nota de Voz').first().json.body.payload._rafaga_previa || '') + $('Transcribir Nota de Voz').first().json.body.payload.body) }}`;

(async () => {
  if (!API_KEY) throw new Error('N8N_API_KEY no esta en .env');
  const H = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };

  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, { headers: H });
  if (!res.ok) throw new Error(`GET fallo: ${res.status} ${await res.text()}`);
  const wf = await res.json();

  if (wf.nodes.some(n => n.name === NOMBRE)) { console.log('Ya estaba parcheado.'); return; }

  const filtro = wf.nodes.find(n => n.name === 'Filtro Anti-Duplicado');
  const trans = wf.nodes.find(n => n.name === 'Transcribir Nota de Voz');
  const ag = wf.nodes.find(n => n.name === 'AI Agent');
  if (!filtro || !trans || !ag) throw new Error('Falta alguno de los nodos esperados');

  // La cadena actual DEBE ser Filtro -> Transcribir; si no, el grafo cambió y aborto.
  const cx = wf.connections['Filtro Anti-Duplicado'];
  const destinos = ((cx && cx.main && cx.main[0]) || []).map(c => c.node);
  if (destinos.length !== 1 || destinos[0] !== 'Transcribir Nota de Voz') {
    throw new Error('Filtro Anti-Duplicado no apunta solo a Transcribir Nota de Voz: ' + JSON.stringify(destinos));
  }

  trans.position = [520, 470];
  wf.nodes.push({
    id: 'debounce_rafaga_node', name: NOMBRE, type: 'n8n-nodes-base.code',
    typeVersion: 2, position: [340, 470], parameters: { jsCode: CODIGO },
  });
  wf.connections['Filtro Anti-Duplicado'] = { main: [[{ node: NOMBRE, type: 'main', index: 0 }]] };
  wf.connections[NOMBRE] = { main: [[{ node: 'Transcribir Nota de Voz', type: 'main', index: 0 }]] };

  const n = ag.parameters.text.split(TEXT_VIEJO).length - 1;
  if (n !== 1) throw new Error(`AI Agent.text: esperaba 1 coincidencia, encontre ${n}. Aborto.`);
  ag.parameters.text = ag.parameters.text.replace(TEXT_VIEJO, TEXT_NUEVO);

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings?.[k] !== undefined) cs[k] = wf.settings[k];
  if (!cs.executionOrder) cs.executionOrder = 'v1';

  const put = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs })
  });
  if (!put.ok) throw new Error(`PUT fallo: ${put.status} ${await put.text()}`);

  const upd = await put.json();
  const ok = upd.nodes.some(x => x.name === NOMBRE)
    && upd.connections['Filtro Anti-Duplicado'].main[0][0].node === NOMBRE
    && upd.connections[NOMBRE].main[0][0].node === 'Transcribir Nota de Voz'
    && upd.nodes.find(x => x.name === 'AI Agent').parameters.text.includes('_rafaga_previa');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
