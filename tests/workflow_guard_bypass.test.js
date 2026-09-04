// Regression lock for tests/support/workflow-text.js.
//
// The four blind spots fixed in commit 04ff474 all shared one shape: an
// assertion that recognized only one syntactic form of the thing it guarded.
// They were proven fixed only by throwaway manual mutation at the time, which
// leaves nothing in the repo to stop a future refactor from silently
// reintroducing any of them while `npm test` stays green.
//
// This file feeds SYNTHETIC workflow text (never .github/workflows/*.yml)
// through the shared helpers and asserts every known bypass is caught, plus
// the legitimate patterns that must never false-positive. Each table is a
// flat list of { name, yaml, expectDetected } (or, for extractOnSection,
// { name, yaml, expectContains, expectNotContains }) -- adding a future
// bypass case is a one-line addition to the relevant table, not new test
// plumbing.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { findSecretsInRunBlocks, extractOnSection } = require('./support/workflow-text');

// -- findSecretsInRunBlocks: cases that MUST be flagged (non-empty offenders) --
const secretLeakCases = [
  {
    name: 'shell var assigned from a secret, printed later with echo',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: |',
      '          VALUE="${{ secrets.SUPABASE_URL }}"',
      '          echo "$VALUE"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'shell var assigned from a secret, printed later with printf',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: |',
      '          VALUE="${{ secrets.SUPABASE_URL }}"',
      '          printf \'%s\' "$VALUE"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'shell var assigned from a secret, printed later via cat heredoc',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: |',
      '          VALUE="${{ secrets.SUPABASE_URL }}"',
      '          cat <<HEREDOC_EOF',
      '          $VALUE',
      '          HEREDOC_EOF',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'single-line run: echo "${{ secrets.X }}"',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'compact step form "- run: echo ${{ secrets.X }}" (the last hole found)',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'compact step form with a block scalar body',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: |',
      '          echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'folded scalar "run: >" carrying a secret',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: >',
      '          echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'),
    expectDetected: true,
  },
  {
    name: 'secret on the last line of a run: block at end-of-file, no trailing newline',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Leak',
      '        run: |',
      '          echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'), // deliberately no trailing '\n' after this join
    expectDetected: true,
  },
  {
    name: 'two run: blocks in one file, only the second leaks -- scanning resumes after a block ends',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Safe',
      '        run: |',
      '          echo "hello"',
      '      - name: Leak',
      '        run: |',
      '          echo "${{ secrets.SUPABASE_URL }}"',
    ].join('\n'),
    expectDetected: true,
  },
];

// -- findSecretsInRunBlocks: cases that MUST NOT be flagged (no false positives) --
const secretSafeCases = [
  {
    name: 'step-level env: mapping with four secrets, followed by a clean run: block (live.yml "Materialize .env" pattern)',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Materialize .env',
      '        env:',
      '          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}',
      '          SUPABASE_KEY: ${{ secrets.SUPABASE_KEY }}',
      '          SUPABASE_SERVICE_ROLE: ${{ secrets.SUPABASE_SERVICE_ROLE }}',
      '          SUPABASE_JWT_SECRET: ${{ secrets.SUPABASE_JWT_SECRET }}',
      '        run: |',
      '          echo "materializing .env"',
    ].join('\n'),
    expectDetected: false,
  },
  {
    name: 'run: block mentioning the literal word "secrets" with no dot',
    yaml: [
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Mention',
      '        run: |',
      '          echo "check the secrets manager UI"',
    ].join('\n'),
    expectDetected: false,
  },
  {
    name: 'a YAML comment mentioning secrets. outside any run: block',
    yaml: [
      '# this workflow references secrets. in a comment only, never inside run:',
      'jobs:',
      '  build:',
      '    steps:',
      '      - name: Noop',
      '        run: |',
      '          echo "hi"',
    ].join('\n'),
    expectDetected: false,
  },
];

for (const { name, yaml, expectDetected } of [...secretLeakCases, ...secretSafeCases]) {
  test(`findSecretsInRunBlocks: ${name}`, () => {
    const offenders = findSecretsInRunBlocks(yaml, 'synthetic.yml');
    if (expectDetected) {
      assert.notStrictEqual(offenders.length, 0,
        `expected an offender to be reported for: ${name}`);
    } else {
      assert.deepStrictEqual(offenders, [],
        `expected no offenders (false positive) for: ${name} -- got: ${offenders.join(', ')}`);
    }
  });
}

// -- extractOnSection cases --
const onSectionCases = [
  {
    name: 'block style on: section contains workflow_dispatch, not push',
    yaml: [
      'on:',
      '  workflow_dispatch:',
      '    inputs:',
      '      target:',
      '        required: true',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: echo hi',
    ].join('\n'),
    expectContains: ['workflow_dispatch'],
    expectNotContains: ['push'],
  },
  {
    name: 'flow style array on: [push, workflow_dispatch] must expose push for the word-boundary check',
    yaml: [
      'on: [push, workflow_dispatch]',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: echo hi',
    ].join('\n'),
    expectContains: ['push'],
    expectNotContains: [],
  },
  {
    name: 'flow style mapping on: {push: {...}, workflow_dispatch: null} must expose push',
    yaml: [
      'on: {push: {branches: [master]}, workflow_dispatch: null}',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: echo hi',
    ].join('\n'),
    expectContains: ['push'],
    expectNotContains: [],
  },
  {
    name: 'on: section stops at the next column-0 key, excluding a later job step that mentions push',
    yaml: [
      'on:',
      '  workflow_dispatch:',
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: echo push',
    ].join('\n'),
    expectContains: ['workflow_dispatch'],
    expectNotContains: ['push'],
  },
];

for (const { name, yaml, expectContains, expectNotContains } of onSectionCases) {
  test(`extractOnSection: ${name}`, () => {
    const section = extractOnSection(yaml);
    for (const needle of expectContains) {
      assert.ok(section.includes(needle),
        `expected extracted on: section to contain "${needle}" for: ${name} -- got: ${JSON.stringify(section)}`);
    }
    for (const needle of expectNotContains) {
      assert.ok(!section.includes(needle),
        `expected extracted on: section NOT to contain "${needle}" for: ${name} -- got: ${JSON.stringify(section)}`);
    }
  });
}
