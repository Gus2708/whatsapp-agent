// Guard for scripts/check_declared_environments.js -- an advisory check that
// compares every `environment:` declared across .github/workflows/*.yml
// against the environments GitHub actually reports existing (see design D4:
// live.yml's `environment: live` deployment-branch-policy gate was the
// load-bearing control on the whole live tier, and for weeks the environment
// itself simply didn't exist in the repo, so the control silently never
// applied -- nothing here proves that can't happen again, but it makes the
// gap visible in a CI log instead of invisible).
//
// The script keeps its comparison logic (declared set + existing list ->
// missing list) as a pure, importable function with no filesystem/process/
// network access, so this test drives it directly over synthetic workflow
// text and synthetic environment lists -- never real files or `gh api`.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  extractDeclaredEnvironments,
  computeMissingEnvironments,
} = require('../scripts/check_declared_environments');

test('computeMissingEnvironments: exact match reports nothing missing', () => {
  const result = computeMissingEnvironments(['live'], ['live', 'staging']);
  assert.deepStrictEqual(result.missing, []);
  assert.strictEqual(result.unknown, false);
});

test('computeMissingEnvironments: a declared environment absent from the existing list is reported', () => {
  const result = computeMissingEnvironments(['live', 'preview'], ['live']);
  assert.deepStrictEqual(result.missing, ['preview']);
  assert.strictEqual(result.unknown, false);
});

test('computeMissingEnvironments: declaring the same environment in two workflows is deduplicated', () => {
  const fromCi = extractDeclaredEnvironments('jobs:\n  a:\n    environment: live\n');
  const fromLive = extractDeclaredEnvironments('jobs:\n  b:\n    environment: live\n');
  const result = computeMissingEnvironments([...fromCi, ...fromLive], ['live']);
  assert.deepStrictEqual(result.declared, ['live'],
    'the same name declared twice across files must collapse to one entry');
  assert.deepStrictEqual(result.missing, []);
});

test('computeMissingEnvironments: an unusable/absent existing list is treated as unknown, never as a clean pass', () => {
  const result = computeMissingEnvironments(['live'], undefined);
  assert.strictEqual(result.unknown, true);
  assert.deepStrictEqual(result.missing, [],
    'an unknown result must not be mistaken for "checked, zero missing" by a caller reading only `missing`');
});

test('extractDeclaredEnvironments: plain form "environment: live"', () => {
  const found = extractDeclaredEnvironments('jobs:\n  deploy:\n    environment: live\n');
  assert.deepStrictEqual(found, ['live']);
});

test('extractDeclaredEnvironments: mapping form "environment:\\n  name: staging"', () => {
  const text = [
    'jobs:',
    '  deploy:',
    '    environment:',
    '      name: staging',
    '      url: https://staging.example.com',
  ].join('\n');
  assert.deepStrictEqual(extractDeclaredEnvironments(text), ['staging']);
});

test('extractDeclaredEnvironments: a match inside a # comment is ignored', () => {
  const text = [
    '# environment: live',
    'jobs:',
    '  build:',
    '    steps:',
    '      - run: echo hi',
  ].join('\n');
  assert.deepStrictEqual(extractDeclaredEnvironments(text), []);
});

test('extractDeclaredEnvironments: an inline # comment after a real declaration does not corrupt the name', () => {
  const text = 'jobs:\n  deploy:\n    environment: live # secret scoping + branch policy\n';
  assert.deepStrictEqual(extractDeclaredEnvironments(text), ['live']);
});
