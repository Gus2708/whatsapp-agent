# Tasks: Attribute Integrity Guard and Water-Based Paint Normalization

- [x] 1. **Baseline & Unit Test Reproduction**
  - [x] 1.1 Add test case for `"Pintura de agua color pink Beige"` in `tests/paint_search.test.js`.
  - [x] 1.2 Add test cases in `tests/catalog-search.test.js` verifying `"pintura de agua"` expansion and color stems.
  - [x] 1.3 Add test cases verifying attribute guard: if requested color or multi-word attribute is absent, status is never `exact`.

- [x] 2. **Library Implementation (`lib/serrucho-search.js` & `lib/catalog-search.js`)**
  - [x] 2.1 Add water-based paint synonyms (`pintura de agua` -> `pintura caucho`, etc.) in `SIN` and `expandir()`.
  - [x] 2.2 Expand `COLOR_STEM`, `CANONICAL_COLORS`, and `MODIFIERS` with `pink`, `lila`, `beige`, `morado`, `dorado`, etc.
  - [x] 2.3 Verify `lib` exports and consistency.

- [x] 3. **Search Engine Implementation (`scratch_live/live_buscar.js` & `scripts/new_buscar.js`)**
  - [x] 3.1 Update `expandir`, `SIN`, `COLOR_STEM`, and `MODIFIERS` in `scratch_live/live_buscar.js`.
  - [x] 3.2 Add attribute guard and track dropped words in `largas.slice(0, 2)` fallback.
  - [x] 3.3 Add color mismatch guard before final decision assignment.
  - [x] 3.4 Sync changes verbatim to `scripts/new_buscar.js`.
  - [x] 3.5 Sync changes in `scratch_live/live_presupuesto.js` and `scripts/new_presupuesto.js` for shared functions (`expandir`, `SIN`, etc.).

- [x] 4. **Workflow Overlay & Baseline Update**
  - [x] 4.1 Update `workflows/production-baseline.json` with updated `buscar_productos_tool` and memory guard.
  - [x] 4.2 Rebuild `n8n_workflow.json` via `lib/workflow-overlay.js`.
  - [x] 4.3 Verify synchronization with `scripts/check_sources_sync.js` and `scripts/check_workflow_sync.js`.

- [x] 5. **Deployment & Live Verification**
  - [x] 5.1 Run full `npm test` test suite (unit tests, drift guards, vitest).
  - [x] 5.2 Deploy updated code to live n8n instance via `scripts/deploy_nodos.js`.
  - [x] 5.3 Test live search via `node rag.js buscar "Pintura de agua color pink Beige"` and verify exact Beige product retrieval without Aguamarina hallucination.
