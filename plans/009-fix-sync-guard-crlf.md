# Plan 009: Fix CRLF bug in `check_sources_sync.js` guard

> **Executor instructions**: Follow step by step. Report with the standard format when done.
> Skip the README update — reviewer maintains the index.
>
> **Drift check**: `git diff --stat a3f5b0d..HEAD -- scripts/check_sources_sync.js`
> If the file changed, stop and report.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `a3f5b0d`, 2026-06-17

## Why this matters

`scripts/check_sources_sync.js` verifies that each helper function in
`lib/serrucho-search.js` appears verbatim in `scratch_live/live_buscar.js`.
On this Windows checkout, `lib/serrucho-search.js` is stored with CRLF line
endings. `Function.prototype.toString()` returns the source text exactly as
it is on disk — including CRLF. The guard's `read()` helper normalizes file
reads to LF (`replace(/\r\n/g, '\n')`), but the `.toString()` result is NOT
normalized before the `includes()` check, so the comparison always fails on
Windows even when the functions are byte-for-byte identical modulo line endings.

Confirmed with:
```
node -e "
const L = require('./lib/serrucho-search.js');
const fs = require('fs');
const read = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const buscar = read('scratch_live/live_buscar.js');
const src = L.normMedida.toString();
console.log('without normalize:', buscar.includes(src));      // false
console.log('with normalize:', buscar.includes(src.replace(/\r\n/g, '\n')));  // true
"
```

## Current state

File: `scripts/check_sources_sync.js`

Lines 27–31 (the broken check):
```js
for (const name of sharedFns) {
  assert.ok(
    buscar.includes(L[name].toString()),
    `lib.${name} source not found verbatim in scratch_live/live_buscar.js (lib drifted)`
  );
}
```

Lines 33–36 (same issue for parseItems):
```js
assert.ok(
  presupuesto.includes(L.parseItems.toString()),
  'lib.parseItems source not found verbatim in scratch_live/live_presupuesto.js'
);
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Tests   | `node --test` | 10/10 pass, exit 0 |
| Guard   | `node scripts/check_sources_sync.js` | `sources in sync: OK` |

## Scope

**In scope**: `scripts/check_sources_sync.js`

**Out of scope**: `lib/serrucho-search.js`, `scratch_live/`, `tests/`, everything else.

## Git workflow

- Branch: `advisor/009-fix-sync-guard-crlf`
- Commit: `fix(guard): normalize Function.toString() CRLF->LF before includes() check`

## Steps

### Step 1: Create branch

```
git checkout -b advisor/009-fix-sync-guard-crlf
```

### Step 2: Add CRLF normalization to the two `.toString()` calls

In `scripts/check_sources_sync.js`, change line 29 from:
```js
    buscar.includes(L[name].toString()),
```
to:
```js
    buscar.includes(L[name].toString().replace(/\r\n/g, '\n')),
```

And change line 34 from:
```js
  presupuesto.includes(L.parseItems.toString()),
```
to:
```js
  presupuesto.includes(L.parseItems.toString().replace(/\r\n/g, '\n')),
```

**Verify**: `node scripts/check_sources_sync.js` → `sources in sync: OK`

### Step 3: Run test suite

**Verify**: `node --test` → `pass 10`, exit 0

### Step 4: Commit

```
git add scripts/check_sources_sync.js
git commit -m "fix(guard): normalize Function.toString() CRLF->LF before includes() check"
```

**Verify**: `git show --stat HEAD` → only `scripts/check_sources_sync.js` changed (1 file, 2 lines changed).

## Done criteria

- [ ] `node scripts/check_sources_sync.js` exits 0, prints `sources in sync: OK`
- [ ] `node --test` exits 0, 10 tests pass
- [ ] `git diff --stat HEAD~1 HEAD` → only `scripts/check_sources_sync.js`, 2 insertions, 2 deletions

## STOP conditions

- File at `scripts/check_sources_sync.js` doesn't contain `buscar.includes(L[name].toString())` (already fixed or drifted).
- `node scripts/check_sources_sync.js` still fails after the change.
