# Design: jev-problem-solution-search

## Technical Approach

Implement a Problem-to-Product Intent Architecture with Jev System 1:
1. **Jev Problem Intent Question**:
   - Add a high-speed multiple-choice question `problem_intent` to `jevQuestions()` in `lib/jev-shadow.js`.
   - Criteria cover the 6 most common physical repair problems seen in customer WhatsApp messages:
     - `goteras_impermeabilizacion` (roof leaks, infiltration, water dripping)
     - `fuga_agua_plomeria` (pipe breaks, dripping plumbing, water leakage)
     - `sellado_grietas_ventanas` (gap sealing, window frame water entry)
     - `oxido_corrosion` (rust removal, anticorrosive protection)
     - `fijacion_sin_taladrar` (heavy mounting without screws, no-drill adhesives)
     - `preparacion_pared` (wall hole repair, plaster patching before painting)
     - `ninguno_o_especifico` (direct product query or unclassified)
2. **Deterministic Solution Resolver (`resolveProblemSolutions`)**:
   - In `lib/serrucho-search.js`, implement `resolveProblemSolutions(problemIntent)` returning an array of target search terms and target department:
     - `goteras_impermeabilizacion` -> terms: `['cemento plastico', 'manto asfaltico', 'cinta manto', 'primer asfaltico', 'pintura impermeabilizante']`, department: `techos_laminas`.
     - `fuga_agua_plomeria` -> terms: `['pega pvc', 'teflon', 'soldadura liquida']`, department: `plomeria_griferia`.
     - `sellado_grietas_ventanas` -> terms: `['silicon transparente', 'adhesivo sellador', 'silicon gris']`, department: `fijacion_tornilleria`.
     - `oxido_corrosion` -> terms: `['fondo anticorrosivo', 'desoxidante', 'cepillo alambre']`, department: `pinturas`.
     - `fijacion_sin_taladrar` -> terms: `['cero clavos', 'pega blanca', 'adhesivo de montaje']`, department: `fijacion_tornilleria`.
     - `preparacion_pared` -> terms: `['pasta profesional', 'yeso', 'cemento blanco', 'lija']`, department: `pinturas`.
3. **Runtime Candidate Search & Ranking in `live_buscar.js`**:
   - When `problem_intent` is present and confidence >= 0.80 (and != `ninguno_o_especifico`):
     - If the original literal query yields 0 results or low relevance, query each target solution in Supabase.
     - Rank available items with active stock first, calculating exact USD and BCV prices.
     - Return the matched catalog solutions to the agent.
4. **Fail-Closed Boundary**:
   - If `problem_intent` is `ninguno_o_especifico` or confidence < 0.80, bypass problem expansion completely and execute regular search.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Classification Mechanism | Jev System 1 (sub-150ms structured decision) | LLM prompt rewriting in agent | LLM prompt rewriting adds 2-4 seconds of latency and token cost; Jev runs in ~100ms with fixed deterministic choices. |
| Solution Mapping Layer | Deterministic domain dictionary in `serrucho-search.js` | Free-form semantic embeddings | Embeddings often hallucinate products El Serrucho does not sell. A deterministic dictionary maps only to actual product lines carried in stock. |
| Activation Condition | Confidence >= 0.80 and problem != `ninguno_o_especifico` | Activate on all queries | Prevents false triggers when customer is already asking for a specific catalog product. |
| Inventory Ranking | Prioritize in-stock items with BCV price | Return all matched categories | The customer needs immediate solutions they can purchase right now at the store. |

## Architecture Design

### Project Placement

```text
lib/
├── jev-shadow.js
│   └── jevQuestions()
        [modify] Adds problem_intent question with 7 calibrated choices.
└── serrucho-search.js
    └── resolveProblemSolutions()
        [new] Deterministic mapping from problem_intent to catalog search phrases.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Expands query to problem solutions when problem_intent is active.
tests/
└── problem-search.test.js
    └── testProblemSearch()
        [new] Unit and integration tests for problem classification, resolution, and fail-closed behavior.
```

### Data Flow

```text
Customer Query: "Buenas tardes, algo para tapar una gotera en el techo"
      │
      ▼
[Jev System 1 Classifier] ──▶ problem_intent: "goteras_impermeabilizacion" (0.95)
      │                       department: "techos_laminas" (0.92)
      ▼
[resolveProblemSolutions] ──▶ Solutions: ["cemento plastico", "manto asfaltico", "cinta manto"]
      │
      ▼
[Supabase Inventory Search]
      │
      ├── Cemento Plastico Covo 1 GAL (Stock: 12, $14.50 / Bs. 638)
      ├── Cinta Manto Adhesivo 10MT (Stock: 5, $8.20 / Bs. 360)
      └── Manto Asfaltico 3MM Covo (Stock: 8, $24.00 / Bs. 1,056)
      │
      ▼
Clean, In-Stock Solution Response to Customer
```

## Interfaces

```typescript
type ProblemIntent =
  | 'goteras_impermeabilizacion'
  | 'fuga_agua_plomeria'
  | 'sellado_grietas_ventanas'
  | 'oxido_corrosion'
  | 'fijacion_sin_taladrar'
  | 'preparacion_pared'
  | 'ninguno_o_especifico';

interface ProblemSolutionTarget {
  intent: ProblemIntent;
  department: string;
  searchTerms: string[];
}

function resolveProblemSolutions(intent: ProblemIntent): ProblemSolutionTarget | null;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `jevQuestions()` contains `problem_intent` | Assert question definition, criteria count, and valid choice schemas. |
| Unit Test | `resolveProblemSolutions()` mapping | Assert that each problem intent returns expected search terms and department. |
| Unit Test | Fail-closed on direct product queries | Assert that `ninguno_o_especifico` returns `null` (no expansion). |
| Integration Test | Solution search in `lib/serrucho-search.js` | Assert that "algo para gotera" returns cemento plástico / manto asfáltico. |
| Regression Test | Catalog baseline (`rag.js regresion`) | Assert 0 false negatives across all 86 benchmark queries. |

## Migration / Rollout

1. Problem-to-solution expansion is fully backwards-compatible: if `problem_intent` is missing or `ninguno_o_especifico`, standard catalog search executes.
2. Synchronize sources via `scripts/build_conversation_sources.js`, `scripts/build_jev_sources.js`, and `scripts/build_workflow.js`.
3. Rollback can be executed immediately by reverting `lib/serrucho-search.js`.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False positive mapping on specific product | Low | Gate: only activate when `problem_intent != 'ninguno_o_especifico'` and confidence >= 0.80. |
| Out of stock solution items | Low | Multiple solution candidates are evaluated and filtered against real-time Supabase stock. |

## Open Questions

None. The functional problem domains and catalog targets are fully specified.
