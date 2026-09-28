# Tasks: jev-agent-improvements

## Review Workload Forecast

Estimated changed lines: 250-400
Estimated product files: 4-6
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/store-info.js, lib/conversation-context.js, scratch_live/, and test suites.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/jev-agent-improvements` -> `perucho`
Scope: Promote Jev from passive observer to Guarded Fast Router, implementing store info instant responses, greeting shortcuts, direct quote dispatch, and fail-closed AI agent fallthrough.

## Slice: whole — Guarded Fast Router with Jev System 1 Decision Engine

### Phase 1: Store Information Module & Knowledge Templates

- [x] 1.1 Implement authoritative store info template for hours, location, and payment methods.
  - [x] 1.1.a Safety Net: run existing unit tests to confirm baseline. Evidence: `npm test` passes.
  - [x] 1.1.b RED: add test in `tests/fast-router.test.js` asserting `getStoreInfo()` returns authoritative Maracaibo hours, location, and BCV payment details for relevant queries. Evidence: test fails as module does not exist.
  - [x] 1.1.c GREEN: create `lib/store-info.js` exporting `getStoreInfo(topic)` with structured templates. Evidence: store info test passes.
  - [x] 1.1.d TRIANGULATE: assert unknown store info topics return fallback or structured clarification. Evidence: boundary test passes.
  - [x] 1.1.e REFACTOR: format and export constants cleanly. Evidence: lint and tests pass.

### Phase 2: Guarded Fast Router in Conversation Context

- [x] 2.1 Implement fast router with strict confidence threshold (>= 0.85) and fail-closed behavior.
  - [x] 2.1.a Safety Net: verify existing conversation context tests pass. Evidence: `node --test tests/conversation-context.test.js` passes.
  - [x] 2.1.b RED: add test in `tests/fast-router.test.js` asserting high-confidence store_info and general greetings return fast-path instant replies, and quote queries trigger quote handoff. Evidence: test fails before router implementation.
  - [x] 2.1.c GREEN: implement `fastRouter()` in `lib/conversation-context.js` consuming Jev intent classification and emitting fast-path actions. Evidence: fast-path routing tests pass.
  - [x] 2.1.d TRIANGULATE: assert confidence < 0.85, transport errors, or ambiguous product questions fall through to `AI Agent` without interception. Evidence: fail-closed safety tests pass.
  - [x] 2.1.e REFACTOR: synchronize live source in `scratch_live/live_conversation_context.js` via `scripts/build_conversation_sources.js`. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Full End-to-End Regression & Benchmark

- [x] 3.1 Verify zero regressions across full test suite and catalog search queries.
  - [x] 3.1.a Safety Net: execute catalog search suite to ensure zero impact on product discovery. Evidence: `node rag.js regresion` reports 0 false negatives.
  - [x] 3.1.b RED: add test asserting end-to-end latency and response formatting for simulated Jev payload in fast-path vs standard agent pass-through. Evidence: test fails before full integration wiring.
  - [x] 3.1.c GREEN: verify seamless integration between Jev telemetry, fastRouter, and conversation context. Evidence: integration test passes.
  - [x] 3.1.d TRIANGULATE: test multi-turn sequence: greeting (fast-path) -> product search (AI Agent) -> store hours (fast-path). Evidence: multi-turn context integrity test passes.
  - [x] 3.1.e REFACTOR: run all verification checks (`npm test`, `node rag.js regresion`, `sdd check`). Evidence: all suites green.
