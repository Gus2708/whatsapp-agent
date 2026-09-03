const test = require('node:test');
const assert = require('node:assert');
const { createFakeAxios, assertAllMatched } = require('./support/fake-axios.js');

const HANDLERS = [{ when: (r) => r.path === '/rest/v1/productos', reply: () => [{ codigo_interno: 'X' }] }];
const BASE = 'http://supabase.test';

test('fake-axios: a matched request returns the handler payload', async () => {
  const fake = createFakeAxios(HANDLERS);
  const res = await fake.get(BASE + '/rest/v1/productos?select=*');
  assert.deepStrictEqual(res.data, [{ codigo_interno: 'X' }]);
  assert.deepStrictEqual(fake.unmatched, []);
});

test('fake-axios: an unmatched request throws, naming method and path', async () => {
  const fake = createFakeAxios(HANDLERS);
  await assert.rejects(
    () => fake.get(BASE + '/rest/v1/otra_tabla?x=1'),
    /unmatched request GET \/rest\/v1\/otra_tabla\?x=1/
  );
});

// The guard this whole design rests on: every axios call site in live_buscar.js is
// wrapped in a swallowing try/catch, so the throw alone never reaches the test.
// The recording is the only signal that survives -- assert it does.
test('fake-axios: the unmatched request is still recorded when the throw is swallowed', async () => {
  const fake = createFakeAxios(HANDLERS);
  try {
    await fake.get(BASE + '/rest/v1/otra_tabla');
  } catch (e) { /* exactly what live_buscar.js does */ }
  assert.deepStrictEqual(fake.unmatched, ['GET /rest/v1/otra_tabla']);
  assert.throws(() => assertAllMatched(fake), /1 request\(s\) left unmatched/);
});

test('fake-axios: assertAllMatched is a no-op when every request matched', async () => {
  const fake = createFakeAxios(HANDLERS);
  await fake.get(BASE + '/rest/v1/productos');
  assert.doesNotThrow(() => assertAllMatched(fake));
});
