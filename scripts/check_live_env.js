// Preflight for `npm run test:live` (wired as `pretest:live`, npm runs it automatically).
// Prints the NAMES of any missing required credentials and exits non-zero -- never prints
// values, so a missing-credential failure never leaks a secret into CI logs or a terminal.
//
// IMPORTANT: rag.js reads credentials by parsing the raw `.env` FILE with its own regex
// (fs.readFileSync + a `pick(key)` helper), not via process.env / dotenv. A check that only
// looked at process.env would report "missing" even when a correctly-populated `.env` file
// makes `node rag.js suite` work fine. This preflight mirrors that exact sourcing so it
// reports what test:live will actually see.
'use strict';

const { leerCredenciales } = require('./_lib_credenciales');

const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY|SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
];

const creds = leerCredenciales();
const missing = [];
if (!creds.SUPABASE_URL) missing.push('SUPABASE_URL');
if (!(creds.SUPABASE_SERVICE_ROLE_KEY || creds.SUPABASE_SERVICE_KEY || creds.SUPABASE_ANON_KEY)) {
  missing.push('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY / SUPABASE_ANON_KEY)');
}
if (!creds.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
if (!creds.OPENROUTER_API_KEY) missing.push('OPENROUTER_API_KEY');

if (missing.length > 0) {
  console.error('[test:live] Missing required credential(s): ' + missing.join(', '));
  console.error('[test:live] Set them in .env before running the live/credentialed suite.');
  process.exit(1);
}

console.log('[test:live] required credentials present: ' + REQUIRED.join(', '));
