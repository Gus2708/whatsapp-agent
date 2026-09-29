# Proposal: jev-dynamic-solution-extraction

## Intent

Hardware customers frequently consult El Serrucho's WhatsApp agent by describing functional problems, repairs, or household defects (*"se me despegó una baldosa"*, *"la poceta bota agua por abajo"*, *"la puerta rechina"*, *"para aislar el calor del techo"*). Maintaining hardcoded static dictionaries of problem enums in JavaScript code does not scale to the infinite diversity of customer problems across 7,600+ catalog SKUs.

This proposal implements **Dynamic Solution Slot Extraction with Jev System 1**:
1. Equip Jev System 1 with dynamic extraction of `solution_terms` (1 to 3 standard Venezuelan hardware product terms that resolve the reported problem) alongside its macro-department classification.
2. Integrate dynamic solution terms into `lib/serrucho-search.js` and `scratch_live/live_buscar.js`: when direct lexical search on a problem phrase produces 0 hits or encounters cross-department conflicts, the engine dynamically searches Supabase for in-stock catalog items matching the extracted solution terms within that department.
3. Completely decouple product resolution from hardcoded code lists, allowing El Serrucho to handle any unforeseen repair scenario while Supabase retains strict authority over real stock and pricing.

## Scope

### In Scope

- **Jev Solution Terms Extraction**: Add `solution_terms` slot extraction to `lib/jev-shadow.js` in `jevQuestions()` and `classifyShadow()`.
- **Dynamic Solution Resolver**: Implement `resolveDynamicSolutions(terms, department)` in `lib/serrucho-search.js` that sanitizes and structures extracted solution phrases for database search.
- **Search Engine Expansion**: Update `scratch_live/live_buscar.js` to trigger dynamic solution expansion when raw problem phrases yield no direct matches or get hijacked by conflicting departments.
- **Backward Compatibility & Fallback**: Retain existing high-frequency static mappings as a fast baseline/cache while giving dynamic terms open-ended execution capability.
- **Fail-Closed Boundaries**: When queries name specific products directly or confidence is below 0.80, `solution_terms` is empty (`[]`) and standard search executes untouched.
- **Zero-Regression Guarantee**: Maintain 0 false negatives on the 86 regression benchmark cases in `node rag.js regresion` and all unit test suites in `npm test`.

### Out of Scope

- Hallucinating prices or products not present in El Serrucho's Supabase database.
- Replacing Supabase or Postgres full-text / trigram / pgvector search infrastructure.
- Generative text answers in place of real catalog product cards.

## Capabilities

### New Capabilities

- `dynamic-solution-extraction`: Open-ended extraction of hardware repair product terms from arbitrary customer problem descriptions without code changes.
- `dynamic-problem-search`: Department-aligned catalog search expansion using dynamically extracted solution terms.

### Modified Capabilities

- `jev-shadow`: Enhanced to extract `solution_terms` array alongside existing `department` and `material` slots.
- `serrucho-search`: Enhanced with `resolveDynamicSolutions()` to evaluate dynamic solution terms against inventory.

## Approach

1. **Jev Classification (System 1, ~150ms)**:
   - When a customer presents a problem description, Jev identifies the macro-department and extracts 1-3 generic product terms (e.g. for *"se me despegó una baldosa"* -> `department: "construccion_aridos"`, `solution_terms: ["pega piso", "cemento blanco"]`; for *"la puerta rechina"* -> `department: "herramientas_discos"`, `solution_terms: ["aflojatodo", "grasa"]`).
2. **Search Expansion on Miss or Conflict**:
   - The search engine first attempts standard search on the customer's query.
   - If 0 matches are found, or if returned items belong to an unrelated department, the engine iterates over `solution_terms` within the target department.
3. **Inventory & Availability Priority**:
   - Matches found in Supabase are scored with department bonus and sorted by real in-stock availability.
4. **Fail-Closed Fallback**:
   - Direct product inquiries (*"cable #12"*, *"disco de corte"*) have `solution_terms: []`, ensuring zero side-effects on standard search.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/jev-shadow.js` | Medium | Add `solution_terms` extraction to questions, parsing, and shadow classifier envelope. |
| `lib/serrucho-search.js` | High | Add `resolveDynamicSolutions(terms, department)` and unit tests. |
| `scratch_live/live_buscar.js` | High | Consume dynamic `solution_terms` in search execution. |
| `scratch_live/live_presupuesto.js` | Low | Synchronize shared helper logic. |
| `tests/` | Medium | New unit tests asserting dynamic extraction, search resolution, and zero regression. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Jev extracts a term not stocked by the hardware store | Medium | Search queries Supabase; if no stock exists for that term, it gracefully tries subsequent terms or asks the customer to clarify. |
| Solution extraction triggers on direct product queries | Low | High-confidence direct product inquiries set `solution_terms: []`. |
| Regression on benchmark queries | Low | Strict verification gate on `node rag.js regresion` (86/86 required). |

## Rollback Plan

1. If dynamic extraction behaves unexpectedly, bypassing `solution_terms` evaluation in `live_buscar.js` instantly falls back to standard lexical search.
2. Clean git branch revert on `perucho` if necessary.

## Success Criteria

- Customer query *"se me despegó una baldosa"* returns in-stock floor adhesives (*Pega Piso*, *Cemento Blanco*) without any hardcoded "baldosa" enum in code.
- Customer query *"la puerta rechina"* returns in-stock lubricants (*Aflojatodo*, *Aceite 3 en 1*, *Grasa*) without hardcoded "puerta rechina" enum in code.
- Direct product inquiries (*"cemento gris"*, *"disco de corte"*) remain 100% exact without interference.
- Catalog regression suite (`node rag.js regresion`) retains 0 false negatives across all 86 cases.
- All unit and integration tests pass cleanly (`npm test`).
- `sdd check --change jev-dynamic-solution-extraction` passes with 0 errors.

## Open Questions

None. Architecture and scope are clear.

## Verification Plan

### Automated Tests

- `node --test tests/dynamic-solution-search.test.js`: Test dynamic term parsing, search expansion, and fail-closed rules.
- `node rag.js regresion`: Enforce 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 200+ unit tests across all suites.

### Manual Verification

- Probe live search with unseen problem scenarios (*"se me despegó una baldosa"*, *"la puerta rechina"*).
