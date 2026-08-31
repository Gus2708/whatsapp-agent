const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// patch_solicitud_contexto.js
// Al empleado le llegaba SOLO el ultimo mensaje del cliente, que casi siempre es una anafora
// ("De este", "Y el saco de cemento", "De la de 3.60", "No me importa la marca solo el
// modelo"). Sin el turno anterior no se puede resolver: de 51 solicitudes, 28 acabaron en
// 'descartado'. Ahora ya guardamos el texto entrante, asi que se puede reconstruir.
//
// Tres arreglos en "Registrar Solicitud Ayuda":
//
// 1) CONTEXTO. `consulta` pasa a llevar el mensaje + lo que el cliente dijo antes + la
//    ultima respuesta del bot. OJO: `consulta_limpia` guarda el mensaje SOLO, porque es lo
//    que aprende el buscador (fn_aprender_item -> busqueda_aprendizaje.termino_tokens).
//    Mezclarlos haria que el motor aprendiera la respuesta del bot como termino de busqueda.
//
// 2) DEDUP QUE NO CADUCABA. Bastaba UNA solicitud 'pendiente' del mismo telefono para
//    bloquear cualquier otra, sin limite de tiempo. Con la cola sin atender desde el 24-jul
//    habia 7 pendientes viejas (4-11 ago): esos 7 clientes no podian volver a pedir ayuda
//    NUNCA. Ahora el bloqueo caduca a las 3 horas.
//
// 3) NOTAS DE VOZ. Leia el texto de $('Webhook Trigger'), que en una nota de voz o una foto
//    es el media crudo, no la transcripcion -> consulta quedaba en null (3 de las 30 ultimas
//    solicitudes). Ahora lee de $('Transcribir Nota de Voz'), que ya trae el texto resuelto.
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';
const NODO = 'Registrar Solicitud Ayuda';

const CODIGO = String.raw`// Registra una solicitud de ayuda (el bot no encontro algo o el cliente refuto el resultado).
// La app de empleados elige el/los producto(s) y n8n reenvia.
//
// consulta        -> lo que LEE EL EMPLEADO: mensaje + contexto de la conversacion.
// consulta_limpia -> lo que APRENDE EL BUSCADOR (fn_aprender_item). Solo el mensaje.
// No mezclar los dos: con el contexto dentro, el motor aprenderia la respuesta del bot.
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const DEDUP_HORAS = 3;
const MARCADORES = ['[pedir_ayuda]', '[escalar_humano]'];
const limpiar = (t) => String(t || '').replace(/\s+/g, ' ').trim();

let telefono = null, consulta = null, pushName = null, msgId = '';
try {
  // Transcribir Nota de Voz, no Webhook Trigger: en una nota de voz o una foto el body del
  // webhook es el media crudo; aqui ya viene la transcripcion o la descripcion.
  const p = $('Transcribir Nota de Voz').first().json.body.payload;
  telefono = p && p.from;
  msgId = String((p && p.id) || '');
  consulta = limpiar(p && p.body).slice(0, 300) || null;
  pushName = (p && p._data && p._data.pushName) || (p && p.notifyName) || (p && p.pushName) || null;
} catch (e) {}

// Contexto: sin esto el empleado recibe "De este" y no puede hacer nada.
let contexto = '';
try {
  if (telefono) {
    const r = await axios.get(SB + '/rest/v1/mensajes_procesados?chat_id=eq.' + encodeURIComponent(telefono) + '&select=message_id,texto,procesado_at&order=procesado_at.desc&limit=8', { headers: H, timeout: 4000 });
    const previos = (r.data || [])
      .filter(f => String(f.message_id) !== msgId && f.texto)
      .slice(0, 3)
      .reverse()
      .map(f => limpiar(f.texto).slice(0, 90))
      .filter(Boolean);
    if (previos.length) contexto = 'antes dijo: ' + previos.map(t => '"' + t + '"').join(' · ');

    const b = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=eq.' + encodeURIComponent(telefono) + '&select=texto_norm&order=created_at.desc&limit=5', { headers: H, timeout: 4000 });
    const ultima = (b.data || [])
      .map(x => limpiar(x.texto_norm))
      .find(t => t && MARCADORES.indexOf(t) === -1);
    if (ultima) contexto += (contexto ? ' | ' : '') + 'Perucho respondio: ' + ultima.slice(0, 150);
  }
} catch (e) {}

try {
  if (telefono) {
    // El bloqueo por duplicado CADUCA: una solicitud pendiente sin atender no puede dejar
    // al cliente sin poder pedir ayuda para siempre.
    const desde = new Date(Date.now() - DEDUP_HORAS * 3600000).toISOString();
    const ex = await axios.get(SB + '/rest/v1/solicitudes_ayuda?status=eq.pendiente&select=id&telefono=eq.' + encodeURIComponent(telefono) + '&creado_en=gte.' + encodeURIComponent(desde), { headers: H });
    if (!ex.data || ex.data.length === 0) {
      let nombre = null;
      try { const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=eq.' + encodeURIComponent(telefono), { headers: H }); nombre = (c.data && c.data[0] && c.data[0].nombre) || null; } catch (e) {}
      if (!nombre && pushName) nombre = String(pushName).slice(0, 80);
      const consultaConContexto = contexto
        ? (consulta || '(sin texto)') + '\n— ' + contexto.slice(0, 260)
        : consulta;
      await axios.post(SB + '/rest/v1/solicitudes_ayuda', {
        telefono, nombre,
        consulta: consultaConContexto,
        consulta_limpia: consulta,
        motivo: 'no_encontrado', status: 'pendiente',
      }, { headers: H });
    }
  }
} catch (e) {}
return [{ json: $json }];`;

(async () => {
  if (!API_KEY) throw new Error('N8N_API_KEY no esta en .env');
  const H = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };

  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, { headers: H });
  if (!res.ok) throw new Error(`GET fallo: ${res.status} ${await res.text()}`);
  const wf = await res.json();

  const nodo = wf.nodes.find(n => n.name === NODO);
  if (!nodo) throw new Error(`No encontre "${NODO}"`);
  if (nodo.parameters.jsCode.includes('consulta_limpia')) { console.log('Ya estaba parcheado.'); return; }
  if (!nodo.parameters.jsCode.includes('Dedup: una solicitud')) {
    throw new Error('El nodo no es la version esperada. Aborto sin tocar nada.');
  }
  nodo.parameters.jsCode = CODIGO;

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
  const c = upd.nodes.find(n => n.name === NODO).parameters.jsCode;
  const ok = c.includes('consulta_limpia') && c.includes('DEDUP_HORAS')
    && c.includes("$('Transcribir Nota de Voz')") && c.includes('antes dijo');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
