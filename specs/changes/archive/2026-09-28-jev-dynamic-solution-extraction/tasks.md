# Tasks: jev-dynamic-solution-extraction

## Review Workload Forecast

Estimated changed lines: 250-400
Estimated product files: 4-6
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/jev-shadow.js, lib/serrucho-search.js, scratch_live/live_buscar.js, and test suites.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/jev-dynamic-solution-extraction` -> `perucho`
Scope: Implement Dynamic Solution Slot Extraction with Jev System 1, dynamic solution resolution, and live search integration.

## Slice: whole — Dynamic Solution Slot Extraction with Jev System 1

### Phase 1: Dynamic Solution Slot Extraction in Jev System 1

- [x] 1.1 Add `solution_terms` slot extraction to Jev schema.
  - [x] 1.1.a Safety Net: verify existing Jev and problem tests pass. Evidence: `node --test tests/jev-shadow.test.js tests/problem-search.test.js` passes.
  - [x] 1.1.b RED: add test in `tests/dynamic-solution-search.test.js` asserting `jevQuestions()` and `classifyShadow()` extract `solution_terms` array. Evidence: test fails as slot is not implemented.
  - [x] 1.1.c GREEN: update `lib/jev-shadow.js` to include `solution_terms` in `jevQuestions()`, `validateJevResponse()`, and `classifyShadow()`. Evidence: schema validation tests pass.
  - [x] 1.1.d TRIANGULATE: assert that loose tiles ("se despegó una baldosa") and squeaky doors ("puerta rechina") extract expected solution terms, while direct product queries return empty array. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: synchronize live source in `scratch_live/live_jev_shadow.js`. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 2: Dynamic Solution Resolver & Search Integration

- [x] 2.1 Implement `resolveDynamicSolutions()` and integrate into live search.
  - [x] 2.1.a Safety Net: run catalog regression test to verify baseline. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test in `tests/dynamic-solution-search.test.js` asserting that "se me despegó una baldosa" resolves dynamically to in-stock *Pega Piso* or *Cemento Blanco* without hardcoded enum. Evidence: test fails as dynamic resolver is not implemented.
  - [x] 2.1.c GREEN: implement `resolveDynamicSolutions()` in `lib/serrucho-search.js` and consume it in `scratch_live/live_buscar.js` when raw query yields 0 results or cross-department conflict. Evidence: resolution tests pass.
  - [x] 2.1.d TRIANGULATE: assert that direct product inquiries ("cemento gris", "disco de corte") or empty `solution_terms` do not trigger expansion (fail-closed). Evidence: fail-closed tests pass.
  - [x] 2.1.e REFACTOR: sync scratch_live sources via `scripts/build_conversation_sources.js` and verify source check. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Verification & Zero-Regression

- [x] 3.1 Verify end-to-end dynamic problem queries and zero regression across the catalog.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all unit test suites pass.
  - [x] 3.1.b RED: execute search probe for open problem queries asserting in-stock solutions are returned. Evidence: probe captured.
  - [x] 3.1.c GREEN: verify that novel problem queries return available inventory items with exact pricing. Evidence: probe tests pass.
  - [x] 3.1.d TRIANGULATE: verify catalog search regression suite (`node rag.js regresion`) retains 0 false negatives on 86 benchmark queries. Evidence: regression suite passes.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all suites green.
