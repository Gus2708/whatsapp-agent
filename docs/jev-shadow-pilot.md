# Jev observation pilot

This increment supports the real Jev API through TypeSafe or Vercel AI Gateway when explicitly enabled. `JEV_MODE=shadow` observes without changing replies, tool arguments, search queries, conversation state or routing while `JEV_ROUTING_ENABLED=false` (default). The separate routing switch is experimental and must remain off outside controlled testing. The workflow export is inactive; synthetic evaluation can contact the selected provider.

The generated flow is `Prepare Conversation Context → Jev Shadow Decision → Needs Product Clarification?`. The existing true/false branches remain intact. The new Code node copies the input and adds bounded `jev_shadow` metadata. The sanitizer removes that field before delivery. Metadata can be inspected in the Jev node's n8n execution output; nothing is written to a new database or log service.

## API and limits

The adapter uses `POST https://api.typesafe.ai/v1/systemone` with a bearer `TYPESAFE_API_KEY`, the default pinned `jev-1.13.0`, and five choice questions: intent, relation to the previous product request, department, material and problem intent. It follows the [official API](https://docs.typesafe.ai/api) and [model documentation](https://docs.typesafe.ai/models), checked on 2026-09-25. `jev-shadow-v1` identifies the question/validation contract. Before changing `JEV_MODEL`, confirm that the selected version supports this contract and rerun the synthetic evaluation.

Set `JEV_PROVIDER=typesafe` (default) for direct access or `JEV_PROVIDER=vercel` for Vercel. The gateway uses `POST https://ai-gateway.vercel.sh/typesafe/v1/systemone`, `AI_GATEWAY_API_KEY` and `typesafe-ai/jev`, as documented in [Vercel integration guidance](https://vercel.com/i/jev-integrations). A blank `JEV_MODEL` selects the provider's default. Gateway Jev is an alias, not a pinned model version; reevaluate when its behavior changes. Unknown providers, incompatible models and missing provider-specific keys fail closed without a request. No cross-provider fallback occurs.

One attempt is permitted per turn, with no retries or redirects. The default deadline is 1,500 ms (configuration range 10–5,000 ms). **Shadow executes inline and adds latency**, up to the deadline plus normal scheduling/processing overhead. Axios has both a native timeout and cancellation, without assuming `AbortController` exists in n8n's sandbox. A missing key, configuration error, HTTP rejection (including 429/529), timeout, malformed response or low confidence leaves routing unchanged while `JEV_ROUTING_ENABLED=false`.

Both returned choices must belong to closed domains; all probabilities must be finite, in range and sum to approximately one. The chosen option must have maximal probability. Confidence is checked separately and defaults to a 0.7 acceptance threshold. Responses are limited to 16 KB. Metadata contains only labels, confidence, selected probability, model, status, request-attempt flag, elapsed time and token/cost metrics; raw provider errors, prompts and keys are omitted.

## Data sent

Only the latest message body, bounded to 500 characters after best-effort redaction, and allowlisted prior product attributes are sent. No structured customer identity, session ID, memory notes, history, catalog prices or stored credentials are included. Previous attributes are from before the current context resolution; they remain unconfirmed requests and do not establish stock or price. When conversation state is disabled or expired, there are no prior attributes.

The redactor masks obvious URLs, email addresses, phone/account-like numbers, credential patterns, explicit self-introductions and currency amounts. **It is not anonymization:** personal information can remain in arbitrary prose. Redaction can also remove useful dimensions or quantities. Keep customer traffic disabled until this disclosure and redaction behavior have been reviewed for the intended environment. Rubrics treat customer instructions as data; this is not a guarantee of model resistance to prompt injection.

## Local verification and synthetic evaluation

```powershell
npm run test:jev
npm run eval:jev
```

Offline evaluation validates 30 labeled synthetic cases (corpus v2: original 14 plus 16 Spanish follow-ups and topic changes) and shows deterministic rule coverage. Run `node scripts/evaluate_jev.js --slots` for a separate fixed 12-case corpus covering department, material and problem labels. Offline evaluation performs zero requests and reports provider accuracy, tokens, cost and latency as `null`. Mock tests verify contracts and failure behavior; they do not measure Jev quality.

For a real measurement, securely set `TYPESAFE_API_KEY` in the shell environment, then run:

```powershell
npm run eval:jev -- --live
```

If the key has instead been added securely to the local `.env`, explicitly load it with Node 22:

```powershell
node --env-file=.env scripts/evaluate_jev.js --live
```

For Vercel, keep `AI_GATEWAY_API_KEY` in the local uncommitted `.env` and run this isolated PowerShell command. These overrides apply only to the child process and do not enable the workflow:

```powershell
powershell -NoProfile -Command { $env:JEV_PROVIDER='vercel'; $env:JEV_MODEL='typesafe-ai/jev'; node --env-file=.env scripts/evaluate_jev.js --live }
```

This sends only the selected fixed synthetic corpus, serially, at most 30 attempts. Add `--slots` for the separate 12-case corpus. The script does not load `.env` automatically, access WhatsApp, load the catalog, contact a database, or enable customer shadow traffic. The optional Node flag loads local environment configuration before execution. The command overrides mode only within its process. Reports contain case IDs and typed metadata, not message text. API failures yield a nonzero exit code. `provider_calls` counts transport attempts, not confirmed deliveries.

Accuracy uses valid responses against the fixture's expected labels, including low-confidence results; `accuracy_denominator`, total/valid/accepted counts make that scope explicit. New slot metrics report labeled, answered, correct and confident-answer counts separately. An absent optional answer is excluded from accuracy and visible through coverage; it is never counted as correct. Review labels with the business owner before treating the small corpus as a quality gate. The report also shows p95 elapsed time and observed usage. `JEV_INPUT_USD_PER_MILLION` optionally supplies a current verified input-token rate; absent a rate, cost remains unknown. It assumes no output-token charge and must be revised if provider pricing changes.

The deterministic cable resolver is not the current Gemini agent. Intent agreement is therefore always `null`; continuation agreement is available only for its comparable `search`/`clarify` cases. This experiment does not measure full-agent sales accuracy or demonstrate an improvement over production.

## Routing and search boundary

The Jev node reads all five classifications, but department, material and problem labels are **observations only**. The generated workflow's `buscar_productos` Code Tool JSON schema accepts only `p_busqueda`, and its published baseline search implementation has no department/material/problem alignment logic. The larger `scratch_live/live_buscar.js` development copy contains optional fields and alignment logic, but `buildWorkflow` does not install that copy. Do not claim these classifications change search results or let the Agent synthesize them as if they were trusted Jev output. Until a separate, tested search migration is ready, search receives only `p_busqueda`.

The isolated n8n 2.23.3 probe in `scripts/build_jev_tool_probe.js` confirmed a partial bridge through Code Tool's JavaScript sandbox. A synthetic `Jev Shadow Decision` with one item was visible through `$('Jev Shadow Decision').all()` and `.first()`. With two synthetic items, each Tool Code invocation could see both items, but `.first()` returned the first item's department for **both** queries. The second item therefore received the wrong context in the probe. This used Code Tool's direct execution path, not an AI Agent invocation; the other PC's n8n version remains unknown. The disposable container had networking disabled, no mounts, no secrets and no access to the local n8n database; it was removed after the test.

The minimum safe route requires a representative AI Agent + Code Tool probe on the target n8n version, an explicit one-item guard or proven item binding, a reviewed migration of the published search logic, closed-label and per-field confidence validation read directly from Jev metadata, and a separate default-off search switch. Do not transplant the 128 KB development search code over the 75 KB published baseline without comparing behavior and catalog regressions.

The fast router is applied only when both `JEV_MODE=shadow` and `JEV_ROUTING_ENABLED=true`. This includes its rule fallback when Jev is unavailable. With the default false switch, Jev cannot change the context action, query, state, reply or the IF branch. The existing deterministic conversation-context pilot can still make its own clarification decisions when independently enabled. A `quote` classification always falls through to the AI Agent, which retains the `hacer_presupuesto` tool; Jev never constructs a quote or price.

## Isolated n8n validation and rollback

1. Compare the other PC's exported workflow and runtime versions with this repository before transferring changes. The current deployment script does not install the new topology; import the generated workflow into an isolated, inactive staging copy.
2. Keep real WhatsApp sends, database mutations, reservations, escalation and learning disconnected. Confirm the Code node can load axios, access its configured environment, and cancel requests in that runtime.
3. `JEV_MODE=off` is the default and sends nothing. `JEV_MODE=shadow` with `JEV_ROUTING_ENABLED=false` observes inline but preserves the previous route. `JEV_ROUTING_ENABLED=true` opts into fast replies from both Jev and rule fallback; keep it false until a separate full-agent staging test supports routing. Quote intent always passes to the Agent so `hacer_presupuesto` remains available. `CONVERSATION_STATE_ENABLED=true` is independently required for prior cable context.
4. Roll back by setting `JEV_MODE=off` and recreating the affected container so its environment changes take effect. The original cable pilot continues independently. To remove the node entirely, reconnect Prepare Conversation Context directly to Needs Product Clarification and use the pre-Jev workflow export.

`.env.example` and Compose declare mode, key, model, timeout, confidence and optional input rate. No actual secrets have been added. To regenerate after source edits, run `node scripts/build_workflow.js`; `npm test` checks source/workflow synchronization and existing tests. Root Node tests execute the n8n source with an injected axios transport and an absent `AbortController`; they do not replace staging validation of n8n itself.

## Observed Vercel evaluation (2026-09-27)

One serial run of the unchanged 14-case synthetic corpus made 14 calls using the default 1,500 ms deadline. All 14 responses passed schema validation, with no HTTP failures or timeouts. Intent matched 12/14 labels (85.7%); continuation matched 11/14 (78.6%). Eight cases met both confidence thresholds; six were marked low confidence. The observed p95 was 831 ms, with 9,472 input and 1,572 output tokens. Cost was not estimated because no verified rate was configured.

Intent mismatches: `cable-roll` (general instead of product_inquiry), `orphan-gauge` (unclear instead of product_inquiry). Continuation mismatches: `cable-roll` (new instead of continue), `topic-change` (continue instead of new), `injection` (new instead of unclear). Every mismatch was in the low-confidence group in this run; this does not establish a calibrated safety threshold. Expected labels and classification rubrics were not adjusted to improve the score.

This sample is too small to justify production routing. Keep observation disabled on customer traffic until isolated n8n validation and broader Spanish evaluation, particularly short follow-ups and topic changes. No production workflow, customer data, or remote PC was involved.

## Expanded evaluation and standalone staging probe (2026-09-27)

The fixed 30-case run made exactly 30 calls, no retries. All responses were valid. Intent matched 25/30 (83.3%), continuity 27/30 (90%); 19 responses passed the confidence threshold, 11 did not. Observed p95 was 480 ms, usage 20,628 input / 3,371 output tokens; cost remains unknown. Original 14 cases again scored 12/14 intent and 11/14 continuity. The 16 added cases scored 13/16 intent and 16/16 continuity. Labels and model rubrics were fixed before this run and were not tuned against results. Full metadata is in [the evaluation report](jev-evaluation-2026-09-27.json).

**Confidence did not catch every error.** The new color-followup case, “y en rojo”, was classified as correction instead of product inquiry despite passing both confidence thresholds. A variant question does not explicitly correct a misunderstanding under the current rubric. This is a model-quality limitation, not evidence that the adapter changed routing. Keep Jev in observation only; the previous small sample's all-errors-low-confidence observation does not generalize.

Generate the [standalone staging workflow](jev-staging-workflow.json) with:

```powershell
node scripts/build_jev_staging.js
```

This export is inactive and contains only Manual Trigger → synthetic fixture → canonical Jev Code → assertion. It has no webhook, real customer/session data, credentials, database nodes, WhatsApp sends or production nodes. The fixture supplies synthetic prior attributes directly: it tests the shadow adapter boundary, not persistence of conversation memory or the full production workflow. The assertion compares every original field (including route/query/state/output), rejects mutation, and throws on missing metadata, configuration failures, HTTP errors, invalid responses and timeouts. A successful disabled probe establishes only that off mode passes through without a request.

On an isolated n8n instance, import this export without activating it. First execute with JEV_MODE=off. Then configure the approved Gateway key and JEV_MODE=shadow only in that isolated runtime and execute manually once. Confirm the final node reports observation_unchanged=true and status ok or low_confidence. Runtime environment access and axios availability must be configured for that n8n version. Each shadow execution makes at most one synthetic request. Never import this probe over the production workflow.

Local checks passed: 151 Node tests and 21 dashboard tests, source/workflow synchronization and TypeScript checking. Tests execute Code text in a Node harness; they are not an n8n runtime validation. Docker CLI is installed, but its Linux daemon was unavailable, and no n8n executable was available. No runtime was started and no full Compose stack was launched. Actual isolated n8n execution remains pending, followed by comparison with the other PC's workflow export and version before any transfer. Native review remains unavailable; no approval receipt is claimed.

Rollback for this increment: remove the standalone staging generator/export/test and evaluation report; restore corpus v1 and its report identifier if reverting the expanded evaluation. No production configuration or routing was changed.

## Completed isolated n8n runtime probe (2026-09-28)

The standalone probe ran successfully in the existing official `n8nio/n8n` image, n8n **2.23.4**, pinned by local image digest `sha256:1872cce3548bf4dcfe5aceaf3d9293f4499635823fbdea0ee726bd222d2e44b8`. This verifies that runtime only; the other PC's installed version is still unknown. No image download, full Compose stack, production workflow execution, or published port was needed.

Each disposable container imported only the inactive synthetic probe under `jev-isolated-probe` into its own ephemeral SQLite database, then ran `n8n execute --id=jev-isolated-probe --rawOutput`. The CLI's deprecated `--file` option did not execute the workflow without an ID. Runtime settings included `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, `NODE_FUNCTION_ALLOW_EXTERNAL=axios`, and disabled diagnostics, templates, and version notifications. Off-mode containers had networking disabled. The Gateway key was passed to the shadow container through the process environment by name; no bulk `.env` import or credential file was mounted.

The first shadow attempt exposed a real sandbox incompatibility before sending a request: axios 1.16.1 `CancelToken.source()` attempts to modify `Promise.then`, which the n8n task runner freezes. A no-network capability probe confirmed the exception. The adapter now supplies the minimal abort-signal interface consumed by axios' HTTP adapter, retaining the deadline, native timeout, and request cancellation without disabling sandbox protections or requiring global `AbortController`. A regression test failed before the correction and passed afterward.

After correction, off mode returned `disabled`, `request_attempted=false`, and `observation_unchanged=true`. Exactly **one actual Jev request** then completed successfully: `low_confidence`, intent `product_inquiry` (confidence 0.43), continuation `continue` (confidence 0.22), 875 ms, 699 input / 113 output tokens. The final assertion returned `observation_unchanged=true`; original route, query, state, and output survived unchanged. Cost was not estimated. This is adapter/runtime proof, not a production accuracy evaluation or full-agent integration test.

All probe containers used automatic removal; a final inventory confirmed no `jev-probe-*` containers remained. No named volumes or custom networks were created. Production and the main `.env` remained untouched. Final local validation passed **156 Node tests + 21 dashboard tests**, TypeScript checking, and both source/workflow synchronization checks. The Python-runner warning in this image did not affect the JavaScript-only probe. Native review remains unavailable.
