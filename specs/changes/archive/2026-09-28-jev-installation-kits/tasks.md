# Tasks: jev-installation-kits

## Review Workload Forecast

Estimated changed lines: 250-400
Estimated product files: 4-6
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/installation-kits.js, lib/serrucho-search.js, scratch_live/live_buscar.js, scripts/new_buscar.js, tests/installation-kits.test.js.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/jev-installation-kits` -> `perucho`
Scope: Implement deterministic installation kit resolver and query detector, intercept direct installation inquiries in live search, attach suggested kits to primary fixture queries, and synchronize across lib, live tools, and development scripts.

## Slice: whole — Installation Kit Resolver & Live Search Enrichment

### Phase 1: Core Installation Kits & Query Detection

- [x] 1.1 Implement installation kit resolver and query detector in `lib/installation-kits.js`.
  - [x] 1.1.a Safety Net: verify existing test suites pass. Evidence: `npm test` passes (240 unit tests pass).
  - [x] 1.1.b RED: add test in `tests/installation-kits.test.js` asserting kit resolution for toilets, sinks, washbasins, roofs, and pipes, plus query detection and upsell matching. Evidence: test fails as module is not yet implemented.
  - [x] 1.1.c GREEN: implement `getInstallationKit()`, `detectInstallationQuery()`, and `findComplementaryKit()` in `lib/installation-kits.js` and re-export in `lib/serrucho-search.js`. Evidence: kit resolution and detection tests pass.
  - [x] 1.1.d TRIANGULATE: assert various query formulations, boundaries (fail-closed on single accessories), and quote string compatibility with `parseItems()`. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: ensure clean exports and formatting. Evidence: lint and tests pass.

### Phase 2: Live Search Pipeline Integration & Source Synchronization

- [x] 2.1 Integrate installation kit detection and upsell into `scratch_live/live_buscar.js` and sync scripts.
  - [x] 2.1.a Safety Net: verify baseline regression catalog test passes. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test asserting `live_buscar.js` intercepts direct kit inquiries and enriches primary fixture searches with `kit_sugerido`. Evidence: test fails before search integration.
  - [x] 2.1.c GREEN: update `scratch_live/live_buscar.js` to evaluate `detectInstallationQuery()` before the missing fallback, and attach `kit_sugerido` to matching fixtures. Evidence: live search integration tests pass.
  - [x] 2.1.d TRIANGULATE: synchronize `scripts/new_buscar.js` and update `scripts/check_sources_sync.js`. Evidence: sources in sync passes.
  - [x] 2.1.e REFACTOR: rebuild workflow artifacts via `node scripts/build_jev_staging.js` and `node scripts/build_workflow.js`. Evidence: workflows rebuild successfully.

### Phase 3: Full Regression Verification & Quality Gate

- [x] 3.1 Verify full test suite, regression benchmark, and SDD structural checks.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all unit and integration tests pass.
  - [x] 3.1.b RED: execute probe asserting complex fixture questions yield valid parsed estimates and quote strings. Evidence: probe executed.
  - [x] 3.1.c GREEN: verify that full budget estimation accurately prices generated kit items. Evidence: budget generation tests pass.
  - [x] 3.1.d TRIANGULATE: verify catalog search regression suite (`node rag.js regresion`) retains 0 false negatives on 86 benchmark queries. Evidence: regression suite passes with 0 false negatives.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all checks pass cleanly.
