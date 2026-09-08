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
| R8 | LÁMINA rule defensive array copy | SHALL |
| R9 | Byte-identical mirror and source sync | SHALL |
| R10 | Accented sub-filter variants (Phase C, conditional) | SHALL |
| R11 | No-touch guard | SHALL |

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

The harness SHALL measure the deployed hybrid-vector-adoption rule (rrf-reintento R-A3) on the cached set: vector vs `--sin-vector`, same labels, default sales rule. Gate mechanics unchanged: gap < 5 pts → REJECTED; ≥ 5 pts → conditional opens only plan 010 steps 4-5. No ranking change outside the adoption rule.
(Previously: measured attempt 4 (`0c31b52`); all other mechanics identical.)

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

#### Scenario: Subject is the deployed hybrid rule

- GIVEN rrf-reintento is applied and matcher sources are byte-identical
- WHEN both A/B runs execute
- THEN both exercise the hybrid adoption rule in `scratch_live/live_buscar.js`

### Requirement: Regression front-C verification

The two regression queries (`"Tiene pipas de agua de 200"`, `"…cielo razo porfavor"`) SHALL be hand-verified against the catalog. If present, the stale `busqueda_negativa` rows (no_vendido, ~2026-11-11) SHALL be purged or scoped; else the suite expectation is corrected. `node rag.js regresion` SHALL report **zero false negatives**, including the LÁMINA alias regression: cases #11 and #28 SHALL stop flagging, dropping FN from 2 to 0.
(Previously: zero-FN gate covered only the front-C purges; the LÁMINA alias FNs were not represented.)

#### Scenario: Catalog contains items → purge rows

- GIVEN hand-verification confirms items are in the catalog
- WHEN stale `busqueda_negativa` rows block them
- THEN those rows are purged/scoped and `regresion` reports 0 FN

#### Scenario: Purge does not alter ranking

- GIVEN rows are purged from `busqueda_negativa`
- WHEN `regresion` re-runs
- THEN only negative matches are affected, not ranking order

#### Scenario: LÁMINA alias FNs cleared

- GIVEN the LÁMINA rule runs against an 86-case set
- WHEN `node rag.js regresion` executes after the alias fix
- THEN #11 and #28 are no longer flagged and `falsos_negativos` is 0

#### Scenario: Zinc probe and azul control

- GIVEN the alias fix is applied
- WHEN probing "lamina de zinc" and the control "lamina de zinc azul"
- THEN "lamina de zinc" returns at least one row (0 today)
- AND "lamina de zinc azul" still returns exactly 4 rows

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

### Requirement: LÁMINA rule defensive array copy

The LÁMINA rule SHALL operate on a fresh copy of the candidate array (`unicos.filter(() => true)` or equivalent new-array idiom) instead of aliasing `unicos`, so its trailing rewrite block never self-empties the candidate list. The azul/rojo/prepintada/cuadrada sub-filter semantics SHALL NOT change.

#### Scenario: No sub-filter fires keeps rows

- GIVEN a LÁMINA query with no color/profile sub-filter (e.g. "lamina de zinc", "sinz")
- WHEN the trailing rewrite block executes
- THEN the candidate rows are preserved and results are non-empty

#### Scenario: Sub-filters unchanged

- GIVEN "lamina de zinc azul" and other sub-filter queries
- WHEN the defensive copy is in place
- THEN filtering still returns the same rows as before the change

### Requirement: Byte-identical mirror and source sync

`scratch_live/live_buscar.js` and `scripts/new_buscar.js` SHALL remain byte-identical after the change, and `check_sources_sync` SHALL pass inside `npm test`.

#### Scenario: Mirror applied together

- GIVEN the alias fix touches `live_buscar.js`
- WHEN the mirror is applied
- THEN both files are byte-identical

#### Scenario: Sync check green

- GIVEN both files are byte-identical
- WHEN `npm test` runs `check_sources_sync`
- THEN it passes

### Requirement: Accented sub-filter variants (Phase C, conditional)

IF Phase C is adopted, the LÁMINA sub-filter regexes SHALL match accented variants (`arquitect\w*` covering "arquitectónicas"). The accented regression queries (file lines 25/34/38 of `_test_busqueda_50.js`, harness cases #3/#12/#16) SHALL stop flagging, while azul/rojo/prepintada probes keep their counts.

#### Scenario: Accented queries stop flagging

- GIVEN "tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho" and "Buenas tardes tiene disponible laminas arquitectónicas de 6 metros calibre 30"
- WHEN Phase C regexes are applied
- THEN neither case flags partial/FN and azul/rojo/prepintada probes are unchanged

#### Scenario: Phase C skipped is non-breaking

- GIVEN Phase C is not adopted
- THEN Phase A behavior is unchanged and controls keep their counts

### Requirement: No-touch guard

The change SHALL NOT modify `n8n_workflow.json`, `boot_serrucho.ps1`, or `scratch_live/_coloquial_set.json`, SHALL NOT introduce a 320-case harness, and a pre-existing red `check_workflow_sync` SHALL NOT block the change.

#### Scenario: Deploy artifacts untouched

- GIVEN the change is applied
- WHEN `git status` is inspected
- THEN the three listed files show no new modification

#### Scenario: Pre-existing red is non-blocker

- GIVEN `check_workflow_sync` was already red before the change
- WHEN `npm test` completes
- THEN the change is not blocked by that pre-existing failure
