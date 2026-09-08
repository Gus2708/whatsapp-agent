# hybrid-vector-adoption Specification

## Purpose

Restore the vector contribution in search rescue that attempt 4 (`0c31b52`) left dormant: measured gap 0 (231/320, vector identical to sinvector). A hybrid adoption rule recovers the +7 of the old category rule without breaking `disco de corte` or `tapa para el baño`; matcher sources stay byte-identical; the 244→231 drop suspects are isolated on disk; measurement is a reproducible cached-set gate. Real RRF is out of scope.

## Requirements

### Requirement: Hybrid adoption rule (R-A3)

In vector rescue, when lexical rows exist and the `_falta` trigger fires (top-1 lexical misses a query word), the system SHALL adopt the vector when `_lexFalla` OR (`categoriaDiff` AND top vector `similitud >= 0.55`). `_falta` SHALL remain the only entry gate so the happy path never calls OpenAI. The `simLex < 0.52` branch SHALL remain the safety net because 0.55 sits inside the measured 0.399–0.606 band; `simLex === null` SHALL fall back to `categoriaDiff`; an empty vector result SHALL NOT be adopted.

#### Scenario: Lexical failure adopts

- GIVEN top-1 lexical misses a query word and `simLex < 0.52`
- WHEN the rescue evaluates adoption
- THEN the vector becomes the result and `_rescate` is set

#### Scenario: Category-difference recovery

- GIVEN `simLex >= 0.52` but the vector top is a different category with `similitud >= 0.55`
- WHEN the rescue evaluates adoption
- THEN the vector is adopted (recovers the measured +7)

#### Scenario: simLex unavailable

- GIVEN `simLex === null`
- WHEN the rescue evaluates adoption
- THEN `categoriaDiff` decides, with the same top-similitud guard

#### Scenario: Empty vector results

- GIVEN the vector returns no rows
- WHEN the rescue evaluates adoption
- THEN lexical results are kept unchanged

#### Scenario: Trigger not fired

- GIVEN top-1 lexical contains every query word
- WHEN the query is processed
- THEN no vector call is made (happy-path latency and cost unchanged)

### Requirement: Byte-identical matcher sources (R-SYNC)

After the change, `scratch_live/live_buscar.js` and `scripts/new_buscar.js` SHALL be byte-identical, and the `check_sources_sync` guard SHALL be green in `npm test`.

#### Scenario: Sources in sync

- GIVEN the change is applied
- WHEN `npm test` runs
- THEN `check_sources_sync` passes and file hashes match

### Requirement: Regression probes (R-PROBES)

The probes SHALL hold: `disco de corte` MUST NOT adopt the vector (attempt-4 protection intact); `tapa para el baño` MUST adopt the vector (fix preserved).

#### Scenario: Disco de corte not adopted

- GIVEN the probe `disco de corte`
- WHEN the search runs
- THEN top-1 stays the lexical `Disco De Corte` result with no `_rescate`

#### Scenario: Tapa para el baño adopted

- GIVEN the probe `tapa para el baño`
- WHEN the search runs
- THEN top-1 becomes the vector `Tapa De Inodoro` result with `_rescate` set

### Requirement: On-disk isolation of drop suspects (R-FASEC)

The suspects `b439c4a` (casanDeVerdad) and `c33e0b0` (ventas frescas) SHALL be isolated by running the harness from disk (never touching production). If a suspect is confirmed as the cause of 244→231, its correction SHALL enter the change as a bounded, reversible fix.

#### Scenario: Suspect confirmed

- GIVEN an on-disk A/B isolates a suspect and reproduces the drop
- WHEN the correction is folded in
- THEN it is a separate reversible commit, verified against the cached set

#### Scenario: Suspect inconclusive

- GIVEN environment drift or ambiguity prevents confirmation
- WHEN the A/B concludes
- THEN the verdict documents it and no matcher change is made

### Requirement: Reproducible measurement and gate (R-GATE)

Measurement SHALL run `vec-new` vs `sinvec-new` over the identical cached 320-case set (`_coloquial_set.json` versioned, never regenerated) and gate via `--ab` with threshold ≥ 5 points for the deploy path. The vector contribution SHALL be demonstrated by a measurable gap over `sinvec-new` and the `sin historial` bucket SHALL NOT degrade below the `sinvec-new` level (the previous "> 246/320 historical" target was contaminated: the 07-09 historical reference measured without a working vector key, so it is not a valid success criterion for the vector layer).

#### Scenario: Vector contribution demonstrated

- GIVEN the full A/B completes on the cached set with a live vector
- WHEN the gate is evaluated
- THEN `vec-new` recall is measurably above `sinvec-new` (gap ≥ 4 pts) and `sin historial` is NOT below the `sinvec-new` bucket level

#### Scenario: Gate verdict

- GIVEN the gap between the two runs
- WHEN `--ab` evaluates
- THEN gap ≥ 5 opens the deploy path; gap < 5 records REJECTED (no deploy)

#### Scenario: Cached set untouched

- GIVEN both runs execute
- THEN both read the same cached set and `_coloquial_set.json` is not regenerated

### Requirement: Regression suite (R-REGRESION)

`node rag.js regresion` SHALL report zero NEW false negatives attributable to this change over the 86 cases. Pre-existing FN (baseline-identical, delta 0) are documented follow-ups, not change blockers.

#### Scenario: Zero new false negatives

- GIVEN the change is applied
- WHEN `rag.js regresion` runs
- THEN any FN findings are identical to the pre-change baseline (delta 0) and documented as follow-ups

### Requirement: No-touch boundaries (R-NO-TOUCH)

The change SHALL NOT modify `n8n_workflow.json` or `_coloquial_set.json`, and SHALL NOT introduce real RRF (deferred until family dedupe).

#### Scenario: Excluded files untouched

- GIVEN the change completes
- WHEN `git diff` is inspected
- THEN `n8n_workflow.json` and `_coloquial_set.json` show no change

#### Scenario: RRF deferred

- GIVEN the RRF option is considered after a failed gate
- WHEN the change concludes
- THEN real RRF remains deferred and documented, not implemented