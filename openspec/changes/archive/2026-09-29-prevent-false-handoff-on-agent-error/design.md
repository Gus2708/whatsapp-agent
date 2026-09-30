# Design: Prevent False Handoff On Agent Error

## Technical Approach

We implement a defense-in-depth strategy across three layers of the n8n conversation workflow:

1. **Layer 1: Sanitizer Error Boundary (`Sanitize Agent Output`)**
   - The node inspects each item. If `item.json.error` is present or if `item.json.output` is absent, non-string, or blank after trimming, it immediately sets `item.json.output = FALLBACK` and flags `_sanitized = true`.
   - The normalized `FALLBACK` text is dispatched to `mensajes_bot` via Supabase REST so that subsequent outgoing webhook events are identified as bot-generated.

2. **Layer 2: Outgoing Message Dispatch Guard (`Send Agent Response`)**
   - Ensure the expression that builds the outbound message text defaults to the fallback message rather than an empty string `""` if `$json.output` is blank.

3. **Layer 3: Handoff Classifier Guard (`Detectar Handoff Empleado`)**
   - If the normalized outbound text `ntext` is empty (`!ntext`), the node immediately returns `{ skip: 'sin_texto', cliente }` without modifying `chat_sessions`.
   - Add the standard `FALLBACK` string to `PLANTILLAS_BOT` so even if network latency delays `mensajes_bot` recording, the static template matcher catches it instantly.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| D-1 | Sanitizer error handling | Fallback to `FALLBACK` text when `item.json.error` or empty output | Throw fatal error; stop execution silently | Customers should always receive an empathetic acknowledgement instead of dead silence. |
| D-2 | Bot template sync | Add `FALLBACK` template into `PLANTILLAS_BOT` in `Detectar Handoff Empleado` | Rely only on dynamic `mensajes_bot` lookup | If Supabase is slow or encounters a network hiccup, template matching operates synchronously in memory with zero network dependencies. |
| D-3 | Empty outbound handling in handoff | Skip `!ntext` messages with `{ skip: 'sin_texto' }` | Treat empty text as manual handoff | A blank message or media without caption is not a verified conversational intervention by a sales agent. |
| D-4 | Isolated unit test harness | Create `tests/handoff_guard.test.js` | Test only inside live Docker container | Hermetic, reproducible Node.js test running in under 1 second without modifying live production state. |

## Data Flow

```
Incoming Customer Message
           │
           ▼
        AI Agent (LangChain)
           │
           ├─ Success ───────────► { output: "..." }
           └─ Connection Error ──► { error: "Connection error." }
                                         │
                                         ▼
                            Sanitize Agent Output
                                         │
                       ┌─────────────────┴─────────────────┐
                       │ item.json.error || !output.trim() │
                       │                                   │
                       ▼                                   ▼
              output = FALLBACK                  output = guarded / clean
              insert mensajes_bot                insert mensajes_bot
                       │                                   │
                       └─────────────────┬─────────────────┘
                                         │
                                         ▼
                               Send Agent Response (WAHA)
                                         │
                                         ▼
                           WAHA outbound webhook (fromMe: true)
                                         │
                                         ▼
                             Detectar Handoff Empleado
                                         │
                         ┌───────────────┴───────────────┐
                         │                               │
                      !ntext                  ntext in PLANTILLAS_BOT
                         │                    or in mensajes_bot
                         ▼                               │
              skip: "sin_texto"                          ▼
             (chat_sessions untouched)             esBot: true
                                              (chat_sessions untouched)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `n8n_workflow.json` | Modify | Update code in `Sanitize Agent Output`, `Detectar Handoff Empleado`, and `Send Agent Response` |
| `tests/handoff_guard.test.js` | Create | Unit test suite testing error sanitization, empty text suppression, and handoff classifier |
| `openspec/changes/prevent-false-handoff-on-agent-error/tasks.md` | Create | Execution and verification task list |

## Verification Plan

1. **Automated Unit Tests**:
   - Run `node tests/handoff_guard.test.js` to verify all scenarios (error payload, empty string, template match, employee string).
2. **Container Workflow Synchronization**:
   - Verify `n8n_workflow.json` is validated and reloaded in the running `n8n_agent` container.
3. **Live Health & Execution Check**:
   - Check that healthz responds `ok`.
