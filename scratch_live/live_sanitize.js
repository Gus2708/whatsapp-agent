// Guardia anti-salida-corrupta del agente + detección de RESERVA (avisar al empleado).
// 1) Si el LLM filtra una tool-call o entra en bucle, reemplaza por un fallback amable.
// 2) Si el agente marcó [RESERVA: ...], quita el marcador (el cliente NUNCA lo ve) y registra
//    la reserva en atenciones_pendientes para que la app avise al empleado (nombre + producto).
// BEGIN CONVERSATION FUNCTIONS
function searchDecision(status) {
  const action = { exact: 'show_results', vague: 'clarify', missing: 'handoff', weak: 'handoff',
    not_sold: 'unavailable' }[status] || 'confirm';
  return { decision_version: 1, action, match_status: status, requires_confirmation: action === 'confirm' };
}

function searchGuard(steps) {
  const clarify = '¿Qué producto necesitas exactamente? Indícame el nombre y la medida, por favor.';
  if (steps === undefined || steps === null) return null;
  if (!Array.isArray(steps) || steps.length > 100) return clarify;
  const latest = new Map();
  for (const [index, step] of steps.entries()) {
    if (typeof step?.action?.tool !== 'string') return clarify;
    if (step?.action?.tool !== 'buscar_productos') continue;
    const query = step.action.toolInput?.p_busqueda;
    const key = typeof query === 'string' ? query.trim().toLowerCase() : index;
    latest.set(key, { query: typeof query === 'string' ? query : '', observation: step.observation });
  }
  // A handoff is superseded only by a find for the SAME product: the agent often retries a
  // missed search with other wording ("tienen cajetines 2x4" -> "cajetin 2x4"). Two searches
  // are the same product when they share a content word (4-letter prefix, so plurals match).
  // Searches for different products never cover each other, so a missing one still escalates.
  const generic = new Set(['tienen', 'tiene', 'tendran', 'venden', 'vende', 'hay', 'para', 'precio',
    'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'busco', 'necesito', 'quiero', 'quisiera', 'tengo',
    'unos', 'unas', 'como', 'donde', 'esta', 'estan', 'disponible', 'disponibles']);
  const stems = text => new Set(String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && /[a-z]/.test(w) && !generic.has(w)).map(w => w.slice(0, 4)));
  const handoffs = [];
  const found = [];
  let response = null;
  for (const { query, observation } of latest.values()) {
    let result;
    try {
      if (typeof observation !== 'string' || observation.length > 20000) return clarify;
      result = JSON.parse(observation);
    } catch (_) { return clarify; }
    const statuses = ['exact', 'vague', 'missing', 'weak', 'not_sold', 'semantic', 'measure_mismatch',
      'multiple_measures', 'approximate', 'relaxed', 'single_word'];
    if (!result || result.decision_version !== 1 || !statuses.includes(result.match_status)) return clarify;
    const expected = searchDecision(result.match_status);
    if (result.action !== expected.action || result.requires_confirmation !== expected.requires_confirmation) return clarify;
    if (result.action === 'handoff') { handoffs.push(query); continue; }
    const listed = Array.isArray(result.productos) ? result.productos.length : 0;
    const count = result.encontrados === undefined ? listed : Number(result.encontrados);
    if (['show_results', 'confirm'].includes(result.action) && count > 0) found.push(stems(query));
    if (result.action === 'clarify') response = clarify;
    if (result.action === 'unavailable') response = 'Ese producto no lo trabajamos. ¿Qué otro producto necesitas?';
    if (result.action === 'confirm') {
      const names = Array.isArray(result.productos) ? result.productos.slice(0, 4)
        .map(p => typeof p?.nombre === 'string' ? p.nombre.replace(/[\[\]\r\n]/g, '').slice(0, 120) : '').filter(Boolean) : [];
      response = names.length ? 'No encontré una coincidencia exacta. ¿Te sirve alguna de estas opciones?\n' +
        names.map(name => '• ' + name).join('\n') : clarify;
    }
  }
  const covered = query => { const own = stems(query); return found.some(f => [...f].some(s => own.has(s))); };
  if (handoffs.some(query => !covered(query))) return '[PEDIR_AYUDA]';
  return response;
}
// END CONVERSATION FUNCTIONS
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const FALLBACK = 'Disculpa 🙏😊, se me enredó un cable procesando eso 😅🙏🙈. ¿Me repites qué necesitas (o tu lista de materiales)? Así te lo busco y te armo el presupuesto enseguida 😊🙏';
const RESERVA_RE = /\[\s*RESERVA\s*:?\s*([^\]]*)\]/i;

function looksCorrupt(text) {
  if (!text || typeof text !== 'string') return false;
  if (text.length > 4000) return true;
  if (/Calling\s+[\w-]+\s+with input\s*:/i.test(text)) return true;
  if (/"id"\s*:\s*"call_/.test(text)) return true;
  const head = text.slice(0, 4000);
  if (/(.{1,4})\1{20,}/s.test(head)) return true;
  return false;
}

let telefono = null, pushName = null;
try { const p = $('Webhook Trigger').first().json.body.payload; telefono = p && p.from; pushName = (p && p._data && p._data.pushName) || (p && p.notifyName) || (p && p.pushName) || null; } catch (e) {}

for (const item of items) {
  let context = item?.json?.conversation_context;
  if (!context) {
    try { context = $('Prepare Conversation Context').first().json.conversation_context; } catch (_) {}
  }
  // In n8n, returnIntermediateSteps omits intermediateSteps on tool-free turns (undefined).
  // searchGuard treats undefined as tool-free, returning null so the output is preserved.
  const guarded = context?.action === 'respond'
    ? context.reply
    : context?.action === 'handoff'
      ? (context.reply || '[PEDIR_AYUDA]')
      : context?.action === 'clarify'
        ? '¿Qué producto necesitas exactamente? Indícame el nombre y la medida, por favor.'
        : !item.json.error && typeof item.json.output === 'string' && item.json.output.trim()
          ? searchGuard(item.json.intermediateSteps) : null;
  delete item.json.intermediateSteps;
  delete item.json.jev_shadow;
  // Explicit human escalation retains precedence; uncertain results never trigger reservations.
  if (guarded && !String(item.json.output || '').includes('[ESCALAR_HUMANO]')) {
    item.json.output = guarded;
    item.json._decision_guarded = true;
    continue;
  }
  // 0) Blindaje ante errores o respuestas vacías del AI Agent
  if (item.json?.error || !item.json?.output || typeof item.json.output !== 'string' || !item.json.output.trim()) {
    // console.error (no warn): el AI Agent lleva onError:continueRegularOutput, asi que la
    // ejecucion sale VERDE aunque el agente haya fallado. Este log es la unica huella en
    // los logs de n8n de que el cliente recibio el fallback en vez de una respuesta real.
    console.error('[Sanitize] Error en AI Agent o salida vacía detectada:', item.json?.error || 'output vacío');
    item.json.output = FALLBACK;
    item.json._error_recuperado = true;
    try {
      if (telefono) {
        let nombre = null;
        try { const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=eq.' + encodeURIComponent(telefono), { headers: H, timeout: 3000 }); nombre = (c.data && c.data[0] && c.data[0].nombre) || null; } catch (e) {}
        if (!nombre && pushName) nombre = String(pushName).slice(0, 80);
        let motivoMsg = '⚠️ IA: error al responder al cliente';
        try {
          const p = $('Webhook Trigger').first().json.body.payload;
          if (p && p.body) motivoMsg = '⚠️ IA: fallo en el mensaje "' + String(p.body).slice(0, 100) + '"';
        } catch(e) {}
        // Dedup como el de RESERVA: si este cliente YA tiene un aviso de IA pendiente, no
        // se apila otro. Acotado a status=pendiente a proposito -> cuando el empleado cierra
        // la atencion vuelve a poder crearse una nueva. Sin esto, un fallo repetido inunda
        // la cola de empleados con la misma incidencia.
        let yaHay = false;
        try { const r = await axios.get(SB + '/rest/v1/atenciones_pendientes?status=eq.pendiente&motivo=like.*IA:*&telefono=eq.' + encodeURIComponent(telefono) + '&select=id', { headers: H, timeout: 3000 }); yaHay = Array.isArray(r.data) && r.data.length > 0; } catch (e) {}
        if (!yaHay) {
          await axios.post(SB + '/rest/v1/atenciones_pendientes', { telefono, nombre, motivo: motivoMsg, status: 'pendiente' }, { headers: H, timeout: 3000 });
        }
      }
    } catch(e) {}
    continue;
  }

  const out = item.json.output;
  if (looksCorrupt(out)) {
    console.warn('[Sanitize] salida corrupta del agente -> fallback. Original (200 chars):', String(out).slice(0, 200));
    item.json.output = FALLBACK;
    item.json._sanitized = true;
    continue;
  }
  if (typeof out === 'string' && RESERVA_RE.test(out)) {
    const m = out.match(RESERVA_RE);
    const detalle = ((m && m[1]) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    let limpio = out.replace(RESERVA_RE, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!limpio) limpio = '¡Listo! 🙏 Te lo dejo apartado y un empleado lo prepara enseguida 😊🙏';
    item.json.output = limpio;
    item.json._reserva = true;
    try {
      if (telefono) {
        let nombre = null;
        try { const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=eq.' + encodeURIComponent(telefono), { headers: H, timeout: 3000 }); nombre = (c.data && c.data[0] && c.data[0].nombre) || null; } catch (e) {}
        if (!nombre && pushName) nombre = String(pushName).slice(0, 80);
        let yaHay = false;
        try { const r = await axios.get(SB + '/rest/v1/atenciones_pendientes?status=eq.pendiente&motivo=like.*RESERVA*&telefono=eq.' + encodeURIComponent(telefono) + '&select=id', { headers: H, timeout: 3000 }); yaHay = Array.isArray(r.data) && r.data.length > 0; } catch (e) {}
        if (!yaHay) {
          await axios.post(SB + '/rest/v1/atenciones_pendientes', { telefono, nombre, motivo: '📦 RESERVA: ' + (detalle || 'el cliente quiere reservar un producto'), status: 'pendiente' }, { headers: H, timeout: 3000 });
        }
      }
    } catch (e) {}
  }
}

// [handoff] Registrar lo que envía el bot para distinguirlo de un empleado.
try {
  const _norm = (t) => String(t || '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (telefono) {
    for (const _it of items) {
      const _t = _it && _it.json ? _it.json.output : null;
      if (_t) { try { await axios.post(SB + '/rest/v1/mensajes_bot', { chat_id: telefono, texto_norm: _norm(_t) }, { headers: H }); } catch (e) {} }
    }
  }
} catch (e) {}

return items;
