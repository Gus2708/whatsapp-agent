# Proposal: Search Accuracy Measurement & Baseline

## Intent

Reduce agent search errors. Plan 006 attempt 4 (simLex, `UMBRAL_LEXICO_FIABLE` 0.52) shipped `0c31b52` with no A/B measurement (repo rule: measure on same cached set). RAG.md recall 76.9% (246/320) predates it; 2/86 regression FN from over-extended `no_vendido` rows. Builds meter + gate; RRF next.

## Scope

### In Scope

1. Harness (plan 010 steps 1-2): persist `scratch_live/_coloquial_resultados.json` per case (`codigo, consulta, ok, posicion, top1, rescate, parcial`) + `ultima_venta` buckets (<1y, >1y, sin historial); `--sin-aprender` isolates side-effects (upsert, automejora webhook).
2. A/B baseline on cached `scratch_live/_coloquial_set.json` (320 cases; vector vs `--sin-vector`, same labels) measuring `0c31b52`, + plan 010 step-3 gate: <5 pts → REJECTED; ≥5 → document conditional.
3. Front C: verify the 2 regression queries ("Tiene pipas de agua de 200", "…cielo razo porfavor") vs catalog (cielo raso→drywall; tanques→SIN maps them); purge/scope `busqueda_negativa` rows or fix suite expectation; re-run `regresion` at 0 FN.
4. Align `scripts/_diag_negativa.js` + `rag.js diag` to live negativa rule (`c01ed5d`).
5. Record gate verdict + deferrals.

### Out of Scope

- RRF (plan 006; next change builds on this meter).
- Full SIN audit; 3-large embeddings; plan 010 steps 4-5 (`--sin-ventas`) unless conditional opens; weighted sampling.

## Capabilities

### New Capabilities

- `search-accuracy-benchmark`: cached-set A/B baseline, per-case/bucket metrics, gate reporting.

### Modified Capabilities

None (no existing specs; ranking unchanged).

## Approach

Instrument harness → cached A/B → gate → verify front C, adjust `busqueda_negativa` → re-run `regresion` → align diagnostics → verdict.

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `scripts/_test_coloquial.js` | Modified | results/buckets, `--sin-aprender` |
| `scratch_live/_coloquial_resultados.json` | New | per-case + bucket metrics |
| `scratch_live/_coloquial_set.json` | Used | cached 320-case set (untouched) |
| `busqueda_negativa` rows | Modified | purge/scope regression rows |
| `scripts/_diag_negativa.js`, `rag.js diag` | Modified | sync to live negativa rule |
| `RAG.md`, `plans/010-*.md` | Modified | verdict + measurement record |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| HNSW noise drowns A/B signal | Med | 1-2 case diffs ≠ signal; 5-pt gate |
| `--sin-aprender` fails to isolate | Med | upsert/webhook disabled in baseline |
| Front-C rows are legit items | Low | purge rows, never ranking; re-run 0 FN |
| Gate REJECTED | Med | verdict documented; ranking untouched |

## Rollback Plan

Measurement-only; ranking untouched. Revert: delete `_coloquial_resultados.json` + git-revert harness/diag diffs; purged rows restore from git.

## Dependencies

Cached set; catalog DB access; `0c31b52` deployed.

## Success Criteria

- [ ] `_coloquial_resultados.json` for both runs, same labels
- [ ] Gate verdict documented (REJECTED <5 pts; conditional ≥5)
- [ ] `regresion` re-run: 0 FN
- [ ] Diagnostics aligned; deferred items recorded