# Design: jev-category-guided-search

## Technical Approach

Implement a Two-Tier Category-Guided Search Architecture:
1. **Tier 1 (Jev System 1 Semantic Classification)**:
   - Jev evaluates incoming product queries in ~150ms and classifies the product into one of the store's macro-departments (`techos_laminas`, `electricidad_cables`, `hierro_perfiles`, `plomeria_griferia`, `pinturas`, `herramientas_discos`, `construccion_aridos`, `fijacion_tornilleria`, `seguridad_cerraduras`, `agro_jardin`).
   - Simultaneously extracts key material constraints (`madera`, `metal`, `concreto`).
2. **Tier 2 (Category Alignment & Cross-Category Noise Suppression in Search)**:
   - In `scratch_live/live_buscar.js` and `lib/serrucho-search.js`, candidates are evaluated for departmental alignment.
   - Candidates aligning with the detected department receive a +40 alignment bonus in `scoreMatch()`.
   - Conflicting candidates from incompatible departments (e.g. `malla electrosoldada` matching "6" and "metros" when the query is for "lámina de zinc") receive a prohibitive penalty (-80 points), preventing false-positive cross-pollution.
   - Material target compatibility prevents proposing metal discs when the customer specifically asked for wood blades.
3. **Fail-Closed Fallback**:
   - If Jev confidence is below 0.80 or category is ambiguous, no department penalty is applied, ensuring open global search remains fully available.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Department Granularity in Jev | 10 Macro-Departments | 724 granular categories | Jev operates best with closed sets of 8-15 choices; evaluating 724 classes in a single prompt exceeds latency and token constraints. |
| Sub-Category Mapping | Hierarchical (Department -> Granular Nouns) | Flat lexical search | Combines Jev's high-speed semantic classification with Supabase's detailed 724-noun vocabulary taxonomy. |
| Alignment Strategy | Soft Scoring Penalty/Boost (+40 / -80) | Hard SQL WHERE filter (`AND dept = X`) | A hard SQL filter risks zero-results on cross-listed or ERP-misclassified items; soft scoring prioritizes correct items while allowing high-confidence lexical overrides. |
| Material Enforcement | Filter out conflicting explicit modifiers | Ignore material | Prevents hazardous or useless tool suggestions (e.g. metal cutting disc for wood). |

## Architecture Design

### Project Placement

```text
lib/
├── jev-shadow.js
│   └── jevQuestions()
        [modify] Adds department and material slot classification questions to Jev decision schema.
└── serrucho-search.js
    └── scoreMatch()
        [modify] Implements category alignment scoring and cross-category false-positive penalty.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Evaluates department alignment and material compatibility on candidate ranking.
tests/
└── category-search.test.js
    └── testCategorySearch()
        [new] Unit and regression tests verifying cross-category noise elimination and zero false-negatives.
```

### Data Flow

```text
Customer Query ("Que precio este tipo de sinz de 6 metros")
     │
     ▼
[Jev System 1 Classifier] ──▶ Department: "techos_laminas" (Confidence: 0.94)
     │
     ▼
[live_buscar.js / Supabase]
     │
     ├── Candidate 1: "Lamina Techo Galv 6MTS" (Matches: techos_laminas) ──▶ Score: 120 (Top 1)
     └── Candidate 2: "Malla Electrosoldada 6X6" (Conflict: hierro_mallas) ──▶ Score: -30 (Suppressed)
     │
     ▼
Clean, Authoritative Product Response
```

## Interfaces

```typescript
interface JevDepartmentClassification {
  department:
    | 'techos_laminas'
    | 'electricidad_cables'
    | 'hierro_perfiles'
    | 'plomeria_griferia'
    | 'pinturas'
    | 'herramientas_discos'
    | 'construccion_aridos'
    | 'fijacion_tornilleria'
    | 'seguridad_cerraduras'
    | 'agro_jardin'
    | 'unclear';
  department_confidence: number;
  material_target?: 'madera' | 'metal' | 'concreto' | null;
}

interface CategoryAlignmentContext {
  targetDepartment: string | null;
  targetMaterial: string | null;
}
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | Department classification in Jev schema | Assert that questions evaluate to expected macro-departments with calibrated confidence. |
| Unit Test | Material slot extraction | Assert extraction of `madera` vs `metal` for tools and discs. |
| Integration Test | `scoreMatch()` with category alignment | Assert that matching department adds +40 bonus and conflicting department receives -80 penalty. |
| Regression Test | Real failure cases (`_test_fallos_reales.js --prod`) | Assert that "sinz 6m" yields Lámina de zinc and "disco madera" yields wood disc. |
| Regression Test | Catalog baseline (`rag.js regresion`) | Assert 0 false negatives across 86 benchmark queries. |

## Migration / Rollout

1. Department alignment logic in `live_buscar.js` is backwards-compatible: if `targetDepartment` is omitted or unclassified, search behaves identically to current production.
2. Synchronize n8n code nodes via `scripts/build_conversation_sources.js` and `scripts/build_workflow.js`.
3. Rollback can be done instantly by disabling department alignment in `live_buscar.js`.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unclassified or cross-listed products | Low | Soft scoring (+40 / -80) allows strong lexical matches to surface even if department tag is slightly misaligned. |
| Misclassification of colloquial slang | Low | Fall back to open global search whenever department confidence < 0.80. |

## Open Questions

None. The two-tier department taxonomy and alignment weights are fully specified.
