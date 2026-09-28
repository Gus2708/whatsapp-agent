# Proposal: jev-problem-solution-search

## Intent

Customers frequently consult the WhatsApp agent describing their physical problem or intent (*"algo para tapar una gotera"*, *"para pegar un tubo que bota agua"*, *"para quitar el óxido de las rejas"*, *"para sellar marcos de ventanas que filtran agua"*) rather than asking for technical ERP product titles. Because words like "gotera" or "bota agua" do not appear in catalog product titles, standard lexical searches return 0 results or inappropriate items (such as returning safety boots *Bota PVC* for "bota agua").

This proposal implements **Problem-to-Product Intent Classification with Jev System 1**:
1. Equip Jev with a `problem_intent` question that classifies customer repair/functional problems into calibrated hardware solution domains in sub-150ms.
2. Provide a deterministic `resolveProblemSolutions()` mapping in `lib/serrucho-search.js` and `scratch_live/live_buscar.js` that maps classified problem intents into target product keywords and department filters.
3. Automatically search and prioritize in-stock catalog solutions (e.g. for leak repair: *Cemento Plástico*, *Cinta Manto Adhesivo*, *Manto Asfáltico*), maintaining exact BCV pricing and stock availability without relying on slow LLM post-hoc rescues.

## Scope

### In Scope

- **Jev Problem Intent Question**: Add `problem_intent` to `jevQuestions()` in `lib/jev-shadow.js` with rubrics for:
  - `goteras_impermeabilizacion` (leak/roof waterproofing)
  - `fuga_agua_plomeria` (plumbing leak & pipe adhesive)
  - `sellado_grietas_ventanas` (window/wall joint sealing)
  - `oxido_corrosion` (rust treatment & anticorrosive coating)
  - `fijacion_sin_taladrar` (no-drill heavy mounting)
  - `preparacion_pared` (wall hole repair & plaster prep)
  - `ninguno_o_especifico` (direct product query or unclassified)
- **Problem-to-Solutions Resolver**: Deterministic mapping in `lib/serrucho-search.js` translating problem intents to target catalog search phrases and macro-departments.
- **Runtime Search Integration**: Consume `problem_intent` in `scratch_live/live_buscar.js` and prioritize matching solution candidates when high confidence (>= 0.80) is present.
- **Fail-Closed Gate**: If `problem_intent` is `ninguno_o_especifico` or confidence < 0.80, bypass problem expansion and execute standard product search untouched.
- **Catalog Benchmark Zero-Regression**: Maintain 0 false negatives on the 86 regression cases in `node rag.js regresion` and all unit test suites in `npm test`.

### Out of Scope

- Removing or replacing the existing macro-department or material search scoring.
- Generating generative AI text instead of querying Supabase products.
- Hardcoding static rules for arbitrary non-hardware requests.

## Capabilities

### New Capabilities

- `problem-to-product-classification`: Sub-150ms classification of functional repair needs into concrete hardware solution categories.
- `problem-solution-mapping`: Deterministic translation from repair intents to catalog product families and in-stock inventory candidates.

### Modified Capabilities

- `jev-shadow`: Expanded schema adding `problem_intent` to `jevQuestions()`.
- `serrucho-search`: Enhanced with `resolveProblemSolutions(problemIntent)` and problem-guided query expansion.

## Approach

1. **Jev Classification (System 1, ~150ms)**:
   - When a customer inquiry arrives, Jev evaluates intent, department, material, and `problem_intent`.
2. **Problem-to-Solution Expansion**:
   - If `problem_intent` is detected with confidence >= 0.80 (and != `ninguno_o_especifico`), `resolveProblemSolutions()` generates search phrases (e.g. for `goteras_impermeabilizacion` -> `cemento plastico`, `manto asfaltico`, `cinta manto`).
3. **Database Querying with Stock Prioritization**:
   - `live_buscar.js` queries the catalog using the solution targets, restricted by the associated department (`techos_laminas`, `plomeria_griferia`, etc.).
   - Available stock items are ranked first using El Serrucho's existing popularity and availability logic.
4. **Fail-Closed Fallback**:
   - Direct product inquiries (*"lámina de zinc"*, *"cable #12"*) classify as `ninguno_o_especifico` and proceed through normal search without interference.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/jev-shadow.js` | Medium | Add `problem_intent` question to `jevQuestions()` and validator. |
| `lib/serrucho-search.js` | High | Implement `resolveProblemSolutions()` and unit test coverage. |
| `scratch_live/live_buscar.js` | High | Incorporate problem solution targets in query execution. |
| `scratch_live/live_presupuesto.js` | Low | Synchronize shared helpers if applicable. |
| `tests/` | Medium | Add test suites asserting problem-to-product mappings and end-to-end resolution. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Literal search hijacked by problem intent | Low | Gate: only activate problem expansion when `problem_intent != 'ninguno_o_especifico'` and confidence >= 0.80. Direct product mentions retain priority. |
| Solution target missing from inventory | Low | The resolver provides multiple candidate solutions (e.g. cemento plástico OR cinta manto); Supabase filters by real stock. |
| Regression on established queries | Low | Strict verification gate: `rag.js regresion` must maintain 0 false negatives across all 86 cases. |

## Rollback Plan

1. Setting `problem_intent` confidence threshold to 1.0 or bypassing `resolveProblemSolutions()` in `live_buscar.js` completely restores previous behavior.
2. Verified cleanly via Git branch revert if needed.

## Success Criteria

- Inquiry *"algo para tapar una gotera"* returns in-stock leak repair products (*Cemento Plástico*, *Cinta Manto Adhesivo*, *Manto Asfáltico*) with 0 false positives.
- Inquiry *"para pegar un tubo que bota agua"* returns *Pega Soldadura PVC* and *Teflón*.
- Direct product inquiry *"cemento gris"* is NOT redirected to cemento plástico and returns cemento gris.
- Catalog regression suite (`node rag.js regresion`) retains 0 false negatives on all 86 cases.
- All unit and integration tests pass cleanly (`npm test`).
- `sdd check --change jev-problem-solution-search` passes with 0 errors.

## Open Questions

None.

## Verification Plan

### Automated Tests

- `node --test tests/problem-search.test.js`: Assert problem classification, solution resolution, and fail-closed behavior.
- `node rag.js regresion`: Enforce 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 100% pass across all unit test suites.
- `sdd check --change jev-problem-solution-search`: Verify SDD invariants.

### Manual Verification

- Interactive testing with probe queries:
  - `node rag.js buscar "algo para tapar una gotera"`
  - `node rag.js buscar "para pegar tubo que bota agua"`
