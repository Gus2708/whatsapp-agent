# Design: jev-department-attributes

## Technical Approach

Implement Department-Specific Attribute Extraction & Dimension Disambiguation:
1. **Deterministic Attribute Extractor in `lib/serrucho-search.js`**:
   - Implement `extractDepartmentAttributes(query, department)`:
     - `techos_laminas`: extracts `length` (normalized to '6m', '3.66m', '3.05m', '2.44m'), `caliber` ('30', '35', etc.).
     - `hierro_perfiles`: extracts `dimension` ('2x1', '1x1', etc.), `thickness` ('0.8mm', '1.1mm', '1.4mm', '2.0mm').
     - `pinturas`: extracts `presentation` ('cuñete', 'galon', 'cuarto'), `grade_class` ('a', 'b', 'c'), `finish` ('caucho', 'aceite', 'satinada'), `color`.
     - `plomeria_griferia`: extracts `diameter` ('1/2', '3/4', '1', '2', etc.), `usage` ('agua fria', 'aguas negras', etc.).
2. **Jev Conversation Context Schema Extension**:
   - In `lib/jev-shadow.js`, update `productAttributes()` to accept and persist these extracted attributes (`length`, `dimension`, `thickness`, `presentation`, `grade_class`, `diameter`, `finish`, `usage`), enabling seamless multi-turn attribute refinement.
3. **Targeted Dimension Disambiguation in `live_buscar.js`**:
   - When a customer inquiry targets a dimension-sensitive family (e.g. *"láminas de zinc"*, *"tubo de herrería"*) without providing dimensions:
     - Mark `aclarar: true`.
     - Generate a tailored instruction detailing El Serrucho's active catalog dimensions for that family.
   - When dimensions are present, add +50 score bonus to exact dimensional matches.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Extraction Engine | Deterministic regex & tokenizer in `serrucho-search.js` | LLM prompt extraction | Sub-millisecond execution, zero token cost, zero hallucination of nonexistent measurements. |
| In-Stock Size Enumeration | List actual inventory options in clarification | Generic "por favor especifique medida" | Hardware customers in Venezuela often don't know the exact standard lengths stocked (e.g. 6m vs 12 pies); offering concrete options drives immediate decisions. |
| Scope of Clarification | Restricted to multi-dimension product families | All hardware items | Non-dimensional products (hammers, shovels, cement sacks) should never be delayed by clarification prompts. |
| State Persistence | Store in `previous_product` context | Ephemeral per-turn | Allows follow-up turns (*"y de 6 metros?"*) to inherit the base product without repeating the entire inquiry. |

## Architecture Design

### Project Placement

```text
lib/
├── jev-shadow.js
│   └── productAttributes()
        [modify] Adds multi-department attribute schemas and validation.
└── serrucho-search.js
    └── extractDepartmentAttributes()
        [new] Extracts technical dimensions, calibers, and presentations by department.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Evaluates missing dimensions and generates targeted clarification instructions.
tests/
└── department-attributes.test.js
    └── testDepartmentAttributes()
        [new] Unit and integration tests for department attribute extraction and disambiguation.
```

### Data Flow

```text
Customer Query: "Tienes láminas de zinc?"
      │
      ▼
[Jev Classifier] ────────▶ department: "techos_laminas" (0.95)
      │
      ▼
[extractDepartmentAttributes] ──▶ length: null, caliber: null (missing required length!)
      │
      ▼
[live_buscar Evaluation] ───────▶ Dimension-sensitive family detected with missing length
      │
      ▼
Response to Bot:
{
  aclarar: true,
  instruccion: "Tenemos láminas de zinc de 6 metros, 12 pies (3.66m), 10 pies (3.05m) y 8 pies (2.44m). Pregúntale al cliente qué largo necesita."
}
```

## Interfaces

```typescript
interface DepartmentAttributes {
  length?: string;
  dimension?: string;
  thickness?: string;
  diameter?: string;
  presentation?: string;
  grade_class?: string;
  finish?: string;
  color?: string;
  usage?: string;
}

function extractDepartmentAttributes(
  query: string,
  department: string | undefined
): DepartmentAttributes;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `extractDepartmentAttributes()` across 4 departments | Assert extraction of length, profile dimensions, paint class/presentation, and pipe diameter. |
| Unit Test | `productAttributes()` schema validation | Assert persistence of multi-department attributes in Jev shadow state. |
| Integration Test | Live search disambiguation | Assert that "tienen laminas de zinc?" returns `aclarar: true` with active length options. |
| Integration Test | Exact dimension search | Assert that "lamina de zinc de 6 metros" returns 6m sheets ranked top without clarification. |
| Regression Test | Catalog baseline (`rag.js regresion`) | Assert 0 false negatives across all 86 benchmark queries. |

## Migration / Rollout

1. Backwards-compatible: existing cable attributes remain untouched; new department attributes are additive.
2. Synchronize sources via `scripts/check_sources_sync.js` and rebuild workflow artifacts.
3. Rollback can be executed immediately via Git revert if needed.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unnecessary clarification on specific SKUs | Low | Only trigger when the query targets a multi-dimension family without explicit numbers or dimensions. |
| Measurement unit ambiguity (e.g. 12 pies vs 12mm) | Low | Contextual unit parsing via `SIZEQ` and department constraints. |

## Open Questions

None. The dimensional options match the actual catalog SKUs.
