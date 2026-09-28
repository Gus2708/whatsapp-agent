# Design: jev-dynamic-solution-extraction

## Technical Approach

Implement Dynamic Solution Slot Extraction with Jev System 1:
1. **Dynamic Solution Terms Extraction in Jev System 1**:
   - In `lib/jev-shadow.js`, extend `jevQuestions()` and `classifyShadow()` to extract `solution_terms`: an array of 1 to 3 standard generic Venezuelan hardware product names (e.g., `["pega piso", "cemento blanco"]` for loose tiles; `["aflojatodo", "grasa"]` for squeaky hinges; `["cuello cera", "brida poceta"]` for toilet leaks).
   - If the customer query is already a direct product request (e.g., *"disco de corte 4 1/2"*, *"cable #12"*), `solution_terms` returns an empty array `[]`.
2. **Dynamic Solution Resolver in `lib/serrucho-search.js`**:
   - Implement `resolveDynamicSolutions(solutionTerms, department)` which cleans, normalizes, and filters extracted solution terms against macro-departments.
   - Retain existing `PROBLEM_SOLUTIONS` dictionary as a zero-latency fast-path/baseline for high-frequency queries.
3. **Runtime Candidate Search & Ranking in `live_buscar.js`**:
   - When the customer query describes a problem and lexical search yields 0 items (or yields incidental matches from a conflicting department), the search engine queries Supabase for products matching `solution_terms` within the classified `department`.
   - Results are filtered, boosted with department bonus (+40), and sorted by real in-stock availability.
4. **Fail-Closed Boundary**:
   - When `solution_terms` is empty (`[]`) or confidence < 0.80, dynamic solution expansion is bypassed completely, executing standard catalog search untouched.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Open Slot Extraction | Jev dynamic `solution_terms` array | Static enum in code | Real customers ask about thousands of unpredictable household repair scenarios; a static enum in code cannot scale without continuous manual code edits. |
| In-Stock Supabase Authority | Search dynamic terms in Supabase catalog | Trust LLM product descriptions | Jev suggests generic solution categories; Supabase enforces real ERP inventory, exact SKU codes, real stock numbers, and official BCV pricing. |
| Search Trigger Condition | Trigger on 0 results or cross-department conflict | Replace all customer queries | Direct product inquiries must not be rewritten; expansion only rescues problem descriptions that would otherwise fail or hit irrelevant items. |
| Department Constrained Expansion | Constrain dynamic terms to detected macro-department | Unconstrained global search | Prevents terms like "cemento" from pulling grey building cement when repairing a delicate tile (where "cemento blanco" is needed under `construccion_aridos`). |

## Architecture Design

### Project Placement

```text
lib/
├── jev-shadow.js
│   └── jevQuestions()
        [modify] Adds solution_terms extraction alongside department and material slots.
└── serrucho-search.js
    └── resolveDynamicSolutions()
        [new] Sanitizes and structures dynamic solution terms for catalog search.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Evaluates dynamic solution_terms on search miss or cross-department conflict.
tests/
└── dynamic-solution-search.test.js
    └── testDynamicSolutionSearch()
        [new] Unit and integration tests for dynamic solution extraction and search expansion.
```

### Data Flow

```text
Customer Query: "Se me despegó una baldosa del piso"
      │
      ▼
[Jev System 1 Classifier] ──▶ department: "construccion_aridos" (0.94)
      │                       solution_terms: ["pega piso", "cemento blanco"] (0.90)
      ▼
[Initial Lexical Search]  ──▶ "despego baldosa" -> 0 items found in catalog
      │
      ▼ (Trigger Dynamic Expansion)
[resolveDynamicSolutions] ──▶ Evaluates ["pega piso", "cemento blanco"] under "construccion_aridos"
      │
      ▼
[Supabase Inventory Search]
      │
      ├── Pega Piso Gris 14KG Megaflex (Stock: 45, $6.50 / Bs. 286)
      └── Cemento Blanco 1KG Catatumbo (Stock: 18, $2.10 / Bs. 92.40)
      │
      ▼
Accurate In-Stock Product Cards Returned to Customer
```

## Interfaces

```typescript
interface JevAlignmentEnvelope {
  department: string;
  department_confidence: number;
  material: string;
  material_confidence: number;
  problem_intent: string;
  problem_intent_confidence: number;
  solution_terms: string[];
  solution_terms_confidence: number;
}

interface DynamicSolutionTarget {
  department: string;
  searchTerms: string[];
}

function resolveDynamicSolutions(
  solutionTerms: string[] | undefined,
  department: string | undefined
): DynamicSolutionTarget | null;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `jevQuestions()` and `classifyShadow()` | Assert extraction and validation of `solution_terms` array in Jev System 1. |
| Unit Test | `resolveDynamicSolutions()` | Assert normalization, empty array handling, and department filtering. |
| Unit Test | Fail-closed boundary | Assert that empty `solution_terms` or low confidence returns `null` (no expansion). |
| Integration Test | Live search expansion | Assert that unseen problem query ("se me despegó una baldosa") resolves to in-stock *Pega Piso*. |
| Regression Test | Catalog baseline (`rag.js regresion`) | Assert 0 false negatives across all 86 benchmark queries. |

## Migration / Rollout

1. Dynamic solution expansion is completely backwards-compatible: queries without `solution_terms` proceed via standard catalog search or static fallback.
2. Synchronize sources via `scripts/check_sources_sync.js` and rebuild workflow artifacts.
3. Clean rollback via Git revert if necessary.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Jev extracts a term not stocked in inventory | Medium | Supabase queries check actual stock; if no items exist, the engine falls back gracefully. |
| Solution expansion triggers on specific products | Low | Direct product inquiries return empty `solution_terms: []`. |
| Cross-department pollution | Low | Dynamic solutions are strictly evaluated within the classified `department`. |

## Open Questions

None. The dynamic slot extraction and search expansion architecture are fully specified.
