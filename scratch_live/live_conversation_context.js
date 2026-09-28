// Experimental single-instance state. Disabled by default; no database writes.
// BEGIN CONVERSATION FUNCTIONS
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
// END CONVERSATION FUNCTIONS
const input = $input.first().json;
let body = {}, payload = {};
try { body = $('Transcribir Nota de Voz').first().json.body || {}; payload = body.payload || {}; } catch (_) {}
const message = String(payload._rafaga_previa || '') + String(payload.body || '');
let enabled = false;
try { enabled = $env.CONVERSATION_STATE_ENABLED === 'true'; } catch (_) {}
let context = { action: 'disabled', query: message, state: null };
if (enabled) {
  const session = typeof body.session === 'string' && body.session && typeof payload.from === 'string' && payload.from
    ? JSON.stringify([body.session, payload.from]) : null;
  let store;
  const now = Date.now();
  try {
    const data = $getWorkflowStaticData('node');
    store = data.conversations || (data.conversations = {});
    for (const key of Object.keys(store)) {
      if (!store[key] || !Number.isFinite(store[key].expires_at) || store[key].expires_at <= now) delete store[key];
    }
  } catch (_) { store = null; }
  const previous = store && store[session];
  context = resolveConversation(message, previous, session, now);
  // Expose only prior request attributes for the optional shadow classifier.
  if (previous && previous.session === session && previous.expires_at > now &&
    previous.expires_at <= now + 30 * 60000 && previous.version === 1 && previous.confirmed === false) {
    context.previous_product = { variant: previous.variant, gauge: previous.gauge,
      color: previous.color, presentation: previous.presentation };
  }
  if (store && session) {
    delete store[session];
    if (context.state) {
      // Keep at most 200 small entries; eviction causes clarification, never guessing.
      const keys = Object.keys(store).sort((a, b) => store[a].expires_at - store[b].expires_at);
      while (keys.length >= 200) delete store[keys.shift()];
      store[session] = context.state;
    }
  }
}
return [{ json: { ...input, conversation_context: context } }];
