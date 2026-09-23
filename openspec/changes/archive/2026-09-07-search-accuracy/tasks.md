# Tasks: Search Accuracy Measurement & Baseline

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 430–580 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | single PR with size:exception (delivery_strategy=single-pr) |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> Delivery strategy is `single-pr`; forecast exceeds the 400-line budget. Orchestrator must require `size:exception` before apply (guard E).

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Harness instrumentation (D1–D4, D8) + hermetic tests | PR 1 | `node --test tests/coloquial_harness.test.js` | `node scripts/_test_coloquial.js --limit 3 --sin-aprender --etiqueta smoke` | Revert `scripts/_test_coloquial.js` + `.gitignore`; delete results file |
| 2 | Diagnostics (D5), Front-C data op (D6), docs (D7) | PR 2 | unit `npm --prefix dashboard run test`; `node rag.js regresion` | `node scripts/_diag_negativa.js --qs "Tiene pipas de agua de 200"` | Revert `_diag_negativa.js`, `rag.js`, `_test_busqueda_50.js`; git-revert purged rows |

## Phase 1: Foundation (harness + hermetic tests, RED first)

- [x] 1.1 RED: write `tests/coloquial_harness.test.js` (node:test + `tests/support/fake-axios.js` (read-only)) asserting flag parsing (unknown flag → exit 1), `--ab` missing-file error, D1 skip of `catalogo_vocabulario`/`automejora-busqueda` POSTs, D2 atomic write/N-record/7-field, D3 `bucketDeUltimaVenta` (null→sin historial, 365d boundary, denominators sum), D4 gate (4.9→REJECTED, 5.0→conditional); fail before impl.
- [x] 1.2 In `scripts/_test_coloquial.js`: add `--sin-aprender` axiosShim interception (short-circuit POSTs to `catalogo_vocabulario`/`automejora-busqueda` → `{data:[]}`; RPC POSTs + GETs pass).
- [x] 1.3 In `scripts/_test_coloquial.js`: D2 atomic persistence to `scratch_live/_coloquial_resultados_<etiqueta>.json` only on full-set completion (`--limit` never writes official; `.tmp` + `fs.renameSync`).
- [x] 1.4 In `scripts/_test_coloquial.js`: D3 bucket join `producto_popularidad?select=codigo_interno,ultima_venta&limit=10000`; fetch failure → warn + all `sin historial` (never crash); print `resumen.buckets` (denominators sum to 320).
- [x] 1.5 In `scripts/_test_coloquial.js`: D4 `--ab <a> <b>` reads `scratch_live/_coloquial_resultados_<a>.json` + `<b>` (read-only), gap = vector − sin-vector exacto_pct; <5 → REJECTED, ≥5 → conditional.
- [x] 1.6 Add `scratch_live/_coloquial_resultados*.json` to `.gitignore` (D8).
- [x] 1.7 GREEN: run `node --test tests/coloquial_harness.test.js` → all pass.

## Phase 2: Diagnostics alignment (R6 / D5)

- [x] 2.1 RED-extend harness: `_diag_negativa.js` `--qs "<consulta>"` runs live body + D1 isolation and flags same negation cases as `rag.js` body.
- [x] 2.2 Rewrite `scripts/_diag_negativa.js` to run whole live body (same loader as `_diag_negaciones.js` (read-only)) with D1 isolation; add `--qs` mode; drop hardcoded rows + inverted `negActual` docstring.
- [x] 2.3 In `rag.js`: `diag` prints `no_vendido` line when matcher returns `NO_VENDIDO_JSON`; `medir` already passes flags through.
- [x] 2.4 Verify `node scripts/_diag_negativa.js` and `node rag.js diag` both match live `c01ed5d` rule (⊆ query, `_nt.length<=8`, no MODIFIERS, 90-day TTL).

## Phase 3: Front-C data op (R5 / D6)

- [x] 3.1 Hand-verify `"Tiene pipas de agua de 200"` + `"…cielo razo porfavor"` vs catalog via `node rag.js diag` + REST anon reads.
- [x] 3.2 If items exist: SQL `DELETE FROM busqueda_negativa WHERE termino_raw = '<query>'` in Supabase console (anon can't DELETE); else set expectation to `exists: false`. Items do NOT exist in catalog → no purge required.
- [x] 3.3 In `scripts/_test_busqueda_50.js`: upgrade the 2 rows `exists: null` → asserted true/false (`false` para ambas; verificadas por catálogo).
- [x] 3.4 Re-run `node rag.js regresion` → **0 FN** por negaciones (rows 1/4 → `no_vendido`); ranking orden verificado en las ~80 filas (sin cambios de orden vs baseline; ranking no tocado). Quedan 2 sospechosos PRE-EXISTENTES no relacionados: #11 "sinz" (typo→zinc) y #28 "lamina de zinc" (gap matcher) — fuera de alcance, documentados.

## Phase 4: Measurement (R4 / R1 / R2)

- [x] 4.1 Run A: `node scripts/_test_coloquial.js --sin-aprender --etiqueta vec` (full, official file) → **231/320 exacto (72,2%)**, 58 categoría, 31 fallo total.
- [x] 4.2 Run B: same + `--sin-vector --etiqueta sinvec` (full, official file) → **231/320 exacto (72,2%)**, idéntico a Run A.
- [x] 4.3 Gate: `node scripts/_test_coloquial.js --ab vec sinvec` → **REJECTED (gap 0 pts < 5)**; condicional NO se abre; `0c31b52` baseline quedó medido. **Bug D3 encontrado en el camino**: `producto_popularidad` corta en 1000 filas/request (paginado con offset, 4817 filas reales); joim corregido — buckets recalculados: <1a 72,5% (124/171), >1a 53,8% (14/26), sin historial 75,6% (93/123), suma 320 (coincide con plan 010: 123 sin historial).

## Phase 5: Documentation (R7 / D7)

- [x] 5.1 Record gate verdict + gap in `RAG.md` (§3 stats table) → REJECTED + regresión 76,9→72,2 documentada.
- [x] 5.2 Record verdict + deferrals in `plans/010-recall-por-antiguedad-de-venta.md` (Status) → REJECTED, desglose por bucket permanente; diferimientos: RRF+revisión de `0c31b52`→plan 006; full SIN audit, 3-large embeddings, weighted sampling, plan 010 steps 4-5 → sus planes.

## NOT touched

`scratch_live/live_buscar.js`, `scripts/new_buscar.js`, `n8n_workflow.json` (unrelated local mod — never regenerate/commit), `scratch_live/_coloquial_set.json` (versioned, read-only).
