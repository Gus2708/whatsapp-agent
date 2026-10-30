// Runs the burst-debounce harness against the "Debounce Ráfaga" node in n8n_workflow.json.
// The sliding debounce (v2) regressed silently to the fixed 7 s sleep when the production
// baseline was adopted, because this harness was not part of the suite.
const test = require('node:test');
const assert = require('node:assert');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('Debounce Ráfaga keeps the sliding-window behavior', () => {
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', '_test_debounce_rafaga.js')], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});
