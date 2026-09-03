// Hermetic axios double for tests driving scratch_live/live_buscar.js.
//
// Design intent (sdd/testing-foundation): every axios call site in live_buscar.js sits
// inside a swallowing try/catch, so a fake that only throws on an unmatched request is
// invisible to the test -- the error degrades into `encontrados: 0` with no diagnostic.
// This fake ALSO records every unmatched request in `unmatched[]`, and `assertAllMatched`
// makes the swallowed failure visible again.
'use strict';

function createFakeAxios(handlers) {
  const requests = [];
  const unmatched = [];

  function splitUrl(url) {
    // Strip the origin (SB is a full "http://host" base): handlers match on path+query only.
    const s = String(url).replace(/^https?:\/\/[^/]+/, '');
    const i = s.indexOf('?');
    return i === -1 ? { path: s, query: '' } : { path: s.slice(0, i), query: s.slice(i + 1) };
  }

  async function dispatch(method, url, body) {
    const { path, query } = splitUrl(url);
    const req = { method, path, query, body: body || null };
    requests.push(req);
    const handler = handlers.find((h) => h.when(req));
    if (!handler) {
      const label = method + ' ' + path + (query ? '?' + query : '');
      unmatched.push(label);
      throw new Error('fake-axios: unmatched request ' + label);
    }
    const data = await handler.reply(req);
    return { data };
  }

  return {
    get: (url) => dispatch('GET', url, null),
    post: (url, body) => dispatch('POST', url, body),
    requests,
    unmatched,
  };
}

function assertAllMatched(fake) {
  if (fake.unmatched.length > 0) {
    throw new Error(
      'fake-axios: ' + fake.unmatched.length + ' request(s) left unmatched (see design D1 -- '
      + 'a fake that only throws is invisible to swallowing try/catch in live_buscar.js):\n'
      + fake.unmatched.join('\n')
    );
  }
}

module.exports = { createFakeAxios, assertAllMatched };
