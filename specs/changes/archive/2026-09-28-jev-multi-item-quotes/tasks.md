# Tasks: jev-multi-item-quotes

## Review Workload Forecast

Estimated changed lines: 150-250
Estimated product files: 4-6
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/serrucho-search.js, scratch_live/live_presupuesto.js, scripts/new_presupuesto.js, tests/multi-item-quotes.test.js.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/jev-multi-item-quotes` -> `perucho`
Scope: Implement deterministic natural language list tokenizer in `parseItems()`, supporting conjunction splitting ("y", "e", "con", "más", "ademas", "tambien"), bullet cleaning, written quantity parsing ("un", "dos", "tres", etc.), and synchronize across lib, live quote tool, and development scripts.

## Slice: whole — Multi-Item Conversational List Tokenizer

### Phase 1: Test Suite & Conjunction List Tokenizer

- [x] 1.1 Implement natural language list tokenizer in `lib/serrucho-search.js`.
  - [x] 1.1.a Safety Net: verify existing test suites pass. Evidence: `npm test` passes (221 tests passing).
  - [x] 1.1.b RED: add test suite in `tests/multi-item-quotes.test.js` asserting natural list parsing across conjunctions ("y", "con", "más"), bullets, written quantities ("dos sacos", "un cuñete"), and attribute preservation. Evidence: tests fail before implementation.
  - [x] 1.1.c GREEN: upgrade `parseItems(str)` in `lib/serrucho-search.js` to split on conjunction lookahead boundaries, clean bullets and enumeration markers, extract written and prefix/postfix quantities, and strip unit qualifiers. Evidence: `tests/multi-item-quotes.test.js` passes.
  - [x] 1.1.d TRIANGULATE: assert various complex real-world user messages ("2 sacos de cemento y 4 tubos 2x1 y 6 laminas de zinc", "2 sacos de cemento, 4 cerchas y 10 tubos 1x1", "- 2 cemento\n* 4 tubos", "un cuñete de pintura y dos sacos de cemento", "cemento:2, tubos 2x1:4"). Evidence: triangulation tests pass (9/9 tests pass).
  - [x] 1.1.e REFACTOR: optimize regex lookaheads and ensure clean code structure. Evidence: lint and tests pass.

### Phase 2: Live Tool Parity & Source Synchronization

- [x] 2.1 Synchronize upgraded `parseItems()` into live quote tool and scripts.
  - [x] 2.1.a Safety Net: verify baseline regression catalog test passes. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test asserting live quote tool parses multi-item strings identically to `lib/serrucho-search.js`. Evidence: check_sources_sync caught drift before update.
  - [x] 2.1.c GREEN: synchronize `parseItems` to `scratch_live/live_presupuesto.js` and `scripts/new_presupuesto.js`. Evidence: files updated and tests pass.
  - [x] 2.1.d TRIANGULATE: verify source sync across all modules: run `node scripts/check_sources_sync.js`. Evidence: sources in sync passes.
  - [x] 2.1.e REFACTOR: rebuild workflow artifacts via `node scripts/build_jev_staging.js` and `node scripts/build_workflow.js`. Evidence: workflows rebuild successfully.

### Phase 3: Full Regression Verification & Quality Gate

- [x] 3.1 Verify full test suite, regression benchmark, and SDD structural checks.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all 230 unit tests and 21 vitest suites pass.
  - [x] 3.1.b RED: execute probe asserting complex conversational quote inputs yield valid parsed budgets. Evidence: probe executed.
  - [x] 3.1.c GREEN: verify that full budget generation accurately prices multi-item inputs in dollars and bolívares. Evidence: budget generation tests pass.
  - [x] 3.1.d TRIANGULATE: verify catalog search regression suite (`node rag.js regresion`) retains 0 false negatives on 86 benchmark queries. Evidence: regression suite passes with 0 false negatives.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all checks pass cleanly.
