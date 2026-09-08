# Tasks: Fix LÁMINA Rule Array-Alias Regression (FN #11/#28)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60-90 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Phase A fix + regression tests | PR 1 | `node rag.js regresion` | `buscarLive('lamina de zinc')` via `load-live-buscar.js` | Revert line 867 both files |
| 2 | Phase C tilde (conditional) | PR 1 (optional commit) | `node rag.js regresion` | tilde probe "lamina arquitectónicas" | Revert Phase C commit |

## Phase 1: Core Fix (Phase A)

- [x] 1.1 Edit `scratch_live/live_buscar.js` line 867: change `let lf = unicos` to `let lf = unicos.filter(() => true)` (R-ALIAS "defensive array copy").
- [x] 1.2 Apply the byte-identical line 867 edit to `scripts/new_buscar.js` (R-MIRROR "mirror applied together").

## Phase 2: Permanent Regression Tests

- [x] 2.1 Add `{"codigo_interno":"LAM-006","descripcion":"LAMINA ZINC 3.66","precio_venta":10.0,"existencia":15}` to `tests/fixtures/catalog.json`. (Applied with LAM-007/008/009 so the azul control honestly asserts ==4.)
- [x] 2.2 Add 7-row table to `tests/lamina_search.test.js`: `"lamina de zinc"` (>0), `"lamina sinz"` (>0), `"lamina de zinc azul"` (==4), `"lamina de zinc rojo"` (>0), `"lamina prepintada"` (>0), `"lamina arquitectonica 6 metros"` (>0, 7 canales), tilde probe (>0) (R-FN, R-TILDES).

## Phase 3: Measurement & Verification

- [x] 3.1 Run `node scripts/check_sources_sync.js` (read-only) (R-MIRROR).
- [x] 3.2 Run `node rag.js regresion` (read-only) (86 cases): **FN 2→0, #28 unflagged, #11 FALSO-NEGATIVO→`🟡 parcial`** (class change: measure/ranking debt, out of scope — see apply-progress "Deviation"), flags 34→33 (1 short of ≤32, same #11 residual). **Core criterion (zero FN) met; letter partially met.**
- [x] 3.3 Probe "lamina de zinc" **live: 4** (≥1 ✓); control "lamina de zinc azul" **live: 4** (==4 ✓, sub-filter intact).
- [x] 3.4 `npm test` green — 119 node tests pass, `check_sources_sync` OK, `check_workflow_sync` red pre-existente (proven at HEAD, non-blocker), dashboard typecheck/test pass; `n8n_workflow.json`/`boot_serrucho.ps1`/`_coloquial_set.json` untouched (R-NO-TOUCH).

## Phase 4: Conditional Phase C (Tilde)

- [x] 4.1 Probe-gate: tilde probe "tienes lamina arquitectónicas…" **live: 4 encontrados > 0** with Phase A alone, all narrowing to `_esCuadrada` (3× Arquitectonica + 1× Canal Cuadrado) → **"Phase C not adopted"** (R-TILDES).
- [x] 4.2 IF entered: add accented handling in `_esCuadrada` (live + mirror); re-run probes with azul/rojo/prepintada unchanged (R-TILDES). *(Skipped — gate 4.1 decided skip; no work owed.)*

## Phase 5: Docs & Conditional Deploy

- [x] 5.1 Update `RAG.md` with change verdict (FN 2→0, #28 cleared, #11 parity, Phase C skipped) (R-FN).
- [x] 5.2 Document deploy condition: rule returned 0 pre-fix (no ranking change), so deploy via `deploy_nodos.js` (read-only, NOT run) only if maintainer requests; default NO (R-NO-TOUCH).
