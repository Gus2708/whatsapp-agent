# Delta for search-accuracy-benchmark

## MODIFIED Requirements

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

## ADDED Requirements

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