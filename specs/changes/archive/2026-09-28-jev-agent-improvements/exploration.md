# Exploration: jev-agent-improvements

## Request Understanding

The objective is to conduct a comprehensive architectural investigation across the entire WhatsApp Agent system (`whatsapp-agent-serrucho`) to identify:
1. Operational bottlenecks and areas where the agent's latency, accuracy, and customer experience can be significantly improved.
2. Concrete high-impact integration points where the **Jev System 1 Decision Engine** (`lib/jev-shadow.js`) can improve agent execution beyond passive shadow observation.

Constraints:
- Production safety: Maintain strict backwards compatibility, zero regression in the 86 catalog regression cases, and zero unconfirmed mutations.
- Keep inventory and sales ranking strictly in Supabase (`producto_popularidad`) and `serrucho-search.js`; use Jev strictly for dialogue classification, slot disambiguation, and fast-path intent routing.

## Current State

The current workflow architecture (`n8n_workflow.json` / `workflows/production-baseline.json`) operates in four sequential stages:
1. **Ingestion & Safety**:
   - `Webhook Trigger` receives WhatsApp events from WAHA.
   - `¿Mensaje Saliente?` / `Detectar Handoff Empleado`: disables the bot if a human employee responds from the mobile store device.
   - `Transcribir Nota de Voz`: transcribes voice notes via Groq Whisper.
   - `Debounce Ráfaga`: accumulates burst messages within 4-5 seconds.
   - `Check Chat Session` & `Rate Limited?`: protects against abuse.
2. **Context & Observation**:
   - `Prepare Conversation Context`: resolves multi-turn cable attributes, brand rejection (`excluded_brands`), and fast-path human requests (`lib/conversation-context.js`).
   - `Jev Shadow Decision`: executes passive classification (`lib/jev-shadow.js`) via TypeSafe or Vercel AI Gateway when `JEV_MODE=shadow`, adding `jev_shadow` metadata to the payload.
   - `Needs Product Clarification?`: routes `action === 'clarify'` directly to the sanitizer, bypassing the LLM.
3. **Heavy LangChain Agent**:
   - `AI Agent` with `OpenRouter Chat Model` (Gemini Flash / Claude) and window buffer memory.
   - Tools: `buscar_productos_tool`, `obtener_tasa_bcv_tool`, `buscar_memoria_engram_tool`, `guardar_memoria_engram_tool`, `hacer_presupuesto_tool`.
   - **Latency**: Every message routed to `AI Agent` takes 2,000–5,000 ms to respond, even for trivial questions (greetings, business hours, payment methods).
4. **Sanitization & Escalation**:
   - `Sanitize Agent Output`: enforces observation guards, removes internal tags, and strips `jev_shadow` before WhatsApp dispatch.
   - `Check Escalation`: intercepts `[PEDIR_AYUDA]`, flags the conversation in Supabase (`estado: manual`), and notifies the store employees' WhatsApp group.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Institutional Info & Store Q&A (`store_info`) | `workflows/production-baseline.json: AI Agent` | Simple questions ("¿a qué hora abren?", "¿dónde están ubicados?", "¿aceptan zelle?") wait 3-5s for LLM generation instead of receiving instant (<500ms) factual responses. |
| Social Greetings & Closures (`general`) | `workflows/production-baseline.json: AI Agent` | Messages like "Hola", "Buenos días", "Muchas gracias" consume full LLM context windows and tokens with unnecessary latency. |
| Multi-Product Budget / Quote Routing (`quote`) | `scratch_live/live_presupuesto.js` | When customers send lists with quantities ("presupuesto de 20m cable #12 y 4 bombillos"), the LLM often attempts fragmented single-product searches before invoking the quote tool. |
| Jev Transition: Shadow to Guarded Active Routing | `lib/jev-shadow.js` & `docs/jev-shadow-pilot.md` | Jev is currently observational only. Promoting it to an active router with confidence thresholds (>0.85) enables deterministic fast-paths without LLM overhead. |
| Catalog Disambiguation & Slot Extraction | `lib/conversation-context.js` & `scratch_live/live_buscar.js` | Queries missing critical dimensions (e.g. "tubos", "láminas") can be intercepted before reaching the database, requesting the missing measure/type immediately. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/conversation-context.test.js` | Unit tests for conversation resolution & guard | Tests cable resolution, session expiry; lacks `store_info` and `quote` fast-path assertions. |
| `tests/brand-alternatives.test.js` | Brand switching and human handoff fast-path | Covers 6 test cases for brand alternation and `human_request`; needs active Jev routing tests. |
| `tests/jev-shadow.test.js` | Jev request redaction, validation, and timeouts | Fully covers transport failure modes and contract validation; lacks routing decision integration. |
| `tests/conversation-workflow.test.js` | Integration test for n8n code nodes | Tests context resolution and sanitizer bypass; needs multi-intent router integration. |
| `rag.js regresion` | 86 real-world product queries in Supabase | Live catalog baseline; must maintain 0 false negatives. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Pure LLM Agent (Status Quo)** | High flexibility; handles arbitrary phrasing. | Slow (3-5s latency per message), high token cost, occasional tool call hesitation on quotes. | Medium (cost & customer abandonment) | None |
| **Option B: Jev-Driven Pre-Agent Fast Router (Recommended)** | Sub-500ms instant answers for `store_info` and `general`; direct dispatch to `hacer_presupuesto_tool` for `quote`; instant escalation on `human_request`. Saves ~40-60% of LLM turns. | Requires maintaining static store info templates and calibrating confidence thresholds (>0.85). | Low (falls back to LLM if confidence < 0.85) | Medium |
| **Option C: Rule-Only Regex Expansion** | Zero external API cost, ultra-fast. | Fragile against colloquial Venezuelan Spanish phrasing, typos, and voice note transcriptions. | High (regex false positives) | High |

## Recommendation

**Adopt Option B: Jev-Driven Pre-Agent Fast Router with Graceful LLM Fallback.**

Architecture of the proposed solution:
1. **Pre-Agent Intent Classifier (Jev System 1)**:
   - Evaluates the incoming turn (text or transcribed voice note) in **~450 ms**.
   - If confidence is high (`>= 0.85`):
     - `store_info`: Dispatches an instant, authoritative Serrucho store card (Horarios, Ubicación en Maracaibo, Métodos de Pago a tasa oficial BCV) without invoking the LLM. Latency drops from 3.5s to 450ms.
     - `general`: Dispatches warm Rioplatense greeting or closure instantly.
     - `quote`: Pre-formats the query as a structured item list and feeds it directly into `hacer_presupuesto_tool`, bypassing exploratory single-product search steps.
     - `human_request`: Triggers immediate `[PEDIR_AYUDA]` escalation.
   - If intent is `product_inquiry` or confidence is `< 0.85` or Jev is offline:
     - Passes through smoothly to the standard `AI Agent` (OpenRouter + LangChain tools), preserving 100% of existing behavior and catalog intelligence.

## Risks

- **False positive on store_info**: Customer asks "tienen pintura y a qué hora abren?". If classified as `store_info`, the product inquiry could be missed.
  *Mitigation*: The Jev question contract explicitly defines `product_inquiry` taking precedence over `store_info` when both are present, and multi-intent queries fall back to the LLM agent.
- **Provider API availability**: If TypeSafe/Vercel Gateway experiences an outage or rate limit (429/500).
  *Mitigation*: Fail-closed architecture already implemented in `lib/jev-shadow.js` — on any transport failure, timeout, or low confidence, the workflow seamlessly falls back to the LLM agent with zero user interruption.

## Open Questions

- Should institutional store information (horarios, ubicación, métodos de pago) be loaded from Supabase `config` or bundled in a versioned domain template?
  *Recommendation*: Load from a versioned template in `lib/` with optional Supabase override.

## Ready For Planning

**Yes**. The codebase structure, test seams, and Jev adapter are thoroughly understood. Option B provides an order-of-magnitude latency improvement for frequent non-product queries while safeguarding the core catalog search engine.
