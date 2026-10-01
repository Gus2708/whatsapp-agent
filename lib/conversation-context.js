'use strict';

// Request state, never a confirmed catalog selection. Deliberately cable-only.
function resolveConversation(message, previous, session, now) {
  const raw = String(message || '');
  const text = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

  const humanRequest = /\b(?:hablar con (?:un |una )?(?:humano|persona|asesor|empleado)|comunicame con (?:un |una )?(?:humano|persona|asesor|empleado)|pasame con (?:un |una )?(?:humano|persona|asesor|empleado)|atencion humana|asesor humano)\b/.test(text) ||
    (/\b(?:humano|asesor|empleado)\b/.test(text) && /\b(?:quiero|puedo|favor|por favor|necesito|hablar|contactar)\b/.test(text));
  if (humanRequest) return { action: 'handoff', query: raw, state: null };
  const colors = 'azul|rojo|negro|blanco|verde|amarillo';
  const cable = new RegExp('^cable(?: (thwn|thhn))?(?: #?(\\d{1,2}))?(?: (' + colors + '))?(?: por (metro|rollo))?$').exec(text);
  const gauge = /^(?:(?:y|pero) )?(?:el |de )?(?:#|calibre )(\d{1,2})$/.exec(text);
  const presentation = /^(?:pero |y )?por (metro|rollo)$/.exec(text);
  const reference = gauge || presentation || /^\d+$/.test(text) || new RegExp('^(?:(?:y|pero) )?(?:el|ese|este|la|esa|esta)(?: (' + colors + '|#?\\d{1,2}))?$').test(text);
  const brandReject = /^(?:(?:pero|y) )?(?:de )?otra(?: marca)?\??$/.test(text) ||
    /^(?:tienen|hay|tendra|tendran) (?:de )?otra(?: marca)?\??$/.test(text) ||
    /^(?:esa|esta) marca no(?: me gusta)?$/.test(text);
  const brandExplicit = /^(?:(?:pero|y) )?(?:(?:en|de) marca|(?:en|de)|marca) ([a-z0-9]+)$/.exec(text);

  const valid = previous && previous.version === 1 && previous.session === session &&
    Number.isFinite(previous.expires_at) && previous.expires_at > now &&
    previous.expires_at <= now + 30 * 60000 && previous.confirmed === false;

  const validCable = valid &&
    /^(thwn|thhn)?$/.test(previous.variant) && /^(\d{1,2})?$/.test(previous.gauge) &&
    new RegExp('^(' + colors + ')?$').test(previous.color) && /^(metro|rollo)?$/.test(previous.presentation);

  if (session && valid && brandReject && previous.base_query) {
    const excluded = Array.isArray(previous.excluded_brands) ? [...previous.excluded_brands] : [];
    if (previous.last_brand && !excluded.includes(previous.last_brand)) excluded.push(previous.last_brand);
    const state = {
      ...previous,
      excluded_brands: excluded,
      version: 1, session, confirmed: false, expires_at: now + 30 * 60000
    };
    return { action: 'search', query: previous.base_query, state, marcas_excluidas: excluded };
  }

  if (session && valid && brandExplicit && previous.base_query) {
    const brandName = brandExplicit[1];
    const state = {
      ...previous,
      brand: brandName,
      last_brand: brandName,
      version: 1, session, confirmed: false, expires_at: now + 30 * 60000
    };
    return { action: 'search', query: previous.base_query + ' ' + brandName, state };
  }

  let state = null;
  if (session && cable) {
    state = { variant: cable[1] || '', gauge: cable[2] || '', color: cable[3] || '', presentation: cable[4] || '', base_query: raw, excluded_brands: [] };
  } else if (session && validCable && (gauge || presentation)) {
    state = { ...previous, variant: previous.variant, gauge: gauge ? gauge[1] : previous.gauge,
      color: previous.color, presentation: presentation ? presentation[1] : previous.presentation };
  }
  if (!state) return { action: reference ? 'clarify' : 'pass', query: raw, state: null };
  const query = ['cable', state.variant, state.gauge && '#' + state.gauge,
    state.color, state.presentation && 'por ' + state.presentation].filter(Boolean).join(' ');
  return { action: 'search', query: cable ? raw : query,
    state: { ...state, version: 1, session, confirmed: false, expires_at: now + 30 * 60000 } };
}

function searchDecision(status) {
  const action = { exact: 'show_results', vague: 'clarify', missing: 'handoff', weak: 'handoff',
    not_sold: 'unavailable' }[status] || 'confirm';
  return { decision_version: 1, action, match_status: status, requires_confirmation: action === 'confirm' };
}

// Read only trusted tool observations, never JSON emitted in the model's final text.
function searchGuard(steps) {
  const clarify = '¿Qué producto necesitas exactamente? Indícame el nombre y la medida, por favor.';
  if (!Array.isArray(steps) || steps.length > 100) return clarify;
  const latest = new Map();
  for (const [index, step] of steps.entries()) {
    if (typeof step?.action?.tool !== 'string') return clarify;
    if (step?.action?.tool !== 'buscar_productos') continue;
    const query = step.action.toolInput?.p_busqueda;
    const key = typeof query === 'string' ? query.trim().toLowerCase() : index;
    latest.set(key, step.observation);
  }
  let response = null;
  for (const observation of latest.values()) {
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
    if (result.action === 'handoff') return '[PEDIR_AYUDA]';
    if (result.action === 'clarify') response = clarify;
    if (result.action === 'unavailable') response = 'Ese producto no lo trabajamos. ¿Qué otro producto necesitas?';
    if (result.action === 'confirm') {
      const names = Array.isArray(result.productos) ? result.productos.slice(0, 4)
        .map(p => typeof p?.nombre === 'string' ? p.nombre.replace(/[\[\]\r\n]/g, '').slice(0, 120) : '').filter(Boolean) : [];
      response = names.length ? 'No encontré una coincidencia exacta. ¿Te sirve alguna de estas opciones?\n' +
        names.map(name => '• ' + name).join('\n') : clarify;
    }
  }
  return response;
}

const { STORE_INFO, getStoreData, getStoreInfo, formatStoreInfoReply, detectStoreInfoTopic } = require('./store-info');

function fastRouter({ message, jev, context, options = {} } = {}) {
  const raw = String(message || '');
  const pass = { fast_path: false, action: 'pass', query: raw };
  const text = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim().replace(/^[¿¡\s]+|[?!.,;:\s]+$/g, '').trim();
  const minConfidence = Math.max(0.9, Number(options.minConfidence ?? 0.9));
  const namePrompt = options.askName === true ? '\n\n¿Con quién tengo el gusto? 😊' : '';

  // A previous conversation decision or product state must keep its own route.
  if (context && (context.action !== undefined && !['pass', 'disabled'].includes(context.action) ||
    context.state || context.previous_product || context.base_query || context.variant ||
    context.gauge || context.presentation)) return pass;
  if (jev?.status !== 'ok' || jev.continuation !== 'new' ||
    !Number.isFinite(minConfidence) ||
    ![jev.intent_confidence, jev.intent_probability, jev.continuation_confidence,
      jev.continuation_probability].every(value => Number.isFinite(value) && value >= minConfidence)) return pass;

  // Jev and an anchored local pattern must agree before a customer-facing reply.
  if (jev.intent === 'general') {
    const closing = /^(?:gracias|muchas gracias|mil gracias|listo gracias|chao|adios|hasta luego|hasta pronto)$/.test(text);
    const greeting = /^(?:hola(?: buenas(?: tardes| noches)?)?|buenos dias|buen dia|buenas tardes|buenas noches|saludos)$/.test(text);
    if (!closing && !greeting) return pass;
    const env = (typeof process !== 'undefined' && process.env) || (typeof $env !== 'undefined' && $env) || {};
    const storeName = env.STORE_NAME || 'Ferretería El Serrucho';
    const botName = env.BOT_NAME || 'Perucho';
    const storeCity = env.STORE_CITY || 'Mene Mauroa';
    const citySuffix = storeCity ? ` en ${storeCity}` : '';
    return { fast_path: true, action: 'respond',
      reply: (closing
        ? `¡A tu orden siempre! 😊 Recuerda que en *${storeName}* estamos para servirte. ¡Que tengas un excelente día! 👨🏻‍🔧`
        : `¡Hola! 👋 Te atiende *${botName}* 👨🏻‍🔧 de *${storeName}* 🪚${citySuffix}. ¿En qué producto o material te podemos ayudar hoy? 😊`) + (closing ? '' : namePrompt),
      confidence: jev.intent_confidence };
  }

  if (jev.intent === 'store_info') {
    const hours = /^(?:cual es (?:el|su) horario(?: de atencion)?|horario(?: de atencion)?|a que hora (?:abren|cierran)(?: hoy)?|que hora abren(?: hoy)?|hasta que hora (?:abren|trabajan|atienden)(?: hoy)?)$/.test(text);
    const location = /^(?:donde estan(?: ubicados)?|donde queda la tienda|cual es (?:su|la) direccion|direccion|ubicacion|como llegar a la tienda)$/.test(text);
    if (hours) return { fast_path: true, action: 'respond', topic: 'horario',
      reply: formatStoreInfoReply('horario') + namePrompt, confidence: jev.intent_confidence };
    if (location) return { fast_path: true, action: 'respond', topic: 'ubicacion',
      reply: '📍 *Ubicación*\n' + getStoreData().location + '\n\n¿En qué producto te podemos ayudar? 👨🏻‍🔧' + namePrompt,
      confidence: jev.intent_confidence };
    return pass;
  }

  if (jev.intent === 'human_request' &&
    /^(?:(?:quiero|necesito|puedo) (?:hablar|comunicarme|contactar) con|(?:pasame|comunicame) con) (?:un |una )?(?:asesor(?:a)?(?: humano)?|humano|persona|empleado)$/.test(text)) {
    return { fast_path: true, action: 'handoff', query: raw,
      reply: '[PEDIR_AYUDA]', confidence: jev.intent_confidence };
  }
  return pass;
}

module.exports = {
  resolveConversation,
  searchDecision,
  searchGuard,
  fastRouter,
  STORE_INFO,
  getStoreInfo,
  formatStoreInfoReply,
  detectStoreInfoTopic
};
