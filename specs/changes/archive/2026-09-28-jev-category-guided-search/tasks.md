# Tasks: jev-category-guided-search

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

Planned branch/base: `feature/jev-category-guided-search` -> `perucho`
Scope: Implement two-tier category-guided search with Jev System 1 department classification, material slot extraction, and search category alignment scoring to eliminate false positive cross-department matches.

## Slice: whole — Category-Guided Search with Jev System 1 Decision Engine

### Phase 1: Macro-Department & Material Slot Schema in Jev

- [x] 1.1 Add department and material questions to Jev decision schema.
  - [x] 1.1.a Safety Net: verify existing Jev unit tests pass. Evidence: `node --test tests/jev-shadow.test.js` passes.
  - [x] 1.1.b RED: add test in `tests/category-search.test.js` asserting `jevQuestions()` includes `department` and `material` questions with calibrated rubrics. Evidence: test fails as schema does not contain department.
  - [x] 1.1.c GREEN: update `lib/jev-shadow.js` to include macro-department choices and material slot extraction in `jevQuestions()`. Evidence: schema validation tests pass.
  - [x] 1.1.d TRIANGULATE: assert that roofing ("sinz 6m"), electrical ("cable 12"), and disc ("disco madera") evaluate to expected departments. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: synchronize live source in `scratch_live/live_jev_shadow.js` via `scripts/build_jev_sources.js`. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 2: Category Alignment Scoring & False-Positive Suppression

- [x] 2.1 Implement category alignment boost and cross-category noise suppression in search ranking.
  - [x] 2.1.a Safety Net: run catalog regression test to verify baseline. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test in `tests/category-search.test.js` asserting that "sinz de 6 metros" with department `techos_laminas` ranks Lámina de Zinc above Malla Electrosoldada, and "disco madera" filters out metal discs. Evidence: test fails before category alignment implementation.
  - [x] 2.1.c GREEN: implement `department` and `material` alignment in `lib/serrucho-search.js` and `scratch_live/live_buscar.js` awarding +40 for matching department and -80 for conflicting department. Evidence: alignment test passes.
  - [x] 2.1.d TRIANGULATE: assert that unclassified queries or confidence < 0.80 execute open search without penalizing valid products. Evidence: fail-closed boundary tests pass.
  - [x] 2.1.e REFACTOR: sync scratch_live sources via `scripts/build_conversation_sources.js` and verify source check. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Empirical Failure Resolution & End-to-End Regression

- [x] 3.1 Verify resolution of production escalations and zero regression across all test suites.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all unit test suites pass.
  - [x] 3.1.b RED: run `scripts/_test_fallos_reales.js --prod` asserting previously failing cross-department matches resolve to correct items. Evidence: baseline failure count captured.
  - [x] 3.1.c GREEN: verify that zinc roofing query yields Lámina de zinc and wood cutting disc yields wood blade. Evidence: real escalations test passes.
  - [x] 3.1.d TRIANGULATE: verify catalog search regression suite (`node rag.js regresion`) retains 0 false negatives. Evidence: regression suite passes.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all suites green.
