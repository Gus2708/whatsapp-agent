# Tasks: Prevent False Handoff On Agent Error

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~80–120 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Test Harness & Workflow Guard | PR 1 | `node tests/handoff_guard.test.js` | `node tests/handoff_guard.test.js` | `git checkout -- n8n_workflow.json` |

## Phase 1: Test Harness

- [x] 1.1 Create `tests/handoff_guard.test.js` covering:
  - Error payload `{ error: "Connection error." }` handling in sanitizer logic -> outputs `FALLBACK` text and sets `_sanitized: true`. (R-ERR-SANITIZE)
  - Blank/whitespace string handling in sanitizer logic -> outputs `FALLBACK` text. (R-ERR-SANITIZE)
  - Empty text handling in handoff detector logic -> returns `{ skip: "sin_texto" }` and preserves session state. (R-HANDOFF-ROBUST)
  - Fallback text recognition in handoff detector -> returns `{ esBot: true }`. (R-HANDOFF-ROBUST)
  - Legitimate employee response -> returns `{ esBot: false, handoff: true }`. (R-HANDOFF-ROBUST)

## Phase 2: Workflow Code Hardening

- [x] 2.1 Update `Sanitize Agent Output` in `n8n_workflow.json` to catch `item.json.error` or empty output, assign `FALLBACK`, and ensure normalized text is logged for `mensajes_bot`. (R-ERR-SANITIZE)
- [x] 2.2 Update `Detectar Handoff Empleado` in `n8n_workflow.json` to immediately skip `!ntext` with `{ skip: "sin_texto", cliente }` and include `FALLBACK` in `PLANTILLAS_BOT`. (R-HANDOFF-ROBUST)
- [x] 2.3 Verify `Send Agent Response` parameters in `n8n_workflow.json` to prevent empty string dispatches. (R-SEND-GUARD)

## Phase 3: Automated Verification

- [x] 3.1 Run `node tests/handoff_guard.test.js` to assert all unit tests pass green.
- [x] 3.2 Validate `n8n_workflow.json` syntax and JSON integrity.

## Phase 4: Production Container Deployment & Verification

- [x] 4.1 Synchronize the updated workflow into the running `n8n_agent` container.
- [x] 4.2 Verify `http://localhost:5678/healthz` responds `ok`.
