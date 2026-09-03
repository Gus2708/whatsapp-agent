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

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REQUIRED = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
];

let envFileContent = '';
try {
  envFileContent = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
} catch (e) {
  // No .env file: fall through to process.env only (still reported per-name below).
}

function pick(name) {
  const fromFile = ((envFileContent.match(new RegExp('^' + name + '=(.*)$', 'm')) || [])[1] || '').trim();
  if (fromFile) return fromFile;
  return String(process.env[name] || '').trim();
}

const missing = REQUIRED.filter((name) => !pick(name));

if (missing.length > 0) {
  console.error('[test:live] Missing required credential(s): ' + missing.join(', '));
  console.error('[test:live] Set them in .env (SUPABASE_URL has a hardcoded fallback in rag.js, but the rest do not) before running the live/credentialed suite.');
  process.exit(1);
}

console.log('[test:live] required credentials present: ' + REQUIRED.join(', '));
