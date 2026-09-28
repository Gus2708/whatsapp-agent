# Tasks: jev-department-attributes

## Review Workload Forecast

Estimated changed lines: 250-400
Estimated product files: 5-7
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: lib/serrucho-search.js, lib/jev-shadow.js, scratch_live/, scripts/, tests/department-attributes.test.js.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/jev-department-attributes` -> `perucho`
Scope: Implement deterministic department-specific attribute extraction (techos_laminas, hierro_perfiles, pinturas, plomeria_griferia), persist attributes in Jev shadow state, provide intelligent dimension disambiguation with catalog options, and synchronize live search sources.

## Slice: whole — Department Attributes & Dimension Disambiguation

### Phase 1: Attribute Extraction & Shadow State Persistence

- [x] 1.1 Implement department attribute extraction in `lib/serrucho-search.js` and extend shadow context in `lib/jev-shadow.js`.
  - [x] 1.1.a Safety Net: verify existing test suites pass. Evidence: `node --test tests/serrucho-search.test.js tests/jev-shadow.test.js` passes.
  - [x] 1.1.b RED: add test in `tests/department-attributes.test.js` asserting extraction of length/caliber for techos, dimension/thickness for hierro, presentation/class/finish for pinturas, and diameter/usage for plomeria. Evidence: test fails as extraction is not implemented.
  - [x] 1.1.c GREEN: implement `extractDepartmentAttributes(query, department)` in `lib/serrucho-search.js` and extend `productAttributes()` in `lib/jev-shadow.js`. Evidence: attribute extraction tests pass.
  - [x] 1.1.d TRIANGULATE: assert various query formulations (e.g., "lamina de 6 metros", "lamina de zinc 12 pies", "tubo 2x1 calibre 1.1", "pintura blanca galon clase b", "tubo pvc 1/2 pulgada agua fria") normalize correctly. Evidence: triangulation tests pass.
  - [x] 1.1.e REFACTOR: format and ensure clean exports. Evidence: lint and tests pass.

### Phase 2: Live Search Dimension Disambiguation & Source Synchronization

- [x] 2.1 Implement dimension disambiguation and dimensional scoring bonus in live search engine.
  - [x] 2.1.a Safety Net: verify baseline regression catalog test passes. Evidence: `node rag.js regresion` passes with 0 false negatives.
  - [x] 2.1.b RED: add integration tests in `tests/department-attributes.test.js` asserting that queries without dimensions on multi-dimension families return `aclarar: true` with in-stock catalog options, and queries with dimensions rank exact matches top. Evidence: test fails before search disambiguation logic.
  - [x] 2.1.c GREEN: update `scratch_live/live_buscar.js` to evaluate missing dimensions on dimension-sensitive families, generate tailored catalog options instructions, and award score bonuses to matching attributes. Evidence: search disambiguation tests pass.
  - [x] 2.1.d TRIANGULATE: verify non-dimensional items (martillo, pala, cemento) are unaffected and never prompt for dimensions. Evidence: boundary tests pass.
  - [x] 2.1.e REFACTOR: synchronize shared code across `lib/serrucho-search.js`, `scratch_live/live_buscar.js`, `scratch_live/live_presupuesto.js`, `scripts/new_buscar.js`, and `scripts/new_presupuesto.js`. Evidence: `node scripts/check_sources_sync.js` passes.

### Phase 3: Workflow Artifact Rebuild & Full Regression Verification

- [x] 3.1 Rebuild staging artifacts and verify zero-regression benchmarks across unit and catalog tests.
  - [x] 3.1.a Safety Net: run `npm test` to verify current green state. Evidence: all existing unit tests pass.
  - [x] 3.1.b Rebuild workflow and staging assets via `node scripts/build_jev_staging.js` and `node scripts/build_workflow.js`. Evidence: generated workflows match updated sources.
  - [x] 3.1.c Run full test suite: `node --test tests/**/*.test.js`. Evidence: all tests pass including new department attributes suite.
  - [x] 3.1.d Run catalog regression: `node rag.js regresion`. Evidence: 86 benchmark queries pass with 0 false negatives.
  - [x] 3.1.e Run SDD validation: `sdd check --change jev-department-attributes`. Evidence: change is structurally valid and ready for verification.
