// Advisory cross-check for sdd/ci-pipeline design D4: `.github/workflows/live.yml`
// declares `environment: live`, and the design calls that environment's
// deployment-branch-policy (master only) the load-bearing control on the
// whole live/credentialed tier. For weeks the `live` environment simply did
// not exist in this repository's GitHub settings, so the branch policy
// silently never applied -- and nothing in the repo noticed, because a
// workflow file that declares `environment: live` looks byte-for-byte
// identical whether that environment exists or not. There is no way to tell
// from the YAML alone; you have to ask GitHub.
//
// This script closes that blind spot by comparing every `environment:`
// declared across the workflow files against the environments GitHub
// actually reports existing (fetched by a CI step via
// `gh api repos/{owner}/{repo}/environments`, passed in as a JSON file path).
//
// This is advisory, never a gate: it always exits 0. A version of this check
// that could fail the build on "I couldn't obtain the list" would be worse
// than no check at all -- ci.yml's own header comment warns against "fixing"
// an advisory failure by deleting the job, and a hard-failing environment
// check with no network access (e.g. a fork's PR run with no `gh` auth)
// would train exactly that reflex. So: inability to check is reported loudly
// (a `::warning::` explaining why), but it is never conflated with "checked,
// found nothing missing" -- see the `unknown` flag below.
'use strict';

const fs = require('fs');
const path = require('path');

// -- pure logic: importable and testable with no filesystem/process/network --

// Leading-whitespace length of a raw line (same measure tests/support/workflow-text.js
// uses for `run:` blocks), used here to find the end of an `environment:` mapping.
const indentOf = (line) => line.match(/^(\s*)/)[1].length;

// Strip a `#` comment from one raw line. A `#` only starts a comment when
// preceded by start-of-line or whitespace -- plain-YAML assumption, matching
// tests/support/workflow-text.js; these workflow files never quote an
// environment name in a way that would need anything smarter.
function stripComment(rawLine) {
  const idx = rawLine.search(/(^|\s)#/);
  return idx === -1 ? rawLine : rawLine.slice(0, idx);
}

// Scan one workflow file's raw text for every `environment:` declaration, in
// both the plain form (`environment: live`) and the mapping form
// (`environment:` alone on its line, with `name: live` indented underneath --
// used when the job also sets `url:`). Returns names in file order with
// duplicates included; callers dedupe when merging across files.
function extractDeclaredEnvironments(text) {
  const lines = text.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]);
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const plain = trimmed.match(/^environment:\s*(\S+)\s*$/);
    if (plain) {
      found.push(plain[1]);
      continue;
    }

    if (/^environment:\s*$/.test(trimmed)) {
      const envIndent = indentOf(lines[i]);
      for (let j = i + 1; j < lines.length; j++) {
        const bodyLine = stripComment(lines[j]);
        if (bodyLine.trim() === '') continue;
        if (indentOf(lines[j]) <= envIndent) break; // mapping ended, no name: found under it
        const nameMatch = bodyLine.trim().match(/^name:\s*(\S+)\s*$/);
        if (nameMatch) {
          found.push(nameMatch[1]);
        }
        break; // only the first line of the mapping body is a candidate for `name:`
      }
    }
  }

  return found;
}

// Pure comparison: declared environment names (from the workflows) against
// the environments GitHub reports actually existing. `existingNames` must be
// a real array of strings to be usable -- anything else (missing argument,
// unreadable file, malformed JSON, no `.environments` array) means the list
// could not be obtained. That is NOT the same as "obtained an empty list",
// and it must never be reported as a clean pass: a caller that only looked
// at `missing` (which stays `[]`) would otherwise read "unknown" as "fine".
function computeMissingEnvironments(declaredNames, existingNames) {
  const declared = Array.from(new Set(declaredNames));

  if (!Array.isArray(existingNames)) {
    return { declared, existing: null, missing: [], unknown: true };
  }

  const existingSet = new Set(existingNames);
  const missing = declared.filter((name) => !existingSet.has(name));
  return { declared, existing: existingNames, missing, unknown: false };
}

// -- edges: argv, file reading, JSON parsing, printing --

// Reads the raw `GET /repos/{owner}/{repo}/environments` response from the
// path in argv[2] and pulls out `.environments[].name`. Returns `undefined`
// (never throws) for every "can't obtain a real list" case: no path given,
// unreadable file, invalid JSON, or a parsed body with no usable
// `environments` array -- e.g. `gh api` writing `{"message":"Not Found"}`
// after the `|| true` in the CI step that calls this script.
function readExistingEnvironments(argPath) {
  if (!argPath) return undefined;

  let raw;
  try {
    raw = fs.readFileSync(argPath, 'utf8');
  } catch (e) {
    return undefined;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    return undefined;
  }

  if (!json || !Array.isArray(json.environments)) return undefined;

  return json.environments
    .map((entry) => entry && entry.name)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

function main() {
  const ROOT = path.join(__dirname, '..');
  const workflowsDir = path.join(ROOT, '.github', 'workflows');

  let declaredNames = [];
  try {
    const files = fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f));
    for (const file of files) {
      const text = fs.readFileSync(path.join(workflowsDir, file), 'utf8');
      declaredNames = declaredNames.concat(extractDeclaredEnvironments(text));
    }
  } catch (e) {
    // No workflows directory to scan -- nothing declared, nothing to check.
  }

  const existingNames = readExistingEnvironments(process.argv[2]);
  const result = computeMissingEnvironments(declaredNames, existingNames);

  if (result.unknown) {
    console.log(
      '::warning::check_declared_environments could not obtain the repository\'s ' +
      'existing GitHub environments list (argument missing, file unreadable, or ' +
      'JSON had no usable "environments" array) -- the declared-vs-existing check ' +
      'was SKIPPED. This is not a confirmed clean result.'
    );
  }

  console.log(
    `[check_declared_environments] declared: ${result.declared.length ? result.declared.join(', ') : '(none)'}`
  );
  console.log(
    `[check_declared_environments] existing: ${
      result.unknown
        ? '(unknown -- could not obtain)'
        : (result.existing.length ? result.existing.join(', ') : '(none)')
    }`
  );

  if (!result.unknown) {
    for (const name of result.missing) {
      console.log(
        `::warning::workflow declares environment "${name}", which does not exist in ` +
        'this repository -- its scoped secrets and deployment branch policy are NOT in effect'
      );
    }
  }

  process.exit(0); // always advisory -- see header comment
}

if (require.main === module) {
  main();
}

module.exports = { extractDeclaredEnvironments, computeMissingEnvironments };
