# Proposal: jev-department-attributes

## Intent

Hardware inquiries often arrive without essential dimensions, thickness, or presentation details (*"tienen láminas de zinc?"*, *"precio de tubo de herrería"*, *"tienen pintura blanca para exterior"*). Without knowing the desired dimension, standard search queries return an arbitrary grab bag of items (mixing 2.44m sheets with 6m sheets, or 0.8mm pipes with 2.0mm pipes), or produce generic, unhelpful responses.

This proposal implements **Department-Specific Attribute Extraction & Dimension Disambiguation**:
1. Implement `extractDepartmentAttributes(query, department)` in `lib/serrucho-search.js` to deterministically extract technical parameters for the 4 core multi-dimension departments:
   - `techos_laminas`: length (`longitud`: 6m, 12ft/3.66m, 10ft/3.05m, 8ft/2.44m), caliber (`calibre`: 30, 35, etc.).
   - `hierro_perfiles`: dimensions (`medida`: 2x1, 1x1, 100x100, etc.), thickness (`espesor`: 0.8mm, 1.1mm, 1.4mm, 2.0mm).
   - `pinturas`: presentation (`presentacion`: cuñete, galon, cuarto), quality class (`clase`: a, b, c), finish (`acabado`: caucho, aceite, satinada).
   - `plomeria_griferia`: diameter (`diametro`: 1/2, 3/4, 1, 2, 3, 4 pulgadas), usage (`tipo`: agua fria, caliente, aguas negras).
2. Expand `productAttributes()` in `lib/jev-shadow.js` to retain and validate these department attributes across multi-turn WhatsApp conversations.
3. Integrate dimensional disambiguation into `scratch_live/live_buscar.js`: when a customer asks about a multi-dimension product family without specifying the required dimension, generate an explicit, helpful clarification instruction listing El Serrucho's actual in-stock size options.

## Scope

### In Scope

- **Attribute Extractor**: Implement `extractDepartmentAttributes(query, department)` in `lib/serrucho-search.js`.
- **Jev Context Schema Expansion**: Expand `productAttributes()` in `lib/jev-shadow.js` to support `length`, `dimension`, `thickness`, `presentation`, `grade_class`, and `diameter`.
- **Search Engine Disambiguation & Clarification**: Update `scratch_live/live_buscar.js` to detect missing dimensions for dimension-dependent families (`laminas`, `tubos`, `pinturas`) and emit tailored `aclarar` instructions with active store inventory options.
- **Precision Ranking**: When dimensions are present, apply attribute boost (+50) to exact dimensional matches.
- **Fail-Closed Boundary**: Queries for fixed-dimension products (tools, bags of cement, locks) or general inquiries execute without dimensional prompts.
- **Zero Regression**: Pass all 86 regression queries with 0 false negatives in `node rag.js regresion` and 212+ unit tests in `npm test`.

### Out of Scope

- Inventing dimensions or prices not present in El Serrucho's Supabase database.
- Altering existing paint class A/B/C business rules.

## Capabilities

### New Capabilities

- `department-attribute-extraction`: Deterministic extraction of technical dimensions, gauges, and presentations across core hardware departments.
- `dimension-disambiguation`: Targeted bot instructions listing store-specific available dimensions when customer inquiries are dimension-deficient.

### Modified Capabilities

- `jev-shadow`: Expanded `productAttributes()` schema to persist multi-department attributes.
- `serrucho-search`: Enhanced with `extractDepartmentAttributes()` and dimension scoring.

## Approach

1. **Deterministic Extraction**:
   - `extractDepartmentAttributes(query, department)` evaluates query text against calibrated measurement regexes (e.g. `normMedida()` and `SIZEQ`).
2. **Context Persistence**:
   - Extracted attributes are stored in `conversation_context.previous_product`, allowing customers to specify *"en 6 metros"* in a follow-up turn without repeating *"lámina de zinc"*.
3. **Smart Clarification**:
   - If a customer asks for a dimension-sensitive product (e.g. *"láminas de zinc"*) without specifying length, the engine marks `aclarar: true` and produces an instruction listing the real catalog options (*"Tenemos láminas de 6 metros, 12 pies (3.66m), 10 pies (3.05m) y 8 pies (2.44m). ¿Cuál medida necesitas?"*).
4. **Exact Ranking**:
   - If the dimension is provided (*"láminas de zinc de 6 metros"*), matching products receive +50 score bonus and appear at the top.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/serrucho-search.js` | High | Implement `extractDepartmentAttributes()` and dimensional scoring. |
| `lib/jev-shadow.js` | Medium | Expand `productAttributes()` to persist attributes for all departments. |
| `scratch_live/live_buscar.js` | High | Add dimension disambiguation and tailored clarification instructions. |
| `scratch_live/live_presupuesto.js` | Low | Synchronize shared helper logic. |
| `tests/` | Medium | New unit and integration tests for department attributes. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Over-aggressive clarification on general inquiries | Low | Only trigger dimensional clarification when the query explicitly targets a known multi-dimension product family without dimensions. |
| Performance impact on search | Low | Extraction uses compiled regex patterns and executes in <1ms. |
| Regression on catalog benchmark | Low | Strict verification gate on `node rag.js regresion` (86/86 required). |

## Rollback Plan

1. If attribute extraction causes unexpected clarification triggers, disabling the dimension check in `live_buscar.js` instantly restores previous search behavior.
2. Clean git branch revert on `perucho` if necessary.

## Success Criteria

- Inquiry *"tienes láminas de zinc?"* returns a targeted clarification instruction with El Serrucho's real lengths (6m, 12 pies, 10 pies, 8 pies) without guessing.
- Inquiry *"lámina de zinc de 6 metros"* returns exclusively 6m sheets ranked first with 0 other lengths polluting the top.
- Multi-turn follow-up: *"y de 12 pies?"* correctly uses previous context to return 3.66m zinc sheets.
- Catalog regression suite (`node rag.js regresion`) retains 0 false negatives across all 86 cases.
- All unit and integration tests pass cleanly (`npm test`).
- `sdd check --change jev-department-attributes` passes with 0 errors.

## Open Questions

None.

## Verification Plan

### Automated Tests

- `node --test tests/department-attributes.test.js`: Assert attribute extraction, Jev context persistence, and clarification instructions.
- `node rag.js regresion`: Enforce 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 212+ unit tests across all suites.

### Manual Verification

- Test inquiries for zinc sheets, pipes, and paint with and without dimensions in `rag.js buscar`.
