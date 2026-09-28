# Exploration: jev-dynamic-solution-extraction

## Request Understanding

While `jev-problem-solution-search` introduced deterministic problem-to-product mapping for 6 common repair domains (roof leaks, plumbing leaks, window cracks, rust, no-drill mounting, wall prep), a closed enum in code cannot scale to cover the vast spectrum of hardware repair inquiries across 7,600+ catalog SKUs (e.g., *"se me despegó una baldosa"*, *"la poceta bota agua por la base"*, *"la puerta rechina"*, *"se partió el mango de la pala"*, *"para aislar el calor del techo"*).

Hardcoding an endless dictionary of repair problems in JavaScript code is an anti-pattern that creates maintenance bottlenecks and misses unforeseen colloquial phrasing.

The objective is to implement **Dynamic Solution Extraction (Open Slot Extraction)** in Jev System 1:
1. Jev dynamically extracts 1 to 3 standard Venezuelan hardware solution terms (`solution_terms` / `target_products`) and aligns them with the macro-department (`department`).
2. The search engine consumes these dynamic terms when literal search fails or gets hijacked by accidental token matches, querying Supabase for available stock within that department without needing hardcoded code dictionaries.

## Current State

In `lib/jev-shadow.js` and `scratch_live/live_buscar.js`:
- `problem_intent` is currently constrained to a fixed enum of 7 choices (`goteras_impermeabilizacion`, `fuga_agua_plomeria`, `sellado_grietas_ventanas`, `oxido_corrosion`, `fijacion_sin_taladrar`, `preparacion_pared`, `ninguno_o_especifico`).
- `PROBLEM_SOLUTIONS` in `lib/serrucho-search.js` is a static dictionary mapping only those 7 keys to product search terms.
- Inquiries outside these 7 categories receive `ninguno_o_especifico` and fall back to literal lexical/vector search on the user's raw problem description (e.g., searching for "baldosa" or "rechina"), often returning 0 results or irrelevant hits.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Jev System 1 Schema (`lib/jev-shadow.js`) | `lib/jev-shadow.js: jevQuestions()` | Needs an extraction question/slot for `solution_terms` (1-3 generic product terms) alongside `department`. |
| Search Expansion (`lib/serrucho-search.js`) | `lib/serrucho-search.js` | Needs a generalized helper `resolveDynamicSolutions(solutionTerms, department)` that validates and formats terms for search without static enums. |
| Runtime Search Tool (`scratch_live/live_buscar.js`) | `scratch_live/live_buscar.js` | Must consume dynamic `solution_terms` when lexical search on problem descriptions returns 0 results or conflicting incidental matches. |
| Live Synchronization (`scripts/check_sources_sync.js`) | `scripts/check_sources_sync.js` | Keep `scratch_live/` and `lib/` strictly synchronized. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/problem-search.test.js` | Tests the initial problem classifier and static resolver | Needs assertions on dynamic `solution_terms` extraction and open problem expansion. |
| `rag.js regresion` | 86 baseline catalog queries | Must maintain 0 false negatives. |
| `tests/category-search.test.js` | Macro-department alignment | Ensures dynamic solution terms honor department boundaries. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Expand static dictionary to 50+ problems** | Fast execution, predictable. | Ongoing maintenance burden; still incomplete; brittle to new colloquial descriptions. | High | High |
| **Option B: Dynamic Solution Slot Extraction in Jev System 1 (Recommended)** | 1) Zero code maintenance for new problem types. 2) Covers infinite repair scenarios. 3) Retains sub-150ms Jev System 1 performance. 4) Database catalog maintains final authority on stock and price. 5) Preserves static mapping as optional fallback cache. | Requires clean slot extraction and prompt instructions for Venezuelan hardware terms. | Low | Medium |
| **Option C: Post-hoc OpenRouter Reranker** | Flexible. | 2-4 second latency penalty, recurrent API cost, risk of hallucinations. | High | High |

## Recommendation

**Adopt Option B: Dynamic Solution Slot Extraction in Jev System 1.**
1. In `lib/jev-shadow.js`:
   - Enhance Jev prompt/criteria to extract `solution_terms`: an array of 1 to 3 standard generic hardware product names (e.g. `["pega piso", "cemento blanco"]` for loose tiles, `["aflojatodo", "grasa"]` for squeaky doors, `["brida poceta", "cuello cera"]` for toilet base leaks).
   - If the query is already an explicit product request (e.g., *"disco de corte"*, *"cemento gris"*), `solution_terms` is empty (`[]`).
2. In `lib/serrucho-search.js` & `scratch_live/live_buscar.js`:
   - Generalize solution expansion: if literal search fails (0 items) or yields department conflicts, test dynamic `solution_terms` prioritized by department stock.
   - Retain existing `PROBLEM_SOLUTIONS` as a zero-latency fast-path/baseline for high-frequency queries.
3. Fail-closed contract:
   - If `solution_terms` is empty or confidence < 0.80, standard product search runs untouched.

## Risks

- **Risk: Jev suggests out-of-market or nonexistent hardware items.**
  - *Mitigation*: The search engine queries Supabase's actual 7,600+ product catalog. If the suggested term does not exist or has 0 stock, the search gracefully falls back to department browsing or asks for clarification.
- **Risk: False expansion on direct queries.**
  - *Mitigation*: High-confidence product queries set `solution_terms: []`.

## Open Questions

None. Architecture and scope are clear.

## Ready For Planning

**Yes**. Decoupled, generalized, and verifiable.
