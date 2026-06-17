# Plan 008: Parallelize `hacer_presupuesto` item lookups

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a3f5b0d..HEAD -- scratch_live/live_presupuesto.js`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live file before proceeding; on a mismatch treat it as
> a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (plan 004 already landed the `build_workflow.js` sync tool)
- **Category**: perf
- **Planned at**: commit `a3f5b0d`, 2026-06-17

## Why this matters

When a customer sends a multi-product list (e.g. "2 sacos cemento, 4 tubos,
10 cabillas, 3 discos, 1 llave bola"), `hacer_presupuesto` calls `buscarUno()`
for each line item **one at a time** inside a sequential `for` loop. Each call
makes 2–3 HTTP round-trips to Supabase (ilike product search + popularity RPC).
At 300–500 ms per round-trip, a 10-item list takes 6–10 seconds of blocking
wait before the customer sees any response.

Replacing the sequential loop with `Promise.all` fires all the `buscarUno`
calls concurrently. Total latency drops from O(N×T) to O(T) regardless of
list length — a 10-item list finishes in roughly the same time as a 1-item
lookup. The output ordering is preserved because we collect results into an
array first, then build the budget text in item order.

## Current state

File: `scratch_live/live_presupuesto.js` — canonical source for the
`hacer_presupuesto` n8n tool. After editing this file, run
`node scripts/build_workflow.js` to sync the change into `n8n_workflow.json`
(the build script reads `scratch_live/live_presupuesto.js` and patches the
`hacer_presupuesto` code node).

The sequential loop (lines 240–261):

```js
let bloque='', totUSD=0, n=0;
const noEnc=[];
const altLines=[];
let hasAgotado = false;
for (const it of items){
  const r=await buscarUno(it.nombre);
  if(!r || !r.best){ noEnc.push(it.nombre); continue; }
  const prod=r.best;
  n++;
  const usd=Number(prod.precio_venta);
  const sub=usd*it.cantidad;
  totUSD+=sub;
  const isAgotado = !esGranel(prod.descripcion) && Number(prod.existencia) <= 0;
  if (isAgotado) hasAgotado = true;
  bloque += n+'. *'+tc(prod.descripcion)+'*' + (isAgotado ? ' _(Agotado)_' : '') + '\n';
  bloque += '   '+it.cantidad+' x '+nUSD(usd)+'$ = *'+nUSD(sub)+'$*\n\n';
  // otras opciones disponibles para este renglón
  for (const a of (r.alts||[])){
    const ausd=Number(a.precio_venta);
    altLines.push('• En vez de *'+tc(prod.descripcion)+'* también está *'+tc(a.descripcion)+'* a '+nUSD(ausd)+'$ c/u');
  }
}
if (n===0) return JSON.stringify({ ok:false, instruccion:'NO encontre estos productos. Tu UNICA respuesta valida ahora es el token [PEDIR_AYUDA] (escribelo solo, exactamente asi). PROHIBIDO sugerir alternativas o decir que no los tenemos: un empleado los elegira.', mensaje:'No encontré esos productos: '+noEnc.join(', ') });
```

The `buscarUno` function is at the top of the file (lines ~146–237). It is a
pure async function: takes a product name string, returns `{best, alts}` or
`null`. It does not mutate any outer state — each call is completely
independent.

The `tasa` variable (used to format Bs prices later in the output) is already
fetched in a single call at line 143 (`const tasa = await getTasa()`) before
the loop. It does NOT need to go into the parallel block.

Repository sync pattern (established in plan 004): the canonical source is
`scratch_live/live_presupuesto.js`; `scripts/build_workflow.js` patches it
into `n8n_workflow.json`. Always run `build_workflow.js` after editing
`scratch_live/live_presupuesto.js`.

## Commands you will need

| Purpose              | Command                                    | Expected on success           |
|----------------------|--------------------------------------------|-------------------------------|
| Tests                | `node --test`                              | 10/10 pass, exit 0            |
| Sources sync         | `node scripts/check_sources_sync.js`       | `sources in sync: OK`         |
| Regenerate workflow  | `node scripts/build_workflow.js`           | `regenerated workflow: 3 nodes updated` |
| Workflow sync check  | `node scripts/check_workflow_sync.js`      | `workflow in sync with scratch_live: OK` |

## Scope

**In scope** (the only files you should modify):
- `scratch_live/live_presupuesto.js`
- `n8n_workflow.json` (via `node scripts/build_workflow.js` — do NOT hand-edit)

**Out of scope** (do NOT touch):
- `scratch_live/live_buscar.js` — the search tool; no change needed there.
- `lib/serrucho-search.js` — the shared helpers lib; untouched.
- `docker-compose.yml`, `supabase_schema.sql`, any test files.
- `tests/serrucho-search.test.js` — the test suite tests `lib/`, not the full
  tool; no new test is added here (see Test plan below for why).

## Git workflow

- Branch: `advisor/008-parallelize-presupuesto`
- Commit after the source edit: `perf(presupuesto): run buscarUno calls in parallel with Promise.all`
- Commit after regenerating the workflow: `chore: regenerate n8n_workflow.json (plan 008 sync)`
  (or combine into one commit — either is fine)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create branch

```
git checkout -b advisor/008-parallelize-presupuesto
```

### Step 2: Replace the sequential loop with `Promise.all`

Open `scratch_live/live_presupuesto.js` and find the sequential loop at
lines 240–261 (the block starting with `let bloque='', totUSD=0, n=0;` and
ending just before `if (n===0) return ...`). Replace it with:

```js
let bloque='', totUSD=0, n=0;
const noEnc=[];
const altLines=[];
let hasAgotado = false;

// Fetch all items in parallel instead of sequentially.
const resultados = await Promise.all(items.map(it => buscarUno(it.nombre)));

for (const [idx, it] of items.entries()) {
  const r = resultados[idx];
  if(!r || !r.best){ noEnc.push(it.nombre); continue; }
  const prod=r.best;
  n++;
  const usd=Number(prod.precio_venta);
  const sub=usd*it.cantidad;
  totUSD+=sub;
  const isAgotado = !esGranel(prod.descripcion) && Number(prod.existencia) <= 0;
  if (isAgotado) hasAgotado = true;
  bloque += n+'. *'+tc(prod.descripcion)+'*' + (isAgotado ? ' _(Agotado)_' : '') + '\n';
  bloque += '   '+it.cantidad+' x '+nUSD(usd)+'$ = *'+nUSD(sub)+'$*\n\n';
  // otras opciones disponibles para este renglón
  for (const a of (r.alts||[])){
    const ausd=Number(a.precio_venta);
    altLines.push('• En vez de *'+tc(prod.descripcion)+'* también está *'+tc(a.descripcion)+'* a '+nUSD(ausd)+'$ c/u');
  }
}
```

Key differences from the original:
- `await Promise.all(items.map(...))` gathers all `buscarUno` results in parallel.
- The outer loop becomes `for (const [idx, it] of items.entries())` with
  `const r = resultados[idx]` so item ordering is preserved.
- Everything inside the loop (bloque building, noEnc, altLines) is unchanged.
- The `if (n===0) return ...` line immediately after the loop is unchanged.

**Verify**: `grep -n "Promise.all" scratch_live/live_presupuesto.js` → prints
one match on the new line.

**Verify**: `grep -n "for (const it of items)" scratch_live/live_presupuesto.js`
→ 0 matches (the old sequential loop is gone).

### Step 3: Run the test suite

**Verify**: `node --test` → `pass 10`, exit 0

### Step 4: Check source sync

**Verify**: `node scripts/check_sources_sync.js` → `sources in sync: OK`

(This guard confirms `lib/serrucho-search.js` and `scratch_live/live_buscar.js`
are in sync — it does NOT check `live_presupuesto.js`, so this is a quick
sanity check that you haven't accidentally touched the wrong file.)

### Step 5: Regenerate `n8n_workflow.json`

```
node scripts/build_workflow.js
```

**Verify**: output is `regenerated workflow: 3 nodes updated`

**Verify**: `node scripts/check_workflow_sync.js` → `workflow in sync with scratch_live: OK`

### Step 6: Commit

```
git add scratch_live/live_presupuesto.js n8n_workflow.json
git commit -m "perf(presupuesto): run buscarUno calls in parallel with Promise.all"
```

**Verify**: `git show --stat HEAD` shows exactly 2 files changed:
`scratch_live/live_presupuesto.js` and `n8n_workflow.json`.

## Test plan

The `tests/serrucho-search.test.js` suite tests the pure helpers in
`lib/serrucho-search.js` (norm, medPresent, esGranel, etc.). These are
unchanged by this plan, so no new tests are needed there.

The changed code path (`buscarUno` + the Promise.all aggregator) calls
Supabase via HTTP and is intentionally excluded from the offline unit test
suite (it can't run without real credentials). The correctness guarantee is:

1. `node --test` continues to pass (no regression in shared helpers).
2. `node scripts/check_workflow_sync.js` confirms the n8n_workflow.json
   reflects the edit.
3. The logic inside the loop body is byte-for-byte identical to the original
   (only the outer structure changed from sequential `for-of` to indexed
   `entries()` + `Promise.all`).

If a harness test is available (`scripts/_sim_presupuesto.js`), run it as a
manual smoke check: `node scripts/_sim_presupuesto.js`. It will exercise the
real Supabase calls. This is optional for the plan's DONE criteria but
strongly recommended before the operator merges.

## Done criteria

ALL must hold:

- [ ] `grep -n "Promise.all" scratch_live/live_presupuesto.js` → 1 match
- [ ] `grep -n "for (const it of items)" scratch_live/live_presupuesto.js` → 0 matches
- [ ] `grep -n "for (const \[idx, it\] of items.entries())" scratch_live/live_presupuesto.js` → 1 match
- [ ] `node --test` exits 0, 10 tests pass
- [ ] `node scripts/check_sources_sync.js` → `sources in sync: OK`
- [ ] `node scripts/check_workflow_sync.js` → `workflow in sync with scratch_live: OK`
- [ ] `git diff --stat HEAD~1 HEAD` shows exactly `scratch_live/live_presupuesto.js` and `n8n_workflow.json`
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- The block at lines 240–261 of `scratch_live/live_presupuesto.js` does not
  match the "Current state" excerpt (drift since this plan was written).
- `node scripts/build_workflow.js` fails with "expected to update 3 nodes,
  updated N" — the node names in `n8n_workflow.json` may have changed; stop
  and report.
- `node --test` fails (regression in shared helpers).
- `node scripts/check_workflow_sync.js` reports out-of-sync after running
  `build_workflow.js` — the guard may be comparing something differently than
  expected; stop and investigate.

## Maintenance notes

- `Promise.all` rejects eagerly if any inner promise rejects. The `buscarUno`
  function currently catches all its own errors and returns `null` on failure,
  so a Supabase timeout on one item does not fail the whole request — this
  behavior is preserved unchanged.
- If `buscarUno` is ever changed to throw instead of returning null on
  network error, re-evaluate whether `Promise.allSettled` is more appropriate.
- The `tasa` fetch (`const tasa = await getTasa()`) already runs before the
  loop and is not affected by this change.
- Applying this change to the live n8n instance requires the operator to
  import the updated `n8n_workflow.json` (or use the n8n API / `create_reenviar`
  style patch script). This plan only produces the file; deployment is manual.
