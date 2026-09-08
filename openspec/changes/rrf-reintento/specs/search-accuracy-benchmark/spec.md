# Delta for search-accuracy-benchmark

## MODIFIED Requirements

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