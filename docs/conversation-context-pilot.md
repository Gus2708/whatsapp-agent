# Conversation context pilot

This local increment adds typed product-search decisions and an experimental cable request context. Its rules do not depend on Jev or add a database schema. The subsequent optional [Jev observation pilot](jev-shadow-pilot.md) adds a separate, default-off node. Nothing has been deployed to the other PC.

## Implemented behavior

- Every `buscar_productos` result adds `decision_version`, `action`, `match_status`, and `requires_confirmation`; legacy fields remain available.
- The AI Agent returns intermediate tool steps internally. The sanitizer only inspects `buscar_productos` observations, validates the contract, and removes all intermediate steps before dispatch. Approximate matches produce a confirmation question with product names and no prices; missing/weak matches use the existing help route. Explicit human escalation retains precedence.
- Repeated searches for the same query use the last result. Unresolved other searches still constrain the response. Unknown/malformed search contracts and missing intermediate-step arrays ask for clarification. Tool-free greetings and store-hours replies preserve existing behavior with an empty array. Agent errors still use existing error recovery. This guard controls the outgoing message; it cannot undo tool side effects already performed inside an agent turn.
- `CONVERSATION_STATE_ENABLED=false` is the default. When enabled, a Code node stores only cable attributes, isolated by WAHA session and chat ID, for 30 minutes, with at most 200 entries. Records describe a request, never a confirmed product or order.
- Supported seed syntax is deliberately narrow: `cable [thwn|thhn] [#caliber] [azul|rojo|negro|blanco|verde|amarillo] [por metro|por rollo]`. For example, `cable thwn #12 azul por metro` → `y el #8` → `pero por rollo`. Only explicit `#8`/`calibre 8` can replace a caliber; a bare `8` might be quantity and asks for clarification.
- Missing, expired or invalid state asks for clarification on recognized short references. The IF branch bypasses the AI Agent and its tools entirely on this path. Other topics, corrections, quantities, quotes, multiple products and unsupported wording clear state and use the existing agent. Colors are retained from an explicit seed but short color corrections ask for clarification.

## Staging and deployment boundary

n8n documents workflow static data as experimental, unavailable in manual tests, and potentially unreliable under frequent executions. This pilot is for isolated single-instance staging, not durable memory or queue/multiple-worker production. Saving depends on successful production-mode executions; restart retention is not assumed. No cross-execution concurrency guarantee is provided. See [n8n static-data documentation](https://docs.n8n.io/code/cookbook/builtin/get-workflow-static-data/) and [Tools Agent intermediate steps](https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.agent/tools-agent/).

Before deployment, compare the active export and installed n8n version on the other PC. Import the complete generated workflow into an isolated staging environment: `scripts/deploy_nodos.js` only updates three legacy nodes and cannot install this integration. Do not use it to deploy this work unit. The export uses Agent typeVersion 3.1; that does not establish the installed runtime build or its trace behavior. Current upstream [V3 runAgent](https://github.com/n8n-io/n8n/blob/master/packages/@n8n/nodes-langchain/nodes/agents/Agent/agents/ToolsAgent/V3/helpers/runAgent.ts) returns the steps array whenever `returnIntermediateSteps` is enabled. Verify this contract (including an empty array for greetings), both clarification branches, session isolation and expiry against the installed version. An absent trace cannot prove no search occurred and therefore fails to clarification. Keep all staging WhatsApp sends, reservations, help requests and learning writes disconnected or mocked. Offline tests prove JavaScript behavior and wiring, not compatibility with the remote installation.

The typed search guard applies independently of the experimental state flag. To disable only state inference, leave the flag false. To roll back the entire unit, restore the previous workflow export (search, sanitizer, AI options/text and original `Cliente Memoria` → `AI Agent` connection); remove the two pilot nodes. Preserve the deployment snapshot and credentials outside this repository. Cached attributes become unusable after 30 minutes and are pruned on a later enabled execution; disabling the flag does not physically delete existing static data.

## Local verification and regeneration

1. `node scripts/build_workflow.js` regenerates embedded domain functions, the search development copy and workflow JSON.
2. `node --test tests/conversation-context.test.js tests/conversation-workflow.test.js` exercises follow-up replacement, ambiguity, session isolation, expiry, default-off behavior, real search returns, output enforcement and workflow routing with no network.
3. `npm test` checks the full offline suite and source/workflow synchronization.

Domain functions live in `lib/conversation-context.js`; their marked copies are generated, not independently maintained. Do not deploy only one generated copy. This work unit intentionally leaves general-product state, persistent storage, context modularization and real-conversation model evaluation for later increments.
