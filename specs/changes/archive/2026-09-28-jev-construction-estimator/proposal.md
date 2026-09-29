# Proposal: jev-construction-estimator

## Intent

Hardware store WhatsApp customers frequently ask how much material they need to complete specific construction or renovation tasks (*"¿Cuánto material se va para 200 bloques?"*, *"¿Qué necesito para vaciar un piso de 20 metros cuadrados?"*, *"Materiales para una cerca de 50 metros de alambre de púa"*). Currently, the search engine treats these questions as raw product searches, fails to find matching SKUs, and returns `encontrados: 0` with `[PEDIR_AYUDA]`.

This proposal implements a **Deterministic Construction Materials Estimator (`lib/construction-estimator.js`)** that:
1. Detects construction task intentions and extracts project dimensions (blocks, square meters, linear meters).
2. Calculates exact materials and quantities based on standard Venezuelan construction formulas (block masonry, concrete slabs/floors, wall plastering/friso, barbed wire fencing, and paint surface coverage).
3. Produces actionable guidance instructions for the customer and generates pre-formatted item strings ready for instant quote calculation in `hacer_presupuesto_tool`.
4. Prompts for clarification when project dimensions are missing (e.g. *"¿Qué necesitas para vaciar un piso?"* -> asks for square meters or dimensions).

## Scope

### In Scope

- **Core Estimator (`lib/construction-estimator.js`)**:
  - Implement `estimateConstructionMaterials(task, quantity, options)` covering the 5 most common hardware tasks:
    1. `pegar_bloques`: Cemento gris (1 sack / 30 blocks), arena lavada (0.15 $m^3$ / sack).
    2. `vaciar_piso_losa`: Cemento gris (0.8 sacks / $m^2$), arena lavada (0.05 $m^3$ / $m^2$), piedra picada (0.07 $m^3$ / $m^2$), malla truckson ($1 m^2$ / $m^2$).
    3. `frisar_pared`: Cemento gris (1 sack / 7 $m^2$), arena fina (0.025 $m^3$ / $m^2$).
    4. `cerca_alambre_pua`: Alambre de púa (4 lines per linear meter), grapas (1 pack / 50m).
    5. `pintar_paredes`: Pintura (1 galón / 30 $m^2$, 1 cuñete / 120 $m^2$), rodillo, brocha, tirro.
- **Task Detection (`detectConstructionTask(query)`)**:
  - Detect construction task verbs and patterns (*"pegar bloques"*, *"vaciar piso"*, *"vaciar placa"*, *"frisar"*, *"cerca de alambre"*, *"pintar casa"*).
  - Extract numeric quantities, areas ($m^2$), or lengths.
- **Search Integration (`scratch_live/live_buscar.js`)**:
  - Intercept project inquiries before the `missing` fallback.
  - Return structured task responses with user-facing guidance and pre-formatted quote item candidate strings.
- **Source Parity & Synchronization**:
  - Keep `lib/construction-estimator.js`, `scratch_live/live_buscar.js`, and `scripts/new_buscar.js` synchronized, passing `scripts/check_sources_sync.js`.
- **Zero Regression**: Pass all 86 benchmark queries in `node rag.js regresion` with 0 false negatives, and pass all existing unit tests in `npm test`.

### Out of Scope

- Inventing non-standard structural engineering designs or calculating multi-story load-bearing pillars.
- Changing catalog product pricing or stock tables.

## Capabilities

### New Capabilities

- `construction-task-estimator`: Deterministic calculation of material quantities for standard Venezuelan hardware and masonry projects.
- `project-task-detection`: Natural language extraction of construction tasks and dimensions from WhatsApp customer inquiries.

### Modified Capabilities

- `live-search-pipeline`: Enhanced to intercept construction project questions and return actionable material advice and quote strings instead of dropping to `[PEDIR_AYUDA]`.

## Approach

1. **Deterministic Engineering Formulas**:
   - Encapsulate calibrated builder ratios in `lib/construction-estimator.js`.
   - All calculations use deterministic integer or rounded quantities ($\lceil x \rceil$) with sensible hardware store units (sacos, metros cúbicos, cuñetes, rollos).
2. **Task & Metric Extraction**:
   - `detectConstructionTask(query)` tests for construction action cues combined with targets.
   - Normalizes written numbers and metric units ($m^2$, mts, metros, bloques).
   - If dimension is missing, sets `aclarar: true` with a targeted message asking for the project size.
3. **Seamless Quote Handoff**:
   - Generates an `items_presupuesto` string (e.g. *"7 sacos de cemento gris, 1 metro de arena lavada"*).
   - Can be directly fed into `hacer_presupuesto_tool` or `parseItems()`.
4. **Guarded Search Integration**:
   - Only triggers on explicit construction task patterns, strictly avoiding standard SKU searches (e.g. *"cemento gris"*, *"bloque #10"*).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/construction-estimator.js` | High | New module implementing estimation formulas and task detector. |
| `lib/serrucho-search.js` | Medium | Re-exports estimator functions for system-wide accessibility. |
| `scratch_live/live_buscar.js` | High | Integrates task detection into search pipeline before missing fallback. |
| `scripts/new_buscar.js` | High | Synchronized development copy. |
| `tests/construction-estimator.test.js` | High | Comprehensive test suite covering formulas, detection, and boundaries. |
| `scripts/check_sources_sync.js` | Low | Source sync verification. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False positive trigger on single product search | Low | Strict regex requiring action verb ("pegar", "vaciar", "frisar", "para hacer") plus target, or explicit "cuanto material se va para". |
| Measurement unit ambiguity (feet vs meters) | Low | Standardizes on metric $m^2$ and linear meters common in Venezuelan construction, with conversion for pies if provided. |
| Performance overhead | Low | Pure deterministic regex and math calculation executes in <0.2ms. |

## Rollback Plan

1. Revert changes to `scratch_live/live_buscar.js` and `scripts/new_buscar.js`.
2. Run `scripts/check_sources_sync.js` and `npm test` to verify.

## Success Criteria

- Inquiry *"cuanto material se va para pegar 200 bloques"* returns:
  - 7 sacos de cemento gris
  - 1 $m^3$ de arena lavada
- Inquiry *"qué necesito para vaciar un piso de 20 metros cuadrados"* returns:
  - 16 sacos de cemento gris
  - 1 $m^3$ de arena lavada
  - 1.5 $m^3$ de piedra picada
  - 20 $m^2$ de malla truckson
- Inquiry *"para vaciar un piso"* without dimensions returns `aclarar: true` asking for the area in $m^2$.
- Direct product searches (*"bloque 10"*, *"cemento gris"*, *"cabilla 1/2"*) are completely unaffected.
- 0 false negatives across all 86 benchmark queries in `node rag.js regresion`.
- 100% pass on all unit tests (`npm test`).

## Open Questions

None. Formulas match standard Venezuelan hardware building practices.

## Verification Plan

### Automated Tests

- `node --test tests/construction-estimator.test.js`: Assert calculation accuracy across all 5 construction tasks, edge cases, dimension extraction, and clarification prompts.
- `node scripts/check_sources_sync.js`: Enforce zero source drift across live and dev files.
- `node rag.js regresion`: Verify 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 230+ passing unit tests.

### Manual Verification

- Test construction inquiries in `rag.js buscar "cuanto material se va para 200 bloques"` and verify structured advice is returned.
