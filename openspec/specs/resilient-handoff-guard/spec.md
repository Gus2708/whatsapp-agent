# resilient-handoff-guard Specification

## Purpose

Prevent false human handoff triggers and unwarranted 30-minute chat silencing when transient network errors, timeouts, or empty outputs occur in the AI Agent pipeline.

## Requirements

### Requirement: Agent Error Sanitization (R-ERR-SANITIZE)

When the `AI Agent` execution yields an error (such as `{ error: "Connection error." }`) or an empty/undefined output, the `Sanitize Agent Output` node SHALL replace the output with the polite customer fallback message (`FALLBACK`), flag `_sanitized = true`, and record the normalized fallback text in `mensajes_bot`.

#### Scenario: AI Agent emits connection error
- GIVEN the AI Agent node fails with `{ error: "Connection error." }`
- WHEN `Sanitize Agent Output` processes the item
- THEN `item.json.output` is populated with the polite fallback text
- AND `_sanitized` is set to `true`
- AND the normalized fallback text is inserted into `mensajes_bot`

#### Scenario: AI Agent emits empty output string
- GIVEN the AI Agent node succeeds but produces `output: ""` or `output: "   "`
- WHEN `Sanitize Agent Output` processes the item
- THEN `item.json.output` is populated with the polite fallback text
- AND `_sanitized` is set to `true`

### Requirement: Outgoing Message Empty Suppression (R-SEND-GUARD)

The system SHALL NOT dispatch empty or whitespace-only messages to WAHA `/api/sendText`. If the text payload is empty, the HTTP dispatch SHALL either be bypassed or guarded from execution.

#### Scenario: Attempted dispatch of empty output
- GIVEN an item where `output` is empty or only whitespace
- WHEN evaluation occurs before sending to WAHA
- THEN no HTTP request is made to WAHA `/api/sendText`
- AND no blank WhatsApp message is transmitted

### Requirement: Robust Outgoing Handoff Detection (R-HANDOFF-ROBUST)

The `Detectar Handoff Empleado` node SHALL only consider non-empty text messages for human handoff detection. If an outgoing message payload contains empty text (`!ntext`) or non-textual attachments without captions, it SHALL NOT transition `chat_sessions` to `manual`.

#### Scenario: Outgoing message has empty text
- GIVEN an outgoing message with `fromMe: true` and empty text `""`
- WHEN `Detectar Handoff Empleado` inspects the message
- THEN the node returns `{ skip: "sin_texto" }` or `{ esBot: true }`
- AND the session in `chat_sessions` remains in its current state (`automatico`)

#### Scenario: Outgoing message is legitimate employee response
- GIVEN an outgoing message with `fromMe: true` and text "Buenas tardes, ya lo atendemos"
- AND the text does not match any bot template or recent `mensajes_bot` entry
- WHEN `Detectar Handoff Empleado` inspects the message
- THEN the node returns `{ esBot: false, handoff: true }`
- AND the session in `chat_sessions` is set to `manual` with `manual_since` updated

#### Scenario: Outgoing message matches bot fallback text
- GIVEN an outgoing message with `fromMe: true` containing the fallback text
- WHEN `Detectar Handoff Empleado` inspects the message
- THEN the node identifies it as bot-generated (`esBot: true`)
- AND `chat_sessions` is NOT updated to `manual`
