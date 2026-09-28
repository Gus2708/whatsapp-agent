'use strict';

// Request state, never a confirmed catalog selection. Deliberately cable-only.
function resolveConversation(message, previous, session, now) {
  const raw = String(message || '');
  const text = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const colors = 'azul|rojo|negro|blanco|verde|amarillo';
  const cable = new RegExp('^cable(?: (thwn|thhn))?(?: #?(\\d{1,2}))?(?: (' + colors + '))?(?: por (metro|rollo))?$').exec(text);
  const gauge = /^(?:(?:y|pero) )?(?:el |de )?(?:#|calibre )(\d{1,2})$/.exec(text);
  const presentation = /^(?:pero |y )?por (metro|rollo)$/.exec(text);
  const reference = gauge || presentation || /^\d+$/.test(text) || new RegExp('^(?:(?:y|pero) )?(?:el|ese|este|la|esa|esta)(?: (' + colors + '|#?\\d{1,2}))?$').test(text);
  const valid = previous && previous.version === 1 && previous.session === session &&
    Number.isFinite(previous.expires_at) && previous.expires_at > now &&
    previous.expires_at <= now + 30 * 60000 && previous.confirmed === false &&
    /^(thwn|thhn)?$/.test(previous.variant) && /^(\d{1,2})?$/.test(previous.gauge) &&
    new RegExp('^(' + colors + ')?$').test(previous.color) && /^(metro|rollo)?$/.test(previous.presentation);
  let state = null;
  if (session && cable) {
    state = { variant: cable[1] || '', gauge: cable[2] || '', color: cable[3] || '', presentation: cable[4] || '' };
  } else if (session && valid && (gauge || presentation)) {
    state = { variant: previous.variant, gauge: gauge ? gauge[1] : previous.gauge,
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

module.exports = { resolveConversation, searchDecision, searchGuard };
