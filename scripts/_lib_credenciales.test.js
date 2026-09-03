'use strict';

// Unit test for scripts/_lib_credenciales.js. Lives OUTSIDE tests/ on purpose: the
// hermetic glob "tests/**/*.test.js" (package.json) must never pick it up, and this
// file is scoped to scripts/ credential plumbing, not the offline matcher suite.
//
// Every scenario supplies a fake .env CONTENT through a mocked fs.readFileSync; the
// real repo .env is never read. The module is re-required per scenario because it
// memoizes credentials for the lifetime of the process.

const assert = require('node:assert/strict');
const { test, mock, beforeEach, afterEach } = require('node:test');
const fs = require('fs');

const MODULE_PATH = require.resolve('./_lib_credenciales.js');
const CLAVES = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'];
const originalReadFileSync = fs.readFileSync;
const envSnapshot = {};

beforeEach(() => {
  for (const nombre of CLAVES) {
    envSnapshot[nombre] = process.env[nombre];
    delete process.env[nombre];
  }
});

afterEach(() => {
  mock.restoreAll();
  delete require.cache[MODULE_PATH];
  for (const nombre of CLAVES) {
    if (envSnapshot[nombre] === undefined) delete process.env[nombre];
    else process.env[nombre] = envSnapshot[nombre];
  }
});

// contenido === null simulates an absent .env file (ENOENT), never the real one.
function cargarConEnv(contenido) {
  delete require.cache[MODULE_PATH];
  mock.method(fs, 'readFileSync', function (ruta, ...resto) {
    if (String(ruta).endsWith('.env')) {
      if (contenido === null) {
        const err = new Error("ENOENT: no such file or directory, open '.env'");
        err.code = 'ENOENT';
        throw err;
      }
      return contenido;
    }
    return originalReadFileSync.call(fs, ruta, ...resto);
  });
  return require('./_lib_credenciales.js');
}

test('leerCredenciales returns a frozen object with all 4 keys when present', () => {
  const { leerCredenciales } = cargarConEnv(
    'SUPABASE_URL=https://x.supabase.co\n' +
    'SUPABASE_ANON_KEY=anon-123\n' +
    'OPENAI_API_KEY=sk-openai\n' +
    'OPENROUTER_API_KEY=sk-router\n'
  );
  const creds = leerCredenciales();
  assert.equal(creds.SUPABASE_URL, 'https://x.supabase.co');
  assert.equal(creds.SUPABASE_ANON_KEY, 'anon-123');
  assert.equal(creds.OPENAI_API_KEY, 'sk-openai');
  assert.equal(creds.OPENROUTER_API_KEY, 'sk-router');
  assert.ok(Object.isFrozen(creds));
});

test('leerCredenciales never throws even when every credential is absent', () => {
  const { leerCredenciales } = cargarConEnv('');
  const creds = leerCredenciales();
  for (const nombre of CLAVES) assert.equal(creds[nombre], '');
});

test('exigirCredenciales throws naming only the missing SUPABASE_URL', () => {
  const { exigirCredenciales } = cargarConEnv(
    'SUPABASE_ANON_KEY=anon-123\n' +
    'OPENAI_API_KEY=sk-openai\n' +
    'OPENROUTER_API_KEY=sk-router\n'
  );
  assert.throws(
    () => exigirCredenciales(),
    (err) => {
      assert.equal(err.name, 'CredencialesFaltantes');
      assert.deepEqual(err.faltantes, ['SUPABASE_URL']);
      assert.match(err.message, /Missing required credential\(s\): SUPABASE_URL$/m);
      assert.doesNotMatch(err.message, /anon-123|sk-openai|sk-router/);
      return true;
    }
  );
});

test('exigirCredenciales names both missing Supabase keys, comma-joined, in CLAVES order', () => {
  const { exigirCredenciales } = cargarConEnv('OPENAI_API_KEY=sk-openai\nOPENROUTER_API_KEY=sk-router\n');
  assert.throws(
    () => exigirCredenciales(),
    (err) => {
      assert.deepEqual(err.faltantes, ['SUPABASE_URL', 'SUPABASE_ANON_KEY']);
      assert.match(err.message, /Missing required credential\(s\): SUPABASE_URL, SUPABASE_ANON_KEY$/m);
      return true;
    }
  );
});

test('construirEnv({sinVector:true}) forces OPENAI_API_KEY to an empty string', () => {
  const { construirEnv } = cargarConEnv(
    'SUPABASE_URL=https://x.supabase.co\n' +
    'SUPABASE_ANON_KEY=anon-123\n' +
    'OPENAI_API_KEY=sk-openai\n' +
    'OPENROUTER_API_KEY=sk-router\n'
  );
  const env = construirEnv({ sinVector: true });
  assert.equal(env.OPENAI_API_KEY, '');
  assert.equal(env.SUPABASE_URL, 'https://x.supabase.co');
});

test('construirEnv() returns exactly the 4 CLAVES keys, frozen', () => {
  const { construirEnv } = cargarConEnv(
    'SUPABASE_URL=https://x.supabase.co\n' +
    'SUPABASE_ANON_KEY=anon-123\n' +
    'OPENAI_API_KEY=sk-openai\n' +
    'OPENROUTER_API_KEY=sk-router\n'
  );
  const env = construirEnv();
  assert.deepEqual(Object.keys(env).sort(), [...CLAVES].sort());
  assert.ok(Object.isFrozen(env));
});

test('leerCredenciales falls back to process.env when the .env file is absent', () => {
  process.env.SUPABASE_URL = 'https://from-process-env.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-from-process-env';
  const { leerCredenciales } = cargarConEnv(null);
  const creds = leerCredenciales();
  assert.equal(creds.SUPABASE_URL, 'https://from-process-env.supabase.co');
  assert.equal(creds.SUPABASE_ANON_KEY, 'anon-from-process-env');
});

// The fallback test above only proves process.env is used when the file is
// ABSENT. It says nothing about which source wins when both hold a value, so a
// mutation flipping the precedence would slip through. This pins the direction:
// the file wins, matching scripts/check_live_env.js so a harness and the
// pretest:live preflight can never disagree about what is configured.
test('leerCredenciales prefers the .env file over process.env when both differ', () => {
  process.env.SUPABASE_URL = 'https://from-process-env.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-from-process-env';
  const { leerCredenciales } = cargarConEnv(
    'SUPABASE_URL=https://from-file.supabase.co\n' +
    'SUPABASE_ANON_KEY=anon-from-file\n'
  );
  const creds = leerCredenciales();
  assert.equal(creds.SUPABASE_URL, 'https://from-file.supabase.co');
  assert.equal(creds.SUPABASE_ANON_KEY, 'anon-from-file');
});

// sinVector must neutralize ONLY the embedding key. Asserting the emptied key
// alone would still pass if the option wiped OPENROUTER_API_KEY too, which
// would silently disable the LLM rescue layer instead of just the vector one.
test('construirEnv({sinVector:true}) leaves OPENROUTER_API_KEY intact', () => {
  const { construirEnv } = cargarConEnv(
    'SUPABASE_URL=https://x.supabase.co\n' +
    'SUPABASE_ANON_KEY=anon-123\n' +
    'OPENAI_API_KEY=sk-openai\n' +
    'OPENROUTER_API_KEY=sk-router\n'
  );
  const env = construirEnv({ sinVector: true });
  assert.equal(env.OPENAI_API_KEY, '');
  assert.equal(env.OPENROUTER_API_KEY, 'sk-router');
  assert.equal(env.SUPABASE_ANON_KEY, 'anon-123');
});
