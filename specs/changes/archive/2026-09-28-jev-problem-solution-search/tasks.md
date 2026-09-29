# Tasks: jev-problem-solution-search

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

Planned branch/base: `feature/jev-problem-solution-search` -> `perucho`
Scope: Implement Problem-to-Product Intent Architecture with Jev System 1 classification, deterministic solution resolution, and catalog search integration.

## Slice: whole — Problem-to-Product Intent Architecture with Jev System 1

### Phase 1: Problem Intent Classification in Jev System 1

- [x] 1.1 Add `problem_intent` question to Jev decision schema.
  - [x] 1.1.a Safety Net: verify existing Jev and category tests pass. Evidence: `node --test tests/jev-shadow.test.js tests/category-search.test.js` passes.
  - [x] 1.1.b RED: add test in `tests/problem-search.test.js` asserting `jevQuestions()` defines `problem_intent` with 7 calibrated choices. Evidence: test fails as schema does not define problem_intent.
  - [x] 1.1.c GREEN: update `lib/jev-shadow.js` to include `problem_intent` question in `jevQuestions()`, `validateJevResponse()`, and `classifyShadow()`. Evidence: schema validation tests pass.
  - [x] 1.1.d TRIANGULATE: assert leak, pipe, rust, and direct product inquiries evaluate to expected choices. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: synchronize live source in `scratch_live/live_jev_shadow.js` via `scripts/build_jev_sources.js`. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 2: Solution Resolver & Search Integration

- [x] 2.1 Implement deterministic solution resolver and search query expansion.
  - [x] 2.1.a Safety Net: run catalog regression test to verify baseline. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test in `tests/problem-search.test.js` asserting that "algo para tapar una gotera" resolves to cemento plástico and manto asfáltico solutions under `techos_laminas`. Evidence: test fails as resolver is not defined.
  - [x] 2.1.c GREEN: implement `resolveProblemSolutions()` in `lib/serrucho-search.js` and consume it in `scratch_live/live_buscar.js` when `problem_intent` confidence >= 0.80. Evidence: resolution tests pass.
  - [x] 2.1.d TRIANGULATE: assert that direct product queries ("saco de cemento gris", "cable 12") or confidence < 0.80 do not trigger problem expansion (fail-closed). Evidence: fail-closed tests pass.
  - [x] 2.1.e REFACTOR: sync scratch_live sources via `scripts/build_conversation_sources.js` and verify source check. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Verification & Zero-Regression

- [x] 3.1 Verify end-to-end problem queries and zero regression across the catalog.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all unit test suites pass.
  - [x] 3.1.b RED: execute search probe for "algo para tapar una gotera" asserting in-stock solutions are returned. Evidence: probe captured.
  - [x] 3.1.c GREEN: verify that leak and plumbing queries return available inventory items with exact pricing. Evidence: probe tests pass.
  - [x] 3.1.d TRIANGULATE: verify catalog search regression suite (`node rag.js regresion`) retains 0 false negatives on 86 benchmark queries. Evidence: regression suite passes.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all suites green.
