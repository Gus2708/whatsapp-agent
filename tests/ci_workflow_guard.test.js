// Hermetic guard over the two GitHub Actions workflow files. Zero dependencies,
// no YAML parser (root stays at zero deps) -- assertions run over raw text.
// This is a standing regression gate for the security invariants from
// sdd/ci-pipeline/design (D3, D8) and sdd/ci-pipeline/spec ("No Credential
// Value in Logs"). It intentionally fails until both workflow files exist.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CI_PATH = path.join(ROOT, '.github', 'workflows', 'ci.yml');
const LIVE_PATH = path.join(ROOT, '.github', 'workflows', 'live.yml');

const readWorkflow = (p) => fs.readFileSync(p, 'utf8');

const linesContaining = (text, needle) =>
  text.split('\n').filter((line) => line.includes(needle));

test('ci.yml: never references a GitHub secret', () => {
  const ci = readWorkflow(CI_PATH);
  assert.strictEqual(ci.includes('secrets.'), false,
    'ci.yml must stay credential-free -- found a "secrets." reference');
});

test('ci.yml: never uses pull_request_target', () => {
  const ci = readWorkflow(CI_PATH);
  assert.strictEqual(ci.includes('pull_request_target'), false,
    'ci.yml must never use pull_request_target (would run PR code with base-repo secrets)');
});

test('ci.yml: declares permissions with contents: read', () => {
  const ci = readWorkflow(CI_PATH);
  assert.match(ci, /permissions:\s*\n\s*contents:\s*read/,
    'ci.yml must declare permissions: { contents: read }');
});

test('live.yml: never uses pull_request_target', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(live.includes('pull_request_target'), false,
    'live.yml must never use pull_request_target');
});

test('live.yml: never triggers on push', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(/^\s*push:/m.test(live), false,
    'live.yml must trigger only via workflow_dispatch, never push');
});

test('live.yml: never triggers on a schedule', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(/^\s*schedule:/m.test(live), false,
    'live.yml must trigger only via workflow_dispatch, never schedule');
});

test('live.yml: declares environment: live', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.match(live, /environment:\s*live/,
    'live.yml must declare environment: live so environment-scoped secrets and branch policy apply');
});

test('live.yml: declares permissions with contents: read', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.match(live, /permissions:\s*\n\s*contents:\s*read/,
    'live.yml must declare permissions: { contents: read }');
});

test('live.yml: never uploads an artifact (no path to exfiltrate a materialized .env)', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(live.includes('actions/upload-artifact'), false,
    'live.yml must never reference actions/upload-artifact');
});

test('neither workflow echoes a secret value to the log', () => {
  const ci = readWorkflow(CI_PATH);
  const live = readWorkflow(LIVE_PATH);
  const ciOffenders = linesContaining(ci, 'echo').filter((l) => l.includes('secrets.'));
  const liveOffenders = linesContaining(live, 'echo').filter((l) => l.includes('secrets.'));
  assert.deepStrictEqual(ciOffenders, [], 'ci.yml must not echo a line containing "secrets."');
  assert.deepStrictEqual(liveOffenders, [], 'live.yml must not echo a line containing "secrets."');
});
