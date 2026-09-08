# Design: Fix LÁMINA Rule Array-Alias Regression (FN #11/#28)

## Technical Approach

Phase A replaces `let lf = unicos` (line 867) with `let lf = unicos.filter(() => true)` — a one-line defensive copy. This is the **same idiom** already used by every other business rule in the file (CEMENTO line 708: `const filt = unicos.filter(...)`, CABILLA line 711: `const est = unicos.filter(...)`, PINTURA line 783: `let pf = unicos.filter(...)`). The trailing rewrite block (lines 907-909) then operates on the copy, never self-emptying `unicos`. Phase C (tilde) is probe-gated: `norm()` already strips accents from the query before `wantCuadrada` fires, but `_esCuadrada` tests raw `p.descripcion` — a catalog with accented descriptions would break the sub-filter even though Phase A already gives correct results (full candidate set returned).

## Architecture Decisions

### Decision: Defensive copy via `.filter(() => true)`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `.filter(() => true)` | Consistent with CEMENTO/CABILLA/PINTURA idiom; creates new array; no semantic change | **Chosen** |
| `unicos.slice()` | Same result but breaks file idiom; other rules use `.filter()` | Rejected |
| Remove rewrite block (907-909) | Would work but changes semantics when a sub-filter DID fire — `lf` would no longer propagate back to `unicos` | Rejected |
| `wantZinc` sub-filter | `wantZinc` is computed (line 856) but unused; adding a zinc material filter is a feature, not a bug fix | Out of scope |

**Rationale**: The `.filter(() => true)` idiom is already established in the codebase. The rewrite block (907-909) is the correct propagation mechanism for cases where a sub-filter DID narrow `lf` — we only need to break the alias so it doesn't self-empty when no sub-filter fired.

### Decision: Phase C probe-gated, separate reversible commit

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Fix `_esCuadrada` to strip accents | Handles accented descriptions; but norm() already strips from query side; only needed if catalog has accented data | Probe-gated |
| Skip Phase C entirely | Correct results already via Phase A defensive copy; sub-filter not firing = full candidate set returned | Default if probe shows no accented descriptions in production |
| Fix both `wantCuadrada` and `_esCuadrada` | Belt-and-suspenders; more churn; may not be needed | Rejected (over-engineering) |

**Rationale**: `norm()` (line 10) applies `normalize('NFD').replace(/[\u0300-\u036f]/g,'')` to the query, so "arquitectónicas" → "arquitectonicas" before `wantCuadrada` regex at line 852. The sub-filter DOES fire. The question is whether `_esCuadrada` (line 865) matches the raw `p.descripcion` — if the catalog stores "ARQUITECTÓNICA" (accented), `_esCuadrada` fails, and `fc` stays empty → `lf` unchanged → full candidate set returned (correct via Phase A). Phase C is only needed if we want the sub-filter to actually narrow results, and only matters if accented descriptions exist in production.

## Data Flow

```
User query "lamina de zinc"
  → norm(_pb) strips accents → nbq = "lamina de zinc"
  → isLamina = true (line 848)
  → wantZinc = true (line 856) — but UNUSED by any sub-filter
  → NO sub-filter fires (wantTecholit=false, wantAzul=false, etc.)
  → lf = unicos.filter(() => true)  ← NEW: fresh copy, 29 rows
  → lf unchanged (no sub-filter reassigned it)
  → lines 907-909: unicos.length=0; for(x of lf) unicos.push(x) → 29 rows ← FIXED
  → Previously: lf = unicos (alias) → unicos emptied → lf iterates emptied array → 0 rows
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scratch_live/live_buscar.js` | Modify | Line 867: `let lf = unicos` → `let lf = unicos.filter(() => true)` |
| `scripts/new_buscar.js` | Modify | Line 867: byte-identical mirror of above |
| `tests/lamina_search.test.js` | Modify | Add alias-regression test + tilde control + sub-filter table |
| `tests/fixtures/catalog.json` | Modify | Add "LAMINA ZINC 3.66" (plain zinc, no color/profile) for regression probe |

## Interfaces / Contracts

No new interfaces. The change is internal to the LÁMINA rule block (lines 845-912). The `buscarLive` test harness in `tests/support/load-live-buscar.js` already provides the read-only injection seam — no changes to the harness.

## Testing Strategy

### Permanent test table (in `tests/lamina_search.test.js`)

| Query | Expected | What it tests |
|-------|----------|---------------|
| `"lamina de zinc"` | encontrados > 0 | **Alias regression** — the core FN fix (Phase A) |
| `"lamina de zinc azul"` | encontrados == 4 (existing test) | **Control** — sub-filter still works |
| `"lamina de zinc rojo"` | encontrados > 0 | **Control** — different sub-filter |
| `"lamina prepintada"` | encontrados > 0 (existing) | **Control** — prepintada sub-filter |
| `"lamina arquitectonica 6 metros"` | encontrados > 0, has 7 canales (existing) | **Control** — cuadrada sub-filter |
| `"tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho q presio la tienes"` | encontrados > 0 | **Tilde query** — Phase C probe; norm() strips accent before wantCuadrada |
| `"lamina sinz"` | encontrados > 0 | **Alias variant** — "sinz" → wantZinc fires, no sub-filter → same bug |

### Driver

Use existing `tests/support/load-live-buscar.js` → `buscarLive(p_busqueda)`. The fixture `tests/fixtures/catalog.json` needs one new entry: a plain zinc lamina without color/profile (e.g. `{"codigo_interno":"LAM-006","descripcion":"LAMINA ZINC 3.66","precio_venta":10.0,"existencia":15}`). This ensures the "lamina de zinc" query has rows to return.

### `check_sources_sync` validation

After editing both files identically: `node scripts/check_sources_sync.js` asserts `read('scripts/new_buscar.js') === read('scratch_live/live_buscar.js')` (line 13-15). This is already part of `npm test`. No additional guard needed.

### `node rag.js regresion` measurement

Run against the 86-case harness (~2 min). Verify:
- #11 ("Que precio este tipo de sinz de 6 metros"): no longer flagged
- #28 ("lamina de zinc"): no longer flagged
- `falsos_negativos`: 2 → 0
- Total flags: 34 → ≤32 (at minimum; may reduce further if tilde cases also stop flagging)

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.

## Migration / Rollout

No migration required. The fix is a single-line source change in two byte-identical files. Ranking is NOT affected — the LÁMINA rule currently returns 0 results for the affected queries, so the fix only adds rows where there were none. `node rag.js regresion` is a read-only harness that writes to `regresion_resultado.json` (local artifact, not deployed).

**Deploy condition**: Deploy ONLY if `npm test` + `node rag.js regresion` + probes all pass. Since this is a matcher file (`scratch_live/live_buscar.js`), deployment means the n8n workflow picks it up on next boot via `boot_serrucho.ps1` (out of scope — no changes to boot mechanism).

## Open Questions

- [x] Does the production Supabase catalog contain "ARQUITECTÓNICA" (with accent) in `descripcion`? **Answered by live probe 2026-09-08**: "tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho…" → 4 encontrados, todos estrechan a `_esCuadrada` (3× Arquitectonica + 1× Canal Cuadrado) con Fase A sola. `norm()` quita los acentos del query antes de `wantCuadrada`; `_esCuadrada` se evalúa sobre la descripción y los resultados son correctos → **Phase C skipped** (tasks 4.1 gate), no needed.
- [x] Should the Phase C fix normalize `p.descripcion` inside `_esCuadrada`, or add a combined regex `(?:ARQUITECTONICA|ARQUITECTÓNICA)`? **Moot** (Phase C not adopted). Not implemented; revisit only if a live probe shows a sub-filter failing to narrow on accented descriptions.
