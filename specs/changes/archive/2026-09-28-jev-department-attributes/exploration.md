# Exploration: jev-department-attributes

## Request Understanding

Customers frequently inquire about core hardware categories without specifying the critical technical dimensions or presentations required to select a specific SKU from El Serrucho's 7,600+ catalog. For example:
- *"Tienes láminas de zinc?"* (Missing length: 6m, 12 pies / 3.66m, 10 pies / 3.05m, 8 pies / 2.44m).
- *"Precio de tubo de herrería"* (Missing dimensions: 2x1, 1x1, 100x100, and thickness/caliber: 0.8mm, 1.1mm, 1.4mm).
- *"Pintura blanca para exterior"* (Missing presentation: cuñete, galón, 1/4; and quality class: A, B, C).
- *"Tubos de agua"* (Missing diameter: 1/2", 3/4", 1", 2", 3", 4"; and type: agua fría, caliente, aguas negras).

Currently, `productAttributes()` in `lib/jev-shadow.js` only tracks cable attributes (`variant`, `gauge`, `color`, `presentation`). All other 9 macro-departments lack generalized attribute extraction, forcing the search engine either to dump random mixed dimensions or trigger vague, unhelpful clarification prompts.

The objective is to implement **Department-Specific Attribute Extraction & Dimension Disambiguation**:
1. Generalized attribute extraction covering dimensions (lengths, calibers, diameters, profiles), presentations (cuñete, galón, saco, rollo), and classes (Clase A/B/C, Schedule 40).
2. Clean integration into `lib/serrucho-search.js` and `scratch_live/live_buscar.js`: when a department-level query lacks required dimensional parameters, generate targeted, actionable clarification instructions with actual inventory options instead of guessing or failing.

## Current State

In `lib/jev-shadow.js`:
- `productAttributes(value)` only extracts:
  ```javascript
  const allowed = { variant: /^(thwn|thhn)$/, gauge: /^\d{1,2}$/, color: /^(azul|rojo|negro|blanco|verde|amarillo)$/, presentation: /^(metro|rollo)$/ };
  ```
- If a customer queries *"láminas de zinc"*, no length attribute is captured or tracked across conversation turns.

In `scratch_live/live_buscar.js`:
- Queries without dimensions match all lengths/profiles simultaneously (e.g. returning a 2.44m sheet alongside a 6m sheet).
- If `aclarar` is triggered, it often lacks structured awareness of the store's actual catalog variations for that department.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Jev Attribute Extraction (`lib/jev-shadow.js`) | `lib/jev-shadow.js: productAttributes()` | Needs multi-department attribute schemas (`length`, `dimension`, `gauge`, `presentation`, `grade_class`). |
| Dimension Normalization (`lib/serrucho-search.js`) | `lib/serrucho-search.js: normMedida()` | Needs structured extraction helper `extractDepartmentAttributes(query, department)`. |
| Search Engine Disambiguation (`scratch_live/live_buscar.js`) | `scratch_live/live_buscar.js` | Must evaluate if a query is dimension-deficient and provide tailored bot instructions listing El Serrucho's active catalog options. |
| Source Synchronization (`scripts/check_sources_sync.js`) | `scripts/check_sources_sync.js` | Maintain strict synchronization across all source copies. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/dynamic-solution-search.test.js` | Problem and action resolution | Does not test dimensional attribute extraction for profiles/roofing/paint. |
| `tests/category-search.test.js` | Department scoring | Lacks assertions on missing-dimension clarification prompts. |
| `rag.js regresion` | 86 baseline catalog queries | Must maintain 0 false negatives. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Static Regex Lists in bot prompt only** | No code change in search. | Prompt bloating; model frequently hallucinates nonexistent sheet lengths or pipe gauges. | High | Medium |
| **Option B: Deterministic Department Attribute Extractor in Search & Jev (Recommended)** | 1) High-speed (<2ms) deterministic attribute extraction. 2) Tailored clarification instructions derived directly from real catalog inventory options. 3) Retains conversation state across turns. 4) Zero false negatives on existing benchmarks. | Requires clean regex patterns for length, caliber, and profile dimensions. | Low | Medium |
| **Option C: Secondary LLM Clarification Call** | High conversational flexibility. | 2-3 second latency penalty, token costs, nondeterministic JSON outputs. | High | High |

## Option Tradeoffs

- **Option A** risks hallucinating sizes the store doesn't stock (e.g. asking if the customer wants 5-meter zinc sheets when Serrucho only carries 6m, 3.66m, 3.05m, 2.44m).
- **Option C** adds unacceptable latency to common inquiries.
- **Option B** operates deterministically in sub-millisecond time, referencing El Serrucho's real catalog options and feeding clean attributes to both search and conversation memory.

## Recommendation

**Adopt Option B: Deterministic Department Attribute Extractor.**
1. Implement `extractDepartmentAttributes(query, department)` in `lib/serrucho-search.js`:
   - `techos_laminas`: extracts `length` (6m, 3.66m/12 pies, 3.05m/10 pies, 2.44m/8 pies), `caliber` (cal 30, cal 35, cal 28).
   - `hierro_perfiles`: extracts `dimension` (2x1, 1x1, 100x100, etc.), `thickness` (0.8mm, 1.0mm, 1.1mm, 1.4mm, 2mm).
   - `pinturas`: extracts `presentation` (cuñete, galon, 1/4), `grade_class` (clase a, clase b, clase c), `finish` (caucho, aceite, satinada).
   - `plomeria_griferia`: extracts `diameter` (1/2, 3/4, 1, 2, 3, 4 pulgadas), `usage` (agua fria, caliente, aguas negras).
2. In `lib/jev-shadow.js`: expand `productAttributes()` to persist these attributes across turns.
3. In `scratch_live/live_buscar.js`:
   - When a macro-department product inquiry lacks key dimensions, mark `aclarar: true` with a store-specific instruction presenting active inventory dimensions.
   - When key dimensions are present, boost matching SKUs with exact attribute bonuses.

## Risks

- **False positive clarification on unambiguous items**: e.g., asking for a shovel or hammer shouldn't ask for a pipe diameter.
  *Mitigation*: Attribute requirements are strictly scoped to macro-departments and product families that physically require them (`laminas`, `tubos`, `pintura`).
- **Regression on catalog benchmark**:
  *Mitigation*: Must pass all 86 regression queries with 0 false negatives in `node rag.js regresion`.

## Open Questions

None. The attribute dimensions match the actual ERP stock codes and catalog patterns.

## Ready For Planning

**Yes**. Well-defined requirements, decoupled implementation, and verifiable outcomes.
