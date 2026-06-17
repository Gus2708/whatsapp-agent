# Plan 004: Make `lib/serrucho-search.js` the single source of truth and guard the copies from drifting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a5262a1..HEAD -- scratch_live/ scripts/new_buscar.js scripts/new_presupuesto.js lib/`
> Also confirm Plan 003 has landed: `node -e "require('./lib/serrucho-search.js')"`
> must succeed. If `lib/serrucho-search.js` does not exist, STOP — this plan
> depends on Plan 003.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (adds one check script + a chained test command; no logic changes)
- **Depends on**: plans/003-verification-baseline-search-lib.md
- **Category**: tech-debt
- **Planned at**: commit `a5262a1`, 2026-06-12

## Why this matters

The ~120-line matching library (`norm`, `normMedida`, `medPresent`, `singular`,
`scoreMatch`, the synonym/color/caliber dictionaries…) is **copy-pasted** into at
least four files — `scratch_live/live_buscar.js`, `scratch_live/live_presupuesto.js`,
`scripts/new_buscar.js`, `scripts/new_presupuesto.js` — and again (stale) inside
`n8n_workflow.json`. This repo's own history shows the hazard: the `scripts/new_*.js`
copies previously drifted out of sync with the live dumps. Because n8n Code nodes
are self-contained strings, the duplication can't be removed at runtime — but it
**can** be made impossible to drift silently.

This plan declares `lib/serrucho-search.js` (created in Plan 003) the canonical
definition and adds a guard, run as part of `npm test`, that fails the moment any
copy diverges from it. It does not change any deployed behavior; it turns an
invisible failure mode (copies quietly disagreeing) into a loud, local test
failure. Plan 005 then uses the same idea for the workflow JSON.

## Current state

- Verified at planning time (commit `a5262a1`): the dev copies are **byte-identical**
  to the live dumps —
  - `scripts/new_buscar.js` ≡ `scratch_live/live_buscar.js` (both 244 lines)
  - `scripts/new_presupuesto.js` ≡ `scratch_live/live_presupuesto.js` (both 275 lines)
  So the guard below passes today; it exists to keep it that way.
- `lib/serrucho-search.js` (from Plan 003) exports the pure helper functions,
  each copied verbatim from `scratch_live/live_buscar.js` (and `parseItems` from
  `scratch_live/live_presupuesto.js`). Because they were copied verbatim,
  `lib.<fn>.toString()` returns the exact source text that also appears in those
  files — which is what the guard relies on.
- `package.json` after Plan 003 has:
  ```json
      "test": "node --test"
  ```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Run the new guard directly | `node scripts/check_sources_sync.js` | prints `sources in sync: OK`, exit 0 |
| Full test command | `npm test` | unit tests pass AND guard prints OK, exit 0 |
| Scope check | `git status --porcelain` | only `scripts/check_sources_sync.js`, `package.json`, `plans/README.md` |

## Scope

**In scope** (create / modify only these):
- `scripts/check_sources_sync.js` (create)
- `package.json` (extend the `test` script only)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- `lib/serrucho-search.js`, `scratch_live/*.js`, `scripts/new_*.js` — this plan
  only *checks* them; it does not edit them. (If the guard reports drift, that is
  a finding to report, not to silently "fix" by editing files here — see STOP.)
- `n8n_workflow.json` — handled by Plan 005.

## Git workflow

- Branch: `advisor/004-single-source-drift-guard`
- Commit message style: Conventional Commits, e.g.
  `test(search): guard lib/ as single source vs live dumps and dev copies`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `scripts/check_sources_sync.js`

Create the file exactly as below. It enforces two invariants: (a) the dev copies
equal the live dumps; (b) each canonical helper **function** in `lib/` appears
verbatim in the live `buscar`/`presupuesto` dumps.

```js
// Guard: lib/serrucho-search.js is the single source of truth for the matcher.
// Fails (non-zero exit) if any copy has drifted. Run via `npm test`.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const L = require('../lib/serrucho-search.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n'); // normalize CRLF→LF (Windows checkout) so Function.toString() (always LF) matches

// (a) dev copies must equal the live dumps (these are the source of truth)
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
```

**Verify**: `node scripts/check_sources_sync.js` → prints `sources in sync: OK`, exit 0.

### Step 2: Chain the guard into `npm test`

Update the `test` script in `package.json` so the guard runs with the unit tests:
```json
      "test": "node --test && node scripts/check_sources_sync.js"
```
Change nothing else.

**Verify**: `npm test` → unit tests report `# fail 0`, then `sources in sync: OK`, overall exit 0.

## Test plan

- No new behavioral tests; this plan *is* a test/guard. Its own verification is
  `node scripts/check_sources_sync.js` returning OK and `npm test` exiting 0.
- To prove the guard actually catches drift (optional, do NOT commit the change):
  temporarily append a space to one line of `scripts/new_buscar.js`, run
  `node scripts/check_sources_sync.js`, confirm it now exits non-zero with the
  "drifted" message, then `git checkout -- scripts/new_buscar.js` to restore.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node scripts/check_sources_sync.js` prints `sources in sync: OK` and exits 0
- [ ] `package.json` `scripts.test` === `node --test && node scripts/check_sources_sync.js`
- [ ] `npm test` exits 0 (unit tests + guard)
- [ ] `git status --porcelain` shows only `scripts/check_sources_sync.js`,
      `package.json`, `plans/README.md`
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/serrucho-search.js` does not exist (Plan 003 hasn't landed).
- The guard fails on its **first** run. That means a copy already drifted from
  the live dumps (a real inconsistency in the repo). Report which assertion
  failed; do not paper over it by editing source files in this plan — reconciling
  the drift is its own decision (the live dump `scratch_live/*` is the source of truth).
- `lib.<fn>.toString()` doesn't match because `lib/serrucho-search.js` was
  reformatted (e.g., by a formatter) after Plan 003 — the helpers must stay
  byte-identical to the live source; report rather than reformatting the dumps.

## Maintenance notes

- This guard does **not** eliminate the physical duplication (n8n Code nodes must
  stay self-contained), but it makes drift a failing test. The intended workflow
  going forward: edit the matcher in `lib/serrucho-search.js` + tests (Plan 003),
  then propagate the change into `scratch_live/*` / `scripts/new_*` / the workflow
  (Plan 005's regeneration), and `npm test` confirms everything agrees.
- If the dictionaries (`SIZEQ`, `SIN`, `ACCENTS`, `COLOR_STEM`) ever need their own
  drift guard, extend this script to compare `JSON.stringify(L.SIN)` etc. against
  the values parsed from the dumps. Deferred for now because the Plan 003 unit
  tests already exercise those dictionaries through `expandir`/`medPresent`/`stemColor`.
- Reviewer should confirm the guard is wired into `npm test` (not just present as
  a file) — otherwise it never runs.
