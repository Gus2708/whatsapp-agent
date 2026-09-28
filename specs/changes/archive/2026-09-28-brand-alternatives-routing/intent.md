# Intent: brand-alternatives-routing

## Context

The WhatsApp automation agent for Ferretería El Serrucho processes hundreds of customer product inquiries daily across WhatsApp. Currently:
1. The conversation context resolver (`lib/conversation-context.js`) is narrowly restricted to electrical cables (gauges, colors, presentation), leaving all other catalog categories without multi-turn context memory.
2. When a customer rejects an offered product brand or asks for an alternative (e.g., *"de otra marca"*, *"esa marca no"*, *"tienen de otra?"*), the system does not recognize the brand rejection. It either fails to clarify or repeats the same top brand.
3. The catalog search ranking already possesses sales popularity metrics (`producto_popularidad` in Supabase) and in-stock sorting, but the conversation state does not supply excluded brands or category retention to guide secondary search passes.
4. Customer messages explicitly requesting human assistance (*"humano"*, *"asesor"*, *"persona"*) or multiple quote lists (*"presupuesto para..."*) unnecessarily transit through the heavy LLM agent (2-4s latency and token cost), instead of taking an immediate fast-path.

## Desired Outcome

Deliver an intelligent, sales-prioritized conversation context and routing layer:
- **Brand Rejection & Alternation**: When a customer rejects a brand or requests an alternative (*"otra marca"*), retain the base product/category, add the prior brand to `excluded_brands`, and re-query the catalog to present the next highest-selling available alternative from Supabase `producto_popularidad`.
- **Fast-Path Intent Routing**: Deterministically intercept human handoff requests (`human_request`) and quote inquiries (`quote`), emitting fast-path actions (`[PEDIR_AYUDA]` or quote preparation) without waiting for LLM completion.
- **Category Context Expansion**: Expand multi-turn context retention beyond cables to general product categories (paints, plumbing, tools, electrical) so customers can refine attributes (brand, color, size) across turns.
- **Strict Shadow Safety**: Maintain zero breaking changes to existing n8n workflows and pass all existing regression suites (86 catalog cases, 0 false negatives).

## Scope

### In Scope

- Enhance `lib/conversation-context.js` to track base query, resolved category, offered brand, and `excluded_brands`.
- Recognize brand rejection and switching patterns (*"otra marca"*, *"no me gusta X"*, *"en marca Y"*).
- Add fast-path detection for explicit human assistance (`human_request`) and quote intent (`quote`).
- Support `marcas_excluidas` in the search logic (`lib/serrucho-search.js` / `scratch_live/live_buscar.js`).
- Update standalone n8n generation (`scripts/build_conversation_sources.js`).
- Comprehensive unit and integration test suite (`tests/brand-alternatives.test.js` and expanded `tests/conversation-context.test.js`).
- Add synthetic evaluation cases in `tests/fixtures/jev-synthetic.json`.

### Out of Scope

- Direct fine-tuning or retraining of the external Jev foundation model (responsibility of catalog & ranking belongs to Supabase/RAG).
- Multi-store inventory routing (Serrucho operates a single unified catalog in Supabase).
- Automatic payment processing inside WhatsApp.

## Key Decisions

- **Single Responsibility Separation**: Jev and Conversation Context classify dialogue structure, intent, and conversational slots; Supabase (`producto_popularidad`) and `serrucho-search.js` manage inventory, pricing, and sales-volume ranking.
- **Deterministic First with Shadow Telemetry**: Fast-path and brand exclusion operate deterministically with zero network delay, while Jev logs shadow telemetry in parallel when `JEV_MODE=shadow` is enabled.
- **Safe Eviction on Ambiguity**: When an ambiguous reference cannot be resolved or excluded brands exhaust all available catalog items, the system gracefully clears state and requests clarification or escalates to a human instead of guessing.

## Success Criteria

- Customer queries asking for *"otra marca"* after a product presentation correctly exclude the previously shown brand and return the next highest-selling brand in stock.
- Human assistance requests (*"comunicarme con un asesor"*, *"quiero hablar con un humano"*) resolve immediately to `handoff` (`[PEDIR_AYUDA]`).
- Full catalog regression suite (`node rag.js regresion`) retains 0 false negatives across 86 benchmark cases.
- All test suites (`node --test tests/**/*.test.js`) pass cleanly with 100% green status.
- `sdd check` passes without warnings or errors.
