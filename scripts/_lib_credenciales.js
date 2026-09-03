'use strict';

// Single source of truth for the live-harness credentials (SUPABASE_URL,
// SUPABASE_ANON_KEY, OPENAI_API_KEY, OPENROUTER_API_KEY). Mirrors the
// .env-file-first, process.env-fallback precedence of
// scripts/check_live_env.js:30-34 so a harness never disagrees with the
// `pretest:live` preflight about what is actually available.
//
// Never logs or returns a credential value in an error: only variable NAMES
// ever appear in a thrown message. Returned objects are frozen.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const CLAVES = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY'];
const REQUERIDAS_SUPABASE = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];

let cache = null;

// Reads .env once per process (memoized). Missing key -> '' (empty string).
// NEVER throws: an absent .env file or an absent variable both degrade to ''.
function leerCredenciales() {
  if (cache) return cache;

  let envFileContent = '';
  try {
    envFileContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  } catch (e) {
    // No .env file: fall through to process.env only.
  }

  function pick(nombre) {
    const fromFile = ((envFileContent.match(new RegExp('^' + nombre + '=(.*)$', 'm')) || [])[1] || '').trim();
    if (fromFile) return fromFile;
    return String(process.env[nombre] || '').trim();
  }

  const valores = {};
  for (const nombre of CLAVES) valores[nombre] = pick(nombre);
  cache = Object.freeze(valores);
  return cache;
}

// Throws CredencialesFaltantes when any named credential is falsy. Returns the
// same frozen object as leerCredenciales() otherwise.
function exigirCredenciales(nombres) {
  const requeridas = nombres || REQUERIDAS_SUPABASE;
  const valores = leerCredenciales();
  const faltantes = requeridas.filter((nombre) => !valores[nombre]);
  if (faltantes.length > 0) {
    const err = new Error(
      '[credenciales] Missing required credential(s): ' + faltantes.join(', ') + '\n' +
      '[credenciales] Set them in .env at the repo root (or export them) before running a live harness. No credential value is ever printed.'
    );
    err.name = 'CredencialesFaltantes';
    err.faltantes = faltantes;
    throw err;
  }
  return valores;
}

// Builds the exact 4-key $env object handed to the dynamically-evaluated
// live_buscar.js / live_presupuesto.js bodies. Never spreads process.env: the
// object's stdout is persisted to disk (see design D6), so the surface must
// stay bounded to these 4 names.
function construirEnv(opciones) {
  const { sinVector, exigir } = opciones || {};
  const valores = exigirCredenciales(exigir || REQUERIDAS_SUPABASE);
  return Object.freeze({
    SUPABASE_URL: valores.SUPABASE_URL,
    SUPABASE_ANON_KEY: valores.SUPABASE_ANON_KEY,
    OPENAI_API_KEY: sinVector ? '' : valores.OPENAI_API_KEY,
    OPENROUTER_API_KEY: valores.OPENROUTER_API_KEY,
  });
}

module.exports = { leerCredenciales, exigirCredenciales, construirEnv, CLAVES, REQUERIDAS_SUPABASE };
