# Exploration: jev-installation-kits

## Request Understanding

In hardware store sales operations on WhatsApp, customers frequently purchase primary fixtures and heavy materials without realizing they need specific complementary accessories to complete the installation:
1. *Toilets / Sanitary Ware*: When buying a *poceta / inodoro*, customers need the complete installation kit: herraje, canilla 1/2 x 7/8, llave de arresto 1/2, cuello de cera o goma selladora, tornillos de fijación para sanitario, and teflón.
2. *Sinks & Washbasins (Lavamanos & Fregaderos)*: When buying a *lavamanos* or *fregadero*, customers need: grifería, canillas, desagüe/sifón, llave de arresto, and teflón/silicón.
3. *Roofing Sheets (Láminas de Techo)*: When buying *láminas de zinc o arquitectónicas*, customers require: ganchos para techo con tuerca y goma o tornillos autoperforantes con arandela de goma, caballete/cumbrera, and cemento plástico/silicón.
4. *Drainage & Plumbing PVC Pipes*: When buying *tubos de aguas negras o blancas*, customers require: pega soldadura para PVC, limpiador, codos/tee, and teflón.
5. *Waterproofing (Manto Asfáltico)*: When buying *manto asfáltico*, customers require: primer asfáltico (primer líquido), cemento plástico para remates, and gas/soplete accessories.

When the customer buys only the primary item, they often face project halts or must make return trips to the store. Offering the complementary installation kit directly:
- Protects the customer from arriving at the job site missing essential hardware.
- Increases the average order value (upsell) for the hardware store.
- Provides direct answers when customers specifically ask *"¿Qué necesito para instalar un inodoro?"* or *"kit para lavamanos"*.

## Current State

Currently in `scratch_live/live_buscar.js` and `lib/serrucho-search.js`:
- Queries for primary fixtures (e.g. *"poceta", "fregadero"*) return only the fixture SKUs. No complementary accessory kits are surfaced or suggested.
- Explicit kit queries like *"qué necesito para instalar una poceta"* often trigger `missing` or `[PEDIR_AYUDA]` if phrasing does not strictly match inventory titles.
- The AI Agent in n8n does not have structured accessory knowledge to proactively propose the standard Venezuelan plumber/installer kit.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Installation Kits Module (`lib/installation-kits.js`) | New module | Houses deterministic accessory kit definitions and intent detector for installation accessories. |
| Search Engine Export (`lib/serrucho-search.js`) | Module exports | Exposes kit utilities to live search and budget pipelines. |
| Live Search (`scratch_live/live_buscar.js`) | Search pipeline | Detects when a primary product or inquiry has a complementary kit, enriching results with `kit_sugerido` and intercepting installation requirement queries. |
| Development Copy (`scripts/new_buscar.js`) | Source copy | Maintained in 100% verbatim sync with `live_buscar.js`. |
| Source Synchronization (`scripts/check_sources_sync.js`) | Integrity check | Guarantees code parity across files. |
| Tests (`tests/installation-kits.test.js`) | New test suite | Tests kit resolution, detection, prompt generation, and quote parsing compatibility. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/construction-estimator.test.js` | Obra civil estimation | Tests raw bulk materials (cement, sand, wire), not plumbing/roofing accessory kits. |
| `tests/problem-search.test.js` | Problem repair solutions | Tests repair intents (leaks, cracks), not fixture installation kits. |
| `rag.js regresion` | 86 baseline catalog queries | Must maintain 0 false negatives, particularly for query 58 (*"Es kit de sanitario y kit de lavamano"*). |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Pure LLM Conversational Suggestion** | Prompt-driven in AI Agent. | Inconsistent kit items, hallucinated accessories, non-deterministic pricing, dependent on LLM memory. | High | Low |
| **Option B: Deterministic Installation Kit Resolver + Jev Integration (Recommended)** | 1) Calibrated standard kits used in Venezuelan trade. 2) Sub-millisecond execution. 3) Output string formatted for instant `hacer_presupuesto` quote. 4) Zero false negatives on catalog search. | Requires defining standard kits for top categories. | Low | Medium |
| **Option C: Hardcoded Catalog Bundles in DB** | Stored in Supabase. | Requires database schema migrations and catalog record alterations. | Medium | High |

## Recommendation

**Adopt Option B: Deterministic Installation Kit Resolver.**
1. Implement `lib/installation-kits.js`:
   - `getInstallationKit(categoryOrTask)`: Returns calibrated accessories for `sanitario_poceta`, `lavamanos`, `fregadero`, `techo_laminas`, `tuberias_pvc`, and `manto_asfaltico`.
   - `detectInstallationKitQuery(query)`: Detects queries specifically asking how to install or what is needed to install a fixture.
   - `findComplementaryKit(productTitle, department)`: Surfaces an upsell kit when a customer searches for a qualifying primary item.
2. Re-export in `lib/serrucho-search.js`.
3. Integrate into `scratch_live/live_buscar.js`:
   - Direct installation inquiries return the complete kit and advice.
   - Qualifying primary searches attach `kit_sugerido` with pre-formatted quote string and seller prompt.
4. Maintain full synchronization and verify against the 86 catalog regression queries.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Overwhelming the customer with unwanted items | Low | Kits are offered as optional suggestions with clear, courteous trade advice. |
| False interception of regular product searches | Low | Installation query detection requires explicit action verbs (*"instalar", "montar", "colocar", "kit para"*) or explicit questions. |
| Catalog regression | Low | Gated by 86 benchmark queries with 0 false negatives in `node rag.js regresion`. |

## Open Questions

None. The 5 core installation kits match standard Venezuelan trade practices.

## Ready For Planning

**Yes**. Scope is well-defined, modular, and directly improves customer experience and sales conversion.
