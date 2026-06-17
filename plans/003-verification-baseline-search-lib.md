# Plan 003: Establish a verification baseline — extract pure search logic into a tested `lib/`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a5262a1..HEAD -- scratch_live/ package.json`
> If `scratch_live/live_buscar.js`, `scratch_live/live_presupuesto.js`, or
> `package.json` changed since this plan was written, compare the "Current state"
> excerpts against the live files before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (purely additive — creates new files, edits only `package.json` scripts)
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `a5262a1`, 2026-06-12

## Why this matters

The bot's entire "brain" — fuzzy product matching, measurement parsing
(`2x1`, `3 x 1 1/2`, `12mm = 1/2"`), Spanish singular/plural and color
stemming, synonym expansion, money formatting, quote-line parsing — lives as
regex-heavy JavaScript inside n8n Code nodes, **with zero automated tests**.
`package.json` has no `test` script; the `scripts/test_*.js` files are manual
harnesses that hit live production. A one-character regex slip here can change a
displayed **price** or make the bot answer about the wrong product. There is no
way today to change any of this logic and know you didn't break it.

This plan creates that safety net: it lifts the **pure, side-effect-free**
helper functions (no network, no n8n globals) into a single module
`lib/serrucho-search.js`, and adds a `node --test` suite that pins their current
behavior. It changes **no deployed code** — the n8n nodes keep their inline
copies for now. It is the prerequisite for Plan 004 (de-duplicating those copies)
and makes any future tuning of the matcher verifiable.

## Current state

- `scratch_live/live_buscar.js` — canonical dump of the live `buscar_productos`
  n8n node. Its first ~126 lines are pure helpers; the rest does network I/O.
  The helpers to extract (copy **verbatim** — do not retype) are:

  | Function / const | Lines in `scratch_live/live_buscar.js` |
  |---|---|
  | `nUSD` | 7 |
  | `nBs` | 8 |
  | `nBsInt` | 9 |
  | `tc` | 10 |
  | `norm` | 11 |
  | `normMedida` | 13–19 |
  | `SIZEQ` (const) | 21–26 |
  | `medPresent` | 28–50 |
  | `SIN` (const) | 51–69 |
  | `ACCENTS` (const) | 70–75 |
  | `COLOR_STEM` (const) | 78–91 |
  | `stemColor` | 92 |
  | `singular` | 94–102 |
  | `expandir` | 103 |
  | `esGranel` | 105 |
  | `scoreMatch` | 107–126 |

  For reference, the first two helper lines look exactly like this:
  ```js
  function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
  function nBs(n){ return (Math.round(Number(n)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  ```
  And `norm` (line 11) — note the leading `×`-symbol normalization, which is the
  current/canonical version:
  ```js
  function norm(t){ return String(t).toLowerCase().replace(/[×✕✖]/g,'x').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim(); }
  ```

- `scratch_live/live_presupuesto.js` — canonical dump of the `hacer_presupuesto`
  node. Copy **one** additional pure helper from here:

  | Function | Lines in `scratch_live/live_presupuesto.js` |
  |---|---|
  | `parseItems` | 126–139 |

- **Do NOT copy** `getTasa` (`live_buscar.js:106`, it uses `axios`), the
  `IGNORED`/`MODIFIERS` sets, the `ilike`/`rpc` functions, or anything that
  references `axios`, `query`, or `$(...)`. Those are not pure and are out of scope.

- `package.json` — current scripts block (no test runner):
  ```json
    "scripts": {
      "setup": "node setup.js",
      "start": "powershell -ExecutionPolicy Bypass -File ./start_agent.ps1"
    },
  ```
  This is a CommonJS repo (no `"type": "module"`), so `.js` files use
  `require`/`module.exports`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Node version (must be ≥ 18 for `node --test`) | `node --version` | v18+ (e.g. `v20.x`) |
| Run the test suite | `node --test` | `# pass <N>` / `# fail 0`, exit 0 |
| Lib loads & exports | `node -e "const L=require('./lib/serrucho-search.js'); console.log(typeof L.norm, typeof L.parseItems)"` | `function function` |
| Scope check | `git status --porcelain` | only `lib/…`, `tests/…`, `package.json`, `plans/README.md` |

## Scope

**In scope** (create / modify only these):
- `lib/serrucho-search.js` (create)
- `tests/serrucho-search.test.js` (create)
- `package.json` (add a `test` script — nothing else)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- `scratch_live/*.js`, `scripts/*.js`, `n8n_workflow.json` — the inline copies
  stay as-is in this plan; de-duplicating them is Plan 004. Touching them here
  risks changing deployed behavior.
- The non-pure helpers (`getTasa`, `ilike`, `rpc`) and the orchestration bodies.

## Git workflow

- Branch: `advisor/003-verification-baseline-search-lib`
- Commit message style: Conventional Commits, e.g.
  `test(search): extract pure matcher helpers to lib/ with characterization tests`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create `lib/serrucho-search.js`

Create the file. Copy the 16 helpers listed in the Current-state table
**verbatim** from `scratch_live/live_buscar.js`, then `parseItems` verbatim from
`scratch_live/live_presupuesto.js`. Preserve them exactly (the comments above
`normMedida`, `medPresent`, `singular`, etc. may be copied or omitted — the code
must be byte-for-byte). At the bottom add a single export:

```js
module.exports = {
  nUSD, nBs, nBsInt, tc, norm, normMedida, SIZEQ, medPresent,
  SIN, ACCENTS, COLOR_STEM, stemColor, singular, expandir, esGranel,
  scoreMatch, parseItems,
};
```

Order the declarations so each function's dependencies are defined above it
(the source order in `live_buscar.js` already satisfies this: `norm` before
`normMedida` before `medPresent` before `scoreMatch`; `SIN` before `expandir`).

**Verify**: `node -e "const L=require('./lib/serrucho-search.js'); console.log(typeof L.norm, typeof L.scoreMatch, typeof L.parseItems)"` → prints `function function function`

### Step 2: Create `tests/serrucho-search.test.js`

Create the suite below **exactly** (these expected values were computed by hand
against the current code; if the verbatim copy is correct they will all pass):

```js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../lib/serrucho-search.js');

test('norm: lowercases, strips accents, collapses whitespace', () => {
  assert.strictEqual(L.norm('  Hólá   Múndo '), 'hola mundo');
  assert.strictEqual(L.norm('Tubo/Codo-2'), 'tubo/codo-2');
});

test('normMedida: normalizes composite measures', () => {
  assert.strictEqual(L.normMedida('3 x 1 1/2'), '3x1-1/2');
  assert.strictEqual(L.normMedida('10 mm'), '10mm');
  assert.strictEqual(L.normMedida('2x1'), '2x1');
});

test('medPresent: caliber equivalence + order-independent pairs', () => {
  assert.strictEqual(L.medPresent('1/2', L.normMedida('cabilla estriada 1/2')), true);
  assert.strictEqual(L.medPresent('12mm', L.normMedida('cabilla estriada 1/2')), true);
  assert.strictEqual(L.medPresent('40x100', L.normMedida('tubo 100x40 estructural')), true);
  assert.strictEqual(L.medPresent('5/8', L.normMedida('cabilla 1/2')), false);
});

test('esGranel: detects per-meter / bulk items', () => {
  assert.strictEqual(L.esGranel('CABLE THWN 12 X MT'), true);
  assert.strictEqual(L.esGranel('TORNILLO 1/2'), false);
});

test('singular: reduces Spanish plurals', () => {
  assert.strictEqual(L.singular('tubos'), 'tubo');
  assert.strictEqual(L.singular('cables'), 'cable');
  assert.strictEqual(L.singular('gris'), 'gris');
  assert.strictEqual(L.singular('alambrones'), 'alambron');
});

test('stemColor: neutralizes gender/number', () => {
  assert.strictEqual(L.stemColor('blanca'), 'blanc');
  assert.strictEqual(L.stemColor('blancos'), 'blanc');
});

test('expandir: applies synonyms (varilla -> cabilla)', () => {
  assert.strictEqual(L.expandir('varilla 1/2'), 'cabilla 1/2');
});

test('nUSD: money formatting', () => {
  assert.strictEqual(L.nUSD(2.5), '2.50');
  assert.strictEqual(L.nUSD(3), '3');
  assert.strictEqual(L.nUSD(0), '0');
});

test('tc: title-case, upcases short tokens and numbers', () => {
  assert.strictEqual(L.tc('TUBO pvc 1/2'), 'Tubo PVC 1/2');
});

test('parseItems: parses "name:qty" lists', () => {
  assert.deepStrictEqual(
    L.parseItems('cemento gris:2, cabilla 12mm:4'),
    [{ nombre: 'cemento gris', cantidad: 2 }, { nombre: 'cabilla 12mm', cantidad: 4 }]
  );
});
```

**Verify**: `node --test` → ends with `# fail 0` and exits 0.

If any assertion fails, the verbatim copy in Step 1 is wrong (a regex or a dict
entry got altered). Re-copy that function from the source file — do **not** edit
the test's expected values to make them pass (that would defeat the baseline).
See STOP conditions.

### Step 3: Wire the `test` script into `package.json`

Add a `test` script to the `scripts` block so the suite has a stable entry point:
```json
    "scripts": {
      "setup": "node setup.js",
      "start": "powershell -ExecutionPolicy Bypass -File ./start_agent.ps1",
      "test": "node --test"
    },
```
Change nothing else in `package.json`.

**Verify**: `node -e "process.exit(require('./package.json').scripts.test==='node --test'?0:1)"` → exit 0

## Test plan

- New tests: `tests/serrucho-search.test.js` — 10 `node:test` cases covering each
  exported helper's characteristic behavior (normalization, measure parsing,
  caliber equivalence & order-independence, bulk detection, pluralization, color
  stemming, synonym expansion, money formatting, title-casing, list parsing).
- Pattern to follow for any future test files: same structure
  (`require('node:test')` + `require('node:assert')`, one `test(name, fn)` per
  behavior). There is no prior test file in this repo; this is the exemplar.
- Verification: `node --test` → all pass, `# fail 0`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `node --version` is ≥ v18
- [ ] `lib/serrucho-search.js` exists and exports all 17 names (Step 1 verify passes)
- [ ] `node --test` exits 0 with `# fail 0` and at least 10 tests run
- [ ] `package.json` `scripts.test` === `node --test`
- [ ] `git status --porcelain` shows only `lib/serrucho-search.js`,
      `tests/serrucho-search.test.js`, `package.json`, `plans/README.md`
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `node --version` is below 18 (the built-in test runner / `node --test` is
  unavailable). Report so the operator can choose a Node upgrade or a different
  runner before this plan proceeds.
- A test fails **after** you have re-copied the function verbatim from the source
  (it means the source itself changed since this plan, i.e. drift — do not edit
  the expected values to force a pass).
- The "Current state" line ranges/excerpts don't match the live source files.
- Producing the lib appears to require importing `axios` or referencing `query`
  / `$(...)` — that means you grabbed a non-pure function; re-check the scope list.

## Maintenance notes

- `lib/serrucho-search.js` is now the **canonical definition** of the pure
  matching logic. Plan 004 makes the other copies (`scratch_live/*.js`,
  `scripts/new_*.js`) point at it / be checked against it. Until then, an edit to
  the n8n nodes will NOT be reflected here automatically — that gap is exactly
  what 004 closes.
- When you add or change a matcher rule in the future: change it in
  `lib/serrucho-search.js`, add/adjust a test here, and run `npm test` before
  regenerating the workflow (Plan 005).
- Reviewer should confirm the helpers were copied verbatim (diff them against
  `scratch_live/live_buscar.js`) and that no network/`query` code leaked into the lib.
