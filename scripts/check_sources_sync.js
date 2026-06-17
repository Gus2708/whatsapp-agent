// Guard: lib/serrucho-search.js is the single source of truth for the matcher.
// Fails (non-zero exit) if any copy has drifted. Run via `npm test`.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const L = require('../lib/serrucho-search.js');

const root = path.join(__dirname, '..');
// Normalize CRLF->LF: the Windows checkout is CRLF, but Function.prototype.toString() is always LF.
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');

// (a) dev copies must equal the live dumps (the source of truth)
assert.strictEqual(
  read('scripts/new_buscar.js'), read('scratch_live/live_buscar.js'),
  'scripts/new_buscar.js has drifted from scratch_live/live_buscar.js'
);
assert.strictEqual(
  read('scripts/new_presupuesto.js'), read('scratch_live/live_presupuesto.js'),
  'scripts/new_presupuesto.js has drifted from scratch_live/live_presupuesto.js'
);

// (b) each lib FUNCTION's source must appear verbatim in the live dumps
const buscar = read('scratch_live/live_buscar.js');
const presupuesto = read('scratch_live/live_presupuesto.js');
const sharedFns = ['nUSD', 'nBs', 'nBsInt', 'tc', 'norm', 'normMedida',
  'medPresent', 'stemColor', 'singular', 'expandir', 'esGranel', 'scoreMatch'];
for (const name of sharedFns) {
  assert.ok(
    buscar.includes(L[name].toString()),
    `lib.${name} source not found verbatim in scratch_live/live_buscar.js (lib drifted)`
  );
}
assert.ok(
  presupuesto.includes(L.parseItems.toString()),
  'lib.parseItems source not found verbatim in scratch_live/live_presupuesto.js'
);

console.log('sources in sync: OK');
