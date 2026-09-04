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

// Indentation (leading whitespace count) of a raw line, no trimming of the rest.
const indentOf = (line) => line.match(/^(\s*)/)[1].length;
const isBlank = (line) => line.trim().length === 0;

// Walk the file line by line and find every `run:` step key, then track its
// block body by indentation (not a flat "same line" filter, which a
// multi-line split of `secrets.X` into a shell variable trivially evades).
// A `run:` block's body is every following line that is blank OR indented
// strictly deeper than the `run:` line itself; the block ends at the first
// non-blank line indented at or shallower than the `run:` line. A single-line
// `run: something` form also has its own line checked as body.
// `env:` mappings sit at the same indentation as `run:` (a sibling step key),
// so they are never swept into a `run:` block's body -- secrets legitimately
// declared there (e.g. live.yml's "Materialize .env" step) are left alone.
function findSecretsInRunBlocks(text, fileLabel) {
  const lines = text.split('\n');
  const offenders = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // The optional leading `- ` covers YAML's compact step form (`- run: ...`),
    // where `run` is the step's first key. Matching only a bare `run:` skips
    // that block whole -- the same one-syntactic-form blind spot this helper
    // exists to close.
    if (!/^-?\s*run:(\s|$)/.test(line.trim())) continue;

    const runIndent = indentOf(line);
    if (line.includes('secrets.')) {
      offenders.push(`${fileLabel}:${i + 1}`);
    }

    let j = i + 1;
    for (; j < lines.length; j++) {
      const bodyLine = lines[j];
      if (isBlank(bodyLine)) continue;
      if (indentOf(bodyLine) > runIndent) {
        if (bodyLine.includes('secrets.')) {
          offenders.push(`${fileLabel}:${j + 1}`);
        }
        continue;
      }
      break; // shallower or equal indentation -- the run: block has ended
    }
    i = j - 1; // resume scanning right after this block
  }

  return offenders;
}

// Extract the `on:` trigger section as raw text: from the column-0 `on:` line
// through (but not including) the next column-0 key. Works for both block
// style (`on:\n  push:\n    ...`) and flow style (`on: {push: {...}}` or
// `on: [push, workflow_dispatch]`), since a flow-style trigger list is a
// single line and the next column-0 key line immediately closes the section.
function extractOnSection(text) {
  const lines = text.split('\n');
  const startIdx = lines.findIndex((l) => /^on:/.test(l));
  if (startIdx === -1) return '';
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join('\n');
}

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
  // Anchored at column 0 (`^permissions:` with no leading `\s*` in the
  // pattern) so a `permissions:` block nested inside a job, or mentioned in a
  // comment, cannot satisfy this -- only the workflow-level declaration can.
  assert.match(ci, /^permissions:\s*\n\s*contents:\s*read/m,
    'ci.yml must declare top-level permissions: { contents: read }');
});

test('live.yml: never uses pull_request_target', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(live.includes('pull_request_target'), false,
    'live.yml must never use pull_request_target');
});

test('live.yml: triggers only via workflow_dispatch', () => {
  const live = readWorkflow(LIVE_PATH);
  const onSection = extractOnSection(live);
  assert.notStrictEqual(onSection, '', 'live.yml must declare an `on:` trigger section');
  // Word-boundary matches so "pull_request_target" doesn't fool the
  // "no pull_request" check, and flow-style triggers (`on: [push, ...]` or
  // `on: {push: {...}}`) are caught just as well as block style.
  assert.strictEqual(/\bpush\b/.test(onSection), false,
    'live.yml must trigger only via workflow_dispatch, never push');
  assert.strictEqual(/\bschedule\b/.test(onSection), false,
    'live.yml must trigger only via workflow_dispatch, never schedule');
  assert.strictEqual(/\bpull_request\b/.test(onSection), false,
    'live.yml must trigger only via workflow_dispatch, never pull_request');
  assert.strictEqual(/\brepository_dispatch\b/.test(onSection), false,
    'live.yml must trigger only via workflow_dispatch, never repository_dispatch');
  assert.strictEqual(/\bworkflow_dispatch\b/.test(onSection), true,
    'live.yml must declare workflow_dispatch as a trigger');
});

test('live.yml: declares environment: live', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.match(live, /environment:\s*live/,
    'live.yml must declare environment: live so environment-scoped secrets and branch policy apply');
});

test('live.yml: declares permissions with contents: read', () => {
  const live = readWorkflow(LIVE_PATH);
  // Same column-0 anchor as ci.yml's check above -- see that test's comment.
  assert.match(live, /^permissions:\s*\n\s*contents:\s*read/m,
    'live.yml must declare top-level permissions: { contents: read }');
});

test('live.yml: never uploads an artifact (no path to exfiltrate a materialized .env)', () => {
  const live = readWorkflow(LIVE_PATH);
  assert.strictEqual(live.includes('actions/upload-artifact'), false,
    'live.yml must never reference actions/upload-artifact');
});

test('neither workflow echoes a secret value to the log', () => {
  const ci = readWorkflow(CI_PATH);
  const live = readWorkflow(LIVE_PATH);
  // Position-agnostic: `secrets.` may never appear inside a `run:` block's
  // body at all, regardless of which line or which command (echo, printf,
  // or a variable assignment followed by a print on a later line) exposes
  // it. It may only appear in a step's `env:` mapping.
  const offenders = [
    ...findSecretsInRunBlocks(ci, 'ci.yml'),
    ...findSecretsInRunBlocks(live, 'live.yml'),
  ];
  assert.deepStrictEqual(offenders, [],
    `no run: block may reference "secrets." (secrets belong in env: only) -- offenders: ${offenders.join(', ')}`);
});
