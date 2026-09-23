// patch_debounce_deslizante.js
//
// "Debounce Ráfaga" v2: de una siesta a ciegas a un sondeo deslizante.
//
// El nodo original (patch_debounce_rafaga.js) dormía ESPERA_MS = 7000 de un tirón y recién
// al despertar preguntaba "¿soy el mensaje más reciente?". Esa ventana se calibró con 8
// casos. Medido sobre 30 días (ráfaga = entrantes consecutivos del mismo chat SIN respuesta
// del bot en medio, n=142): los 7 s cubren 49 casos = 34 %. El 66 % restante seguía dando
// doble respuesta, y a veces la segunda CONTRADECÍA a la primera porque las dos ejecuciones
// corren en paralelo y no comparten el Simple Memory del agente.
//
// Forma tipica del fallo: el cliente pregunta por un producto, y 13 s despues manda un
// segundo mensaje corto (su nombre, un "por favor"). Llegaban DOS respuestas, la segunda
// repitiendo el listado entero de la primera.
//
// Por qué el sondeo y no simplemente subir la constante:
//   Con siesta fija, la ejecución del primer mensaje despertaba a los 7 s, momento en el que
//   el segundo TODAVÍA NO EXISTÍA, así que respondía. Sondeando cada 2,5 s sigue viva hasta
//   el segundo 15 y lo ve llegar → se calla. Una ventana fija de 15 s también lo vería, pero
//   pagando 15 s de worker ocupado siempre; el sondeo deja libre la perdedora apenas detecta
//   la novedad (~2,5 s) y suma un techo duro.
//
// Lo que NO arregla, y es honesto decirlo: la espera de silencio ES la latencia del mensaje
// único. Medido sobre 60 días, solo el 11,5 % de los mensajes tiene otro detrás en ≤15 s.
// Subir QUIET_MS le cobra esa espera al ~85 % que escribe una sola vez. QUIET_MS está
// aislado y comentado justamente para poder moverlo con datos, no por corazonada.
//
// Descartado a propósito — "ya me contestaron": callarse al ver una respuesta del bot
// posterior a mi mensaje. Es una vía nueva hacia el SILENCIO (si la respuesta hermana no
// cubría mi mensaje, el cliente se queda sin contestar) y los dos casos reales ya quedan
// cubiertos por el sondeo. El invariante del nodo es fallar hacia responder, siempre.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const JSON_CANONICO = path.join(RAIZ, 'n8n_workflow.json');
const env = fs.existsSync(path.join(RAIZ, '.env')) ? fs.readFileSync(path.join(RAIZ, '.env'), 'utf8') : '';
const pick = (k) => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

const N8N_URL = pick('N8N_API_URL_LOCAL') || 'http://localhost:5678/api/v1';
const API_KEY = pick('N8N_API_KEY');
const WF_ID = 'ugHOTQv3Vb6cuTct';
const NOMBRE = 'Debounce Ráfaga';

const CODIGO = String.raw`// "Debounce Ráfaga": el cliente suele escribir en varios mensajes seguidos. Cada mensaje
// abre su propia ejecución y ninguna ve a las otras, así que respondía a todas por separado.
// Aquí sondeamos el chat mientras esperamos, y solo sobrevive la ÚLTIMA ejecución de la
// ráfaga, que se lleva los mensajes previos sin responder como contexto.
//
// Sondeo deslizante, no una siesta a ciegas: la versión anterior dormía 7 s de un tirón y
// preguntaba al despertar. Si el siguiente mensaje llegaba al segundo 8, ya era tarde y
// respondían las dos. Medido sobre 30 días (n=142 ráfagas), esa ventana cubría el 34 %.
// Sondeando, la ejecución ve llegar al que la supera DURANTE la espera y se calla en el
// acto, sin ocupar un worker hasta el final.
//
// Ante cualquier error deja pasar el mensaje tal cual: este nodo nunca puede callar al bot
// por su cuenta. Callarse por error deja al cliente sin respuesta, que es peor que responder
// de más — y el rate-limit ya corta las avalanchas de verdad.
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const CICLO_MS = 2500;    // resolución del sondeo: cada cuánto miro si llegó algo nuevo
const QUIET_MS = 15000;   // silencio sin novedades para dar la ráfaga por cerrada.
                          // Cubre huecos <=15 s = 89/142 = 63 % (antes 34 %). Es también la
                          // latencia del mensaje único: subirlo tapa más ráfagas pero se la
                          // cobra al ~85 % que escribe una sola vez. Mover con datos.
const TECHO_MS = 45000;   // cinturón de seguridad: si Supabase va lento y los sondeos se
                          // estiran, nadie se queda esperando más que esto.
const MAX_PREVIOS = 5;

const URL_MSGS = (chatId) => SB + '/rest/v1/mensajes_procesados?chat_id=eq.' + encodeURIComponent(chatId)
  + '&select=message_id,procesado_at,texto&order=procesado_at.desc&limit=' + (MAX_PREVIOS + 1);

const out = [];
for (const it of $input.all()) {
  const item = it.json || {};
  const payload = (item.body && item.body.payload) || {};
  const chatId = payload.from || null;
  const msgId = String(payload.id || '');
  if (!chatId || !msgId) { out.push({ json: item }); continue; }

  const inicio = Date.now();
  let superado = false;
  let filas = [];

  // Sondeo: me callo apenas alguien más nuevo aparece; respondo cuando pasó QUIET_MS sin
  // novedades. Cualquier tropiezo rompe el bucle hacia responder, nunca hacia el silencio.
  while (true) {
    try { await new Promise(r => setTimeout(r, CICLO_MS)); } catch (e) {}
    try {
      const u = await axios.get(URL_MSGS(chatId), { headers: H, timeout: 5000 });
      filas = u.data || [];
    } catch (e) {
      console.warn('[Ráfaga] falló el sondeo, dejo pasar: ' + (e && e.message));
      break;
    }
    const idx = filas.findIndex(f => String(f.message_id) === msgId);
    if (idx > 0) {
      superado = true;
      console.log('[Ráfaga] ' + chatId + ': llegó algo más nuevo, esta ejecución se calla');
      break;
    }
    // idx === -1: no me veo en la lista (falló el insert, o llegó una avalancha). Ante la
    // duda respondo.
    if (idx < 0) { console.warn('[Ráfaga] ' + chatId + ': no me veo en la lista, dejo pasar'); break; }
    const esperado = Date.now() - inicio;
    if (esperado >= QUIET_MS) break;
    if (esperado >= TECHO_MS) { console.warn('[Ráfaga] ' + chatId + ': techo alcanzado, respondo'); break; }
  }

  if (!superado) {
    // Soy el último. Recojo lo que el cliente escribió DESPUÉS de mi última respuesta: eso
    // es justo la ráfaga que quedó sin contestar.
    try {
      if (filas.some(f => String(f.message_id) === msgId)) {
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
    } catch (e) { console.warn('[Ráfaga] no pude armar el contexto, sigo igual: ' + (e && e.message)); }
    out.push({ json: item });
  }
}
return out;`;

function reemplazarNodo(wf, origen) {
  const nodo = wf.nodes.find((n) => n.name === NOMBRE);
  if (!nodo) throw new Error(`${origen}: no existe el nodo "${NOMBRE}". ¿Corriste patch_debounce_rafaga.js?`);
  if (!/ESPERA_MS/.test(nodo.parameters.jsCode) && /CICLO_MS/.test(nodo.parameters.jsCode)) return false;
  // La cadena tiene que seguir siendo Filtro -> Debounce -> Transcribir; si el grafo cambió,
  // aborto en vez de desplegar sobre algo que no reconozco.
  const antes = ((wf.connections['Filtro Anti-Duplicado'] || {}).main || [[]])[0].map((c) => c.node);
  const despues = ((wf.connections[NOMBRE] || {}).main || [[]])[0].map((c) => c.node);
  if (antes.length !== 1 || antes[0] !== NOMBRE) throw new Error(`${origen}: Filtro Anti-Duplicado ya no apunta solo al debounce: ${JSON.stringify(antes)}`);
  if (despues.length !== 1 || despues[0] !== 'Transcribir Nota de Voz') throw new Error(`${origen}: el debounce ya no apunta solo a Transcribir: ${JSON.stringify(despues)}`);
  nodo.parameters.jsCode = CODIGO;
  return true;
}

(async () => {
  // 1) El canónico del repo. Se edita SOLO este nodo: nunca se escribe encima el resultado
  //    de un GET al vivo (eso ya publicó producción sobre staging una vez).
  const wfLocal = JSON.parse(fs.readFileSync(JSON_CANONICO, 'utf8'));
  reemplazarNodo(wfLocal, 'n8n_workflow.json');
  fs.writeFileSync(JSON_CANONICO, JSON.stringify(wfLocal, null, 2) + '\n');
  console.log('✓ n8n_workflow.json actualizado (canónico)');

  if (process.argv.includes('--solo-local')) { console.log('(--solo-local: no toco el workflow vivo)'); return; }

  // 2) El workflow vivo, por separado y con el mismo código.
  if (!API_KEY) throw new Error('N8N_API_KEY no está en .env');
  const H = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };
  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, { headers: H });
  if (!res.ok) throw new Error(`GET falló: ${res.status} ${await res.text()}`);
  const wf = await res.json();
  if (!reemplazarNodo(wf, 'workflow vivo')) { console.log('El vivo ya tenía el sondeo deslizante.'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings?.[k] !== undefined) cs[k] = wf.settings[k];
  if (!cs.executionOrder) cs.executionOrder = 'v1';

  const put = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }),
  });
  if (!put.ok) throw new Error(`PUT falló: ${put.status} ${await put.text()}`);

  // 3) Verificación contra lo que el servidor devolvió, no contra lo que le mandé.
  const upd = await put.json();
  const vivo = upd.nodes.find((n) => n.name === NOMBRE);
  const ok = vivo
    && vivo.parameters.jsCode === CODIGO
    && upd.connections['Filtro Anti-Duplicado'].main[0][0].node === NOMBRE
    && upd.connections[NOMBRE].main[0][0].node === 'Transcribir Nota de Voz';
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
