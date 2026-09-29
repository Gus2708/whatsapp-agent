# Proposal: Prevent False Handoff On Agent Error

## Intent

When the upstream language model (`AI Agent` node) experiences transient network connectivity issues or timeouts, n8n emits an error object (`{ error: "Connection error." }`).
Due to missing error handling in `Sanitize Agent Output`, the output text defaults to empty string (`""`), which `Send Agent Response` forwards to WhatsApp.
Because outgoing empty messages are not matched in `mensajes_bot`, the `Detectar Handoff Empleado` node classifies the outgoing blank message as an employee intervention, transitioning the conversation session to `manual` state.
Once in `manual` state, the customer's chat session remains silenced for 30 minutes, ignoring all subsequent customer inquiries.

This change hardens the error handling and handoff detection to guarantee that transient LLM errors trigger polite fallback messaging, empty messages are never transmitted, and empty messages never trigger a human handoff.

## Scope

### In Scope

1. **`Sanitize Agent Output` hardening**:
   - Explicitly detect `item.json.error` or falsy/empty `item.json.output`.
   - Assign the friendly `FALLBACK` text when an agent error occurs or output is missing.
   - Record the fallback message in `mensajes_bot` so any downstream reflection recognizes it as bot-generated.
2. **`Send Agent Response` guard**:
   - Prevent posting empty or whitespace-only messages to WAHA (`/api/sendText`).
   - If output text resolves to empty, suppress outbound dispatch.
3. **`Detectar Handoff Empleado` hardening**:
   - Explicitly ignore outgoing events where normalized text is empty (`!ntext`) or non-conversational media without text.
   - Never mark `chat_sessions` as `manual` on empty text payloads.
4. **Harness & regression tests**:
   - Automated test suite validating that agent error payloads produce fallback text.
   - Test verifying that empty outgoing webhooks do not set session to `manual`.
   - Test verifying that valid employee interventions continue to trigger `manual` handoff accurately.

### Out of Scope

- Modifying the underlying LLM provider or OpenRouter endpoint logic.
- Altering the RAG hybrid vector search or database catalog queries.
- Changing the 30-minute manual inactivity reactivation timeout threshold.

## Capabilities

### New Capabilities

- `resilient-handoff-guard`: Error boundary in n8n workflow preventing empty dispatches and false manual transitions.

### Modified Capabilities

- None.

## Approach

1. Create a unit test harness in `tests/handoff_guard.test.js` covering:
   - Sanitizer behavior under `{ error: ... }` and empty inputs.
   - Handoff detector behavior under empty, whitespace, and real employee strings.
2. Update the Javascript code inside `n8n_workflow.json` for:
   - `Sanitize Agent Output`
   - `Detectar Handoff Empleado`
   - `Send Agent Response` (expression / precondition)
3. Synchronize any standalone script copies if mirrored.
4. Execute test suite and verify deployed container workflow.

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `n8n_workflow.json` (`Sanitize Agent Output`) | Modified | Error capture & fallback assignment |
| `n8n_workflow.json` (`Detectar Handoff Empleado`) | Modified | Guard against empty payload handoff |
| `n8n_workflow.json` (`Send Agent Response`) | Modified | Empty text guard |
| `tests/handoff_guard.test.js` | New | Verification test suite |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fallback message overrides intentional quiet drops | Low | Only trigger fallback when agent actually executed with error |
| Employee replies consisting solely of media are ignored | Low | Handoff is conversational; employee text replies ("ya voy", "si", etc.) are reliably caught |
| Workflow drift between on-disk JSON and n8n container | Low | Reload/import workflow into container and verify live execution |

## Rollback Plan

Revert `n8n_workflow.json` and associated test files via git checkout, then reload workflow in n8n.
