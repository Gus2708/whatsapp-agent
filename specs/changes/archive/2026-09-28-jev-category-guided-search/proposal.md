# Proposal: jev-category-guided-search

## Intent

Empirical audit of production escalations (`scripts/_test_fallos_reales.js --prod`) demonstrates that the catalog search engine in `buscar_productos` suffers from cross-department false positives on messy customer queries (e.g. searching *"sinz de 6 metros"* returns *Malla Electrosoldada 6X6*, and searching *"disco de corte de madera"* returns *Disco para metal*). This occurs because the lexical search matches incidental numbers or tokens globally across all 7,843 products without departmental bounding, and the existing semantic rescue only activates if zero candidates are found.

This proposal implements **Two-Tier Category-Guided Search with Jev**:
1. Equip Jev System 1 with macro-department classification (`techos_laminas`, `electricidad_cables`, `hierro_perfiles`, `plomeria_griferia`, `pinturas`, `herramientas_discos`, `construccion_aridos`, `fijacion_tornilleria`, `seguridad_cerraduras`, `agro_jardin`) and material slot extraction (`madera`, `metal`, `concreto`).
2. Integrate Category Alignment Scoring in `scratch_live/live_buscar.js` and `lib/serrucho-search.js` to heavily prioritize candidates matching the query's department and penalize cross-category noise.
3. Bridge macro-departments with the dynamic 724 granular categories from `catalogo_vocab_categorias` to ensure broad catalog coverage without brittle manual regex rules.

## Scope

### In Scope

- **Jev Department Classification Question**: Add `department` choice question to `jevQuestions()` in `lib/jev-shadow.js` mapping customer inquiries to store macro-families.
- **Material Slot Extraction**: Identify intended material constraints (e.g. `madera` vs `metal` for cutting discs, `agua negra` vs `agua blanca` for plumbing pipes).
- **Category Alignment Scoring in Search**: Update `scoreMatch()` and candidate filtering in `scratch_live/live_buscar.js` to check departmental alignment between query and candidate descriptions.
- **Cross-Category False Positive Guard**: Suppress false positive candidates when their primary noun conflicts with the query intent (e.g. query = "lámina", top candidate = "malla").
- **Zero-Regression Verification**: Enforce that all 86 established catalog queries in `rag.js regresion` continue to pass with 0 false negatives, while resolving the false positive failures in `_test_fallos_reales.js`.

### Out of Scope

- Removing or replacing the Supabase `producto_popularidad` sales score or inventory tables.
- Running full pgvector embeddings on every turn (avoiding the 2.8s latency penalty of OpenRouter embeddings).
- Hardcoding static rules for all 7,843 individual products.

## Capabilities

### New Capabilities

- `category-guided-search`: Department-aware candidate ranking and cross-category false-positive suppression in catalog search.
- `material-slot-extraction`: Disambiguation of material-specific tools and supplies (wood vs metal discs, pressure vs drainage pipes).

### Modified Capabilities

- `jev-shadow`: Expanded schema with `department` question returning calibrated probabilities over store departments.
- `fast-router`: Passes detected department and material slots into conversation search context.

## Approach

1. **Jev System 1 Classification (~150ms)**:
   - When evaluating product queries, Jev predicts the department (`department`) alongside existing intent.
2. **Category-Aware Candidate Evaluation in `live_buscar.js`**:
   - The search extracts the query's head noun and department.
   - If candidates are found across disparate categories, candidates aligning with the query's department receive an alignment boost (+40 points).
   - Conflicting candidates (e.g. `malla` when department is `techos_laminas`) receive a prohibitive penalty, preventing false positives from masquerading as valid matches.
3. **Graceful Fallback**:
   - If Jev department confidence is below 0.80 or department is unassigned, standard open search applies without penalty, ensuring rare or idiosyncratic items are never blocked.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/jev-shadow.js` | Medium | Add `department` question and validator schema. |
| `scratch_live/live_buscar.js` | High | Incorporate category alignment scoring and false-positive suppression. |
| `lib/serrucho-search.js` | High | Mirror category alignment scoring in domain library for unit testing. |
| `scripts/_test_fallos_reales.js` | Medium | Verify that previously failing escalations are resolved. |
| `tests/` | Medium | Add unit and integration tests for department classification and alignment. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Misclassification of multi-use items (e.g. "cinta") | Low | Confidence gate: if department confidence < 0.80, bypass category filter and search globally. |
| Over-filtering on unclassified products | Low | Soft alignment scoring (+40 boost for match, penalty for conflict) ensures unclassified items can still be retrieved if query has high lexical match. |
| Latency impact on fast-path | Low | Jev classification runs concurrently or in < 150ms before database search, remaining well within real-time budget. |

## Rollback Plan

1. The category alignment weight can be toggled via setting or disabled by omitting `p_categoria` in `live_buscar.js`.
2. Any changes to `live_buscar.js` can be verified instantly with `node rag.js regresion` and `npm test` before committing.
3. Git branch can be reverted cleanly without impacting database state.

## Success Criteria

- Zinc roofing query ("sinz de 6 metros") retrieves Lámina de Zinc, eliminating the false-positive Malla Electrosoldada match.
- Cutting disc query ("disco de corte de madera") prioritizes wood cutting discs over metal cutting discs.
- Catalog regression suite (`node rag.js regresion`) maintains 100% compliance with 0 false negatives across 86 benchmark cases.
- All unit and integration tests pass cleanly (`npm test`).
- `sdd check --change jev-category-guided-search` returns zero errors.

## Open Questions

None. The two-tier department taxonomy and category alignment scoring have been established during technical exploration.

## Verification Plan

### Automated Tests

- `node rag.js regresion`: Enforce 86/86 queries pass with 0 false negatives.
- `node scripts/_test_fallos_reales.js --prod`: Verify resolution of zinc/malla and disco madera/metal failure cases.
- `npm test`: Enforce 100% green across all existing unit test suites.
- `sdd check --change jev-category-guided-search`: Verify SDD integrity.

### Manual Verification

- Interactive testing with `node rag.js buscar "Que precio este tipo de sinz de 6 metros"` confirming it returns Lámina de Zinc instead of Malla Electrosoldada.
