# Design: jev-agent-improvements

## Technical Approach

Promote Jev from a passive telemetry observation node to an active **Guarded Fast Router**:
1. Add an intent dispatch module in `lib/conversation-context.js` that checks Jev classification metadata (or lightweight regex patterns when Jev is off) with strict confidence gating (`confidence >= 0.85`).
2. Provide immediate authoritative responses for `store_info` (business hours, location, payment methods) and `general` (social greetings/closings) to achieve sub-500ms latency and 0 token cost.
3. Provide a structured handoff for `quote` directly to the `hacer_presupuesto_tool` pipeline.
4. Maintain a 100% fail-closed path: any score below 0.85, transport error, or standard product inquiry passes through to the LangChain `AI Agent` without friction.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Routing Gate Placement | Pre-agent node (`Prepare Conversation Context` & `Needs Product Clarification?`) | Post-agent classifier | Intercepting before `AI Agent` saves 2–5 seconds of LLM execution and token expense. |
| Store Info Source | Centralized domain template in `lib/store-info.js` with optional Supabase override | Hardcoded strings in prompt or database query per request | Zero DB latency on fast-path; resilient against network hiccups while maintaining single source of truth. |
| Confidence Threshold | 0.85 | 0.70 or 0.95 | 0.70 yielded false positives on compound queries in pilot evaluation; 0.85 ensures high precision while capturing obvious store info and greetings. |
| Fail-Closed Strategy | Fall through to `AI Agent` | Emit error to customer | Preserves continuity of service; customer receives a helpful response even if Jev gateway is slow or down. |

## Architecture Design

### Project Placement

```text
lib/
├── store-info.js
│   └── getStoreInfo()
        [new] Supplies authoritative business hours, location, and payment methods.
└── conversation-context.js
    └── fastRouter()
        [new] Evaluates intent and confidence, emitting instant responses or agent handoff.
scratch_live/
└── live_conversation_context.js
    └── liveConversationContext()
        [modify] Synchronizes fastRouter logic for n8n execution.
tests/
└── fast-router.test.js
    └── testFastRouter()
        [new] Unit tests asserting sub-second responses for store_info, general, and quotes.
```

### Data Flow

```text
Incoming Message (Text / Transcribed Audio)
     │
     ▼
[Prepare Conversation Context]
     │
     ▼
[Jev Classification (System 1, ~450ms)]
     │
     ├─► confidence >= 0.85 & store_info  ──► [Instant Store Card Response (<600ms)]
     ├─► confidence >= 0.85 & general     ──► [Instant Warm Greeting / Courtesy (<600ms)]
     ├─► confidence >= 0.85 & quote       ──► [Direct Handoff to hacer_presupuesto]
     ├─► human_request                     ──► [Fast-Path Handoff: [PEDIR_AYUDA]]
     │
     └─► product_inquiry OR confidence < 0.85 OR transport error
            │
            ▼
     [Normal LangChain AI Agent (OpenRouter + Supabase RAG)]
```

### Interfaces / Contracts

```typescript
interface FastRouterResult {
  action: 'reply' | 'quote' | 'handoff' | 'search' | 'pass';
  output?: string;
  query: string;
  state?: any;
}
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `fastRouter` decision logic | Assert confidence gating (0.84 falls through to pass, 0.85 executes instant reply). |
| Unit Test | `store-info` template correctness | Assert presence of official hours, Maracaibo address, and BCV official rate disclaimer. |
| Integration Test | End-to-end routing in n8n code node harness | Assert `live_conversation_context.js` emits correct actions without network exceptions. |
| Regression Test | Catalog search baseline (`node rag.js regresion`) | Assert 0 false negatives across 86 live queries. |

## Migration / Rollout

1. Keep `JEV_MODE=off` as default in `.env.example`.
2. When activating `JEV_MODE=shadow`, the router operates in observation-only mode by default until `JEV_ROUTING_ENABLED=true` is set.
3. Rollback requires only toggling `JEV_ROUTING_ENABLED=false` or `JEV_MODE=off`.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Customer asks compound query (hours + product) | Low | Jev rubric prioritizes `product_inquiry`; multi-topic detection falls back to the full `AI Agent`. |
| BCV currency volatility | Low | Store info template explicitly states that all prices in Bolívares are computed dynamically at the official BCV rate of the day. |

## Open Questions

None. Architecture and fail-closed seams are fully evidenced.
