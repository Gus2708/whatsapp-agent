# Exploration: jev-problem-solution-search

## Request Understanding

Customers frequently ask for hardware solutions by describing their real-world problem or intent rather than naming the technical product stocked in the ERP catalog. For example:
- *"algo para tapar una gotera"* (customer needs cemento plástico, manto asfáltico, or cinta autoadhesiva; the catalog has no products named "gotera").
- *"para pegar un tubo que bota agua"* (customer needs pega soldadura PVC or cinta teflón).
- *"para quitar el óxido de las rejas y que no se vuelvan a oxidar"* (customer needs desoxidante and fondo anticorrosivo).
- *"para sellar marcos de ventanas donde entra agua"* (customer needs silicón sellador o adhesivo sellador).
- *"para pegar repisas o espejos sin taladrar"* (customer needs adhesivo de montaje cero clavos).

Currently, lexical and full-text search fails because the customer's problem terms do not exist in catalog product titles. The goal is to design a **Problem-to-Product Intent Classification Engine** powered by Jev System 1, which identifies the functional problem in sub-150ms and maps it to target product solution families within Supabase.

## Current State

The search pipeline in `lib/serrucho-search.js` and `scratch_live/live_buscar.js` evaluates queries against product descriptions (`ilike`, tokens, trigram fuzzy, pgvector).
- Synonym expansion (`expandir()`) currently handles only 1-to-1 term synonyms (e.g. `varilla -> cabilla`, `lavaplatos -> fregadero`).
- When a customer submits a problem description:
  1. Tokenizer extracts words like `tapar`, `gotera`, `bota`, `agua`, `reja`, `oxidar`.
  2. SQL query searches `descripcion ILIKE '%tapar%'` or `ILIKE '%gotera%'`.
  3. Returns 0 results or nonsensical matches (e.g. searching "bota agua" returns safety boots *Bota PVC* or *Bota de Seguridad* instead of plumbing cement!).
  4. Post-hoc semantic rescue (`rescateSemantico`) triggers via slow LLM, which takes 2-4 seconds, costs OpenRouter tokens, and often invents generic advice rather than querying El Serrucho's exact stock.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Jev System 1 Schema (`lib/jev-shadow.js`) | `lib/jev-shadow.js: jevQuestions()` | Currently classifies `intent`, `continuation`, `department`, and `material`. Lacks a structured `problem_intent` question. |
| Search Expansion & Mapping (`lib/serrucho-search.js`) | `lib/serrucho-search.js` | Needs a deterministic problem-to-solutions resolver that maps classified problem tokens to catalog search terms and departments. |
| Runtime Search Tool (`scratch_live/live_buscar.js`) | `scratch_live/live_buscar.js` | Must consume `problem_intent` from query context to expand search targets and avoid falling back to literal matching on problem verbs. |
| Live Synchronization (`scripts/check_sources_sync.js`) | `scripts/check_sources_sync.js` | Shared resolution logic must remain strictly synchronized between `lib/serrucho-search.js` and `scratch_live/`. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/category-search.test.js` | Tests department and material search alignment | Lacks tests for problem-oriented queries (leak repair, rust treatment, pipe adhesive). |
| `tests/serrucho-search.test.js` | Unit tests for lexical functions (`expandir`, `scoreMatch`) | Lacks assertion on problem phrase expansions. |
| `rag.js regresion` | 86 baseline catalog queries | Baseline suite must remain 0 false negatives when problem mapping is introduced. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Static Regex List in `expandir()`** | Zero latency, no model calls. | Inflexible. Colloquial variations (*"se me filtra la lluvia", "tengo un bote en el fregadero"*) require hundreds of manual regexes and easily conflict with literal searches. | High | Medium |
| **Option B: Jev System 1 Problem Classifier + Solution Mapping (Recommended)** | 1) Sub-150ms classification of functional intent with calibrated rubrics. 2) Clean separation between semantic intent and database retrieval. 3) Deterministic catalog mapping with available stock prioritization. 4) Fail-closed boundary: if confidence < 0.80 or problem is none, standard product search runs untouched. | Requires adding `problem_intent` to Jev questions and solution dictionary in `serrucho-search`. | Low | Medium |
| **Option C: LLM Prompt Reranking in Agent** | High conversational flexibility. | High latency (2-4 seconds per turn), high token cost, nondeterministic JSON parsing risk. | High | High |

## Option Tradeoffs

- **Option A** is brittle and becomes unmaintainable as colloquial expressions proliferate.
- **Option C** adds unacceptable latency and cost to every WhatsApp query.
- **Option B** leverages Jev's sub-150ms System 1 classification to extract the core functional intent, allowing the local search engine to immediately execute targeted database queries for the exact matching items in stock.

## Recommendation

**Adopt Option B: Jev System 1 Problem Classifier with Solution Mapping.**
1. Define `problem_intent` in `jevQuestions()` with high-frequency hardware repair rubrics:
   - `goteras_impermeabilizacion`: leak repair, roof infiltration, joint sealing -> *cemento plastico, manto asfaltico, cinta manto, primer asfaltico, pintura impermeabilizante*.
   - `fuga_agua_plomeria`: water pipe leaks, drainage, plumbing joints -> *pega pvc, teflon, soldadura liquida*.
   - `sellado_grietas_ventanas`: window frame sealing, gaps, weatherproofing -> *silicon transparente, adhesivo sellador*.
   - `oxido_corrosion`: rust removal, metal fence protection -> *fondo anticorrosivo, desoxidante, cepillo alambre*.
   - `fijacion_sin_taladrar`: mounting mirrors, baseboards, molding without drilling -> *cero clavos, pega blanca*.
   - `preparacion_pared`: wall holes, crack repair before painting -> *pasta profesional, yeso, lija*.
   - `ninguno_o_especifico`: direct product inquiry or unclassified.
2. In `lib/serrucho-search.js`, when `problem_intent` is present and != `ninguno_o_especifico` (confidence >= 0.80), search targets are expanded to the respective solution catalog terms, constrained by department alignment.
3. If confidence is below 0.80 or `ninguno_o_especifico`, standard product search executes unchanged (fail-closed).

## Risks

- **False positive trigger on literal queries**: e.g., a customer asking for *cemento gris* should not be redirected to *cemento plástico*.
  *Mitigation*: When a specific product is explicitly named with confidence, `problem_intent` resolves to `ninguno_o_especifico`, preserving exact product retrieval.
- **Regression on catalog benchmark**:
  *Mitigation*: Must pass all 86 regression cases with 0 false negatives in `node rag.js regresion`.

## Open Questions

None. The functional problem domains match the real customer inquiries observed in WhatsApp logs.

## Ready For Planning

**Yes**. The defect is clear, the architecture is decoupled, and the solution mapping is verifiable.
