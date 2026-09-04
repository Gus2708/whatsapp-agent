// Shared raw-text helpers for guarding GitHub Actions workflow files without a
// YAML parser (root stays at zero deps). Extracted from ci_workflow_guard.test.js
// so the same logic can be locked in by a synthetic-corpus regression test
// (workflow_guard_bypass.test.js) instead of only being exercised against the
// two real workflow files.
'use strict';

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

module.exports = { indentOf, isBlank, findSecretsInRunBlocks, extractOnSection };
