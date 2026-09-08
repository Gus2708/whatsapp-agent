# search-accuracy-benchmark Specification

## Purpose

Cached-set A/B baseline measuring search recall per case and per sales-recency bucket so ranking decisions use stored evidence. Also verifies Front-C and aligns diagnostics. Measures only — MUST NOT alter ranking.

## Requirements

| # | Requirement | Strength |
|---|------------|----------|
| R1 | Per-case results persistence | SHALL |
| R2 | Sales-recency bucket breakdown | SHALL |
| R3 | Side-effect isolation flag | SHALL |
| R4 | Cached A/B baseline and gate | SHALL |
| R5 | Regression front-C verification | SHALL |
| R6 | Diagnostics aligned to live rule | SHALL |
| R7 | Gate verdict and deferrals recorded | SHALL |

### Requirement: Per-case results persistence

The harness SHALL persist `{ codigo, consulta, ok, posicion, top1, rescate, parcial }` per cached case to `scratch_live/_coloquial_resultados.json`, atomically on full-set completion.

#### Scenario: Full-set run writes all cases

- GIVEN `_coloquial_set.json` holds the cached 320 cases
- WHEN the harness runs the full set
- THEN `_coloquial_resultados.json` contains exactly 320 records with all fields

#### Scenario: Partial run is not official

- GIVEN a run with `--limit N` (N < 320)
- WHEN it finishes
- THEN the persisted results are not treated as the official measurement

### Requirement: Sales-recency bucket breakdown

The harness SHALL join results against `producto_popularidad.ultima_venta` and report recall for global, `<1 año`, `>1 año`, and `sin historial`.

#### Scenario: Buckets printed and consistent

- GIVEN a full run completed
- WHEN the report is produced
- THEN recall is printed for all four buckets and denominators sum to total

#### Scenario: Null ultima_venta → sin historial

- GIVEN a case with null `ultima_venta`
- WHEN the breakdown is produced
- THEN it is counted under `sin historial`, never dropped

### Requirement: Side-effect isolation flag

`--sin-aprender` SHALL disable upserts to `catalogo_vocabulario` and the self-improvement webhook, leaving search results otherwise unchanged.

#### Scenario: Baseline run with side-effects off

- GIVEN `--sin-aprender` is passed
- WHEN the run executes
- THEN no upsert and no webhook is fired

### Requirement: Cached A/B baseline and gate

The harness SHALL measure attempt 4 (`0c31b52`) on the cached set: vector vs `--sin-vector`, same labels, default sales rule. Gate: gap < 5 pts → REJECTED; ≥ 5 pts → conditional opens only plan 010 steps 4-5. No ranking change.

#### Scenario: Gap below threshold → REJECTED

- GIVEN live-vs-cold gap is < 5 points
- WHEN the gate is evaluated
- THEN the verdict is REJECTED; the breakdown is kept as a permanent metric

#### Scenario: Gap at or above threshold → conditional

- GIVEN live-vs-cold gap is ≥ 5 points
- WHEN the gate is evaluated
- THEN the verdict documents the conditional; steps 4-5 proceed with `--sin-ventas`

#### Scenario: Same cached queries

- GIVEN both runs (vector, `--sin-vector`) complete
- THEN both read identical `_coloquial_set.json`

### Requirement: Regression front-C verification

The two regression queries (`"Tiene pipas de agua de 200"`, `"…cielo razo porfavor"`) SHALL be hand-verified against the catalog. If present, the stale `busqueda_negativa` rows (no_vendido, ~2026-11-11) SHALL be purged or scoped; else the suite expectation is corrected. `node rag.js regresion` SHALL report **zero false negatives**.

#### Scenario: Catalog contains items → purge rows

- GIVEN hand-verification confirms items are in the catalog
- WHEN stale `busqueda_negativa` rows block them
- THEN those rows are purged/scoped and `regresion` reports 0 FN

#### Scenario: Purge does not alter ranking

- GIVEN rows are purged from `busqueda_negativa`
- WHEN `regresion` re-runs
- THEN only negative matches are affected, not ranking order

### Requirement: Diagnostics aligned to live rule

`scripts/_diag_negativa.js` and `rag.js diag` SHALL match the live negation rule ⊆ query deployed in `c01ed5d`.

#### Scenario: Diagnostics match live behavior

- GIVEN a query processed by `rag.js`
- WHEN `_diag_negativa.js` runs the same query
- THEN the diagnostic flags the same negation cases

### Requirement: Gate verdict and deferrals recorded

The runner SHALL document the gate verdict plus deferred items (RRF, full SIN audit, 3-large embeddings, weighted sampling, out-of-scope plan 010 steps) in `RAG.md` and `plans/010-*.md`.

#### Scenario: Verdict and deferrals are durable

- GIVEN the A/B gate is evaluated
- WHEN the verdict is known
- THEN it is recorded with the measured gap and each deferral listed with its owning plan
