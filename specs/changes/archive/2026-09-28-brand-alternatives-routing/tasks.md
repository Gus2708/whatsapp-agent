# Tasks: brand-alternatives-routing

## Review Workload Forecast

Estimated changed lines: 200-350
Estimated product files: 4-6
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/conversation-context.js, lib/serrucho-search.js, scratch_live/, and test suites.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/brand-alternatives-routing` -> `perucho`
Scope: Expand conversation context with brand rejection/alternatives, integrate sales popularity ranking with brand exclusion in catalog search, and implement fast-path intent routing for human requests.

## Slice: whole — Brand Alternatives, Popularity Prioritization & Fast-Path Routing

### Phase 1: Brand Rejection & Conversation Context Expansion

- [x] 1.1 Enhance conversation context to track base product query, offered brand, and handle brand switching.
  - [x] 1.1.a Safety Net: verify existing conversation tests pass. Evidence: `node --test tests/conversation-context.test.js` passes.
  - [x] 1.1.b RED: add test in `tests/brand-alternatives.test.js` asserting "otra marca" / "de otra marca" retains base query and registers previously offered brand in `excluded_brands`. Evidence: test fails as brand resolution is not implemented.
  - [x] 1.1.c GREEN: update `lib/conversation-context.js` with brand switching patterns and state structure tracking `base_product`, `brand`, and `excluded_brands`. Evidence: brand resolution test passes.
  - [x] 1.1.d TRIANGULATE: assert explicit brand request ("en marca Griven") vs brand rejection ("otra marca") produces targeted search queries. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: ensure clean code formatting and export sync in `scripts/build_conversation_sources.js`. Evidence: lint and test pass.

### Phase 2: Catalog Search Brand Filtering and Sales Popularity Ranking

- [x] 2.1 Support excluded brands in catalog search and prioritize top-selling available alternatives.
  - [x] 2.1.a Safety Net: run regression catalog test to establish baseline. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add test in `tests/brand-alternatives.test.js` simulating catalog search with `marcas_excluidas` filtering out previously offered brand and returning highest-selling alternative in stock. Evidence: test fails before search parameter support.
  - [x] 2.1.c GREEN: update `lib/serrucho-search.js` and `scratch_live/live_buscar.js` to filter out excluded brands from candidates and preserve in-stock popularity ranking. Evidence: search brand exclusion test passes.
  - [x] 2.1.d TRIANGULATE: verify that when all brands of a product are exhausted or no alternative exists, search returns honest clarification without false-positive matches. Evidence: boundary test passes.
  - [x] 2.1.e REFACTOR: sync scratch_live sources via `node scripts/build_conversation_sources.js` and verify source sync check. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Fast-Path Intent Routing and Full Regression Verification

- [x] 3.1 Implement fast-path for human assistance and quotes, validating end-to-end regression.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all 155 unit tests pass.
  - [x] 3.1.b RED: add test in `tests/brand-alternatives.test.js` asserting messages like "quiero hablar con un humano" or "asesor" resolve to `action: 'handoff'` (`[PEDIR_AYUDA]`) immediately. Evidence: test fails prior to fast-path interception.
  - [x] 3.1.c GREEN: integrate fast-path intent classifier in `lib/conversation-context.js` for `human_request` and `quote`. Evidence: fast-path tests pass.
  - [x] 3.1.d TRIANGULATE: assert combined sequence: product inquiry -> brand alternative -> human escalation transitions cleanly without state leakage. Evidence: multi-turn integration test passes.
  - [x] 3.1.e REFACTOR: run full verification suite (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all tests pass with zero regressions.
