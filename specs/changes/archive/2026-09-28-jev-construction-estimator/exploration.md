# Exploration: jev-construction-estimator

## Request Understanding

In hardware store customer interactions on WhatsApp, customers frequently ask what materials are needed for specific construction and home improvement jobs rather than searching for individual SKUs:
1. *Block Laying / Masonry*: *"¿Cuánto material se va para pegar 200 bloques?"*, *"Materiales para 100 bloques"*.
2. *Concrete Slabs & Floors*: *"¿Qué necesito para vaciar una placa de 20 metros cuadrados?"*, *"Materiales para vaciar un piso de 15m2"*.
3. *Wall Plastering (Friso)*: *"¿Cuánto cemento y arena para frisar 30 metros de pared?"*.
4. *Barbed Wire Fencing*: *"Combo para una cerca de 50 metros con alambre de púa"*.
5. *Painting Estimates*: *"¿Cuánta pintura necesito para 80 metros cuadrados?"*.

The goal is to implement a **Deterministic Construction Materials Estimator (`lib/construction-estimator.js`)** integrated with Jev and search tools:
- Detect project estimation inquiries from customer messages.
- Calculate standardized, calibrated material quantities using Venezuelan construction industry standards (cemento gris, arena, piedra picada, malla truckson, alambre de púa, pintura).
- Provide clear explanatory instructions to the bot and generate structured multi-item strings compatible with `hacer_presupuesto_tool`.
- Handle dimension-deficient inquiries (e.g., *"¿Qué necesito para vaciar un piso?"*) by prompting for square meters.
- Maintain zero false negatives on catalog search benchmarks (`rag.js regresion`).

## Current State

Currently in `scratch_live/live_buscar.js` and `lib/serrucho-search.js`:
- Queries like *"qué necesito para vaciar una placa de 20 metros"* are treated as direct product queries.
- Supabase ILIKE and text matching find 0 items matching "vaciar", "necesito", "placa".
- The system flags `encontrados: 0` and triggers `[PEDIR_AYUDA]`, failing to answer the customer's question autonomously.
- Neither `buscar_productos` nor `hacer_presupuesto` possesses construction estimation formulas.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Construction Estimator (`lib/construction-estimator.js`) | New module | Houses calibrated construction formulas and task detection rules. |
| Search Engine Export (`lib/serrucho-search.js`) | Module exports | Exposes estimator utilities to search and quote pipelines. |
| Live Search (`scratch_live/live_buscar.js`) | Search pipeline before missing fallback | Intercepts construction task questions, returning estimated BOM and advice instead of `missing`. |
| Development Copy (`scripts/new_buscar.js`) | Source copy | Must match `scratch_live/live_buscar.js` verbatim. |
| Source Synchronization (`scripts/check_sources_sync.js`) | Integrity check | Guarantees code parity across files. |
| Tests (`tests/construction-estimator.test.js`) | New test suite | Tests formula accuracy, task detection, and quote compatibility. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/multi-item-quotes.test.js` | Parses quote item lists | Does not test construction estimation or formula generation. |
| `tests/department-attributes.test.js` | Dimension extraction | Does not test construction task detection. |
| `tests/problem-search.test.js` | Problem repair solutions | Tests repair intents (leaks, cracks), not project material calculations. |
| `rag.js regresion` | 86 baseline catalog queries | Must maintain 0 false negatives. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Pure LLM Hallucinated Estimation** | Flexible conversational handling. | Inconsistent formulas, incorrect quantities, slow latency (2-3s), token cost. | High | Low |
| **Option B: Deterministic Builder Calculator + Jev Pattern Recognition (Recommended)** | 1) Standardized engineering formulas (Venezuelan norms). 2) Sub-millisecond execution. 3) Generates exact lists for `hacer_presupuesto`. 4) Zero token cost. | Requires defining standard ratios for core construction tasks. | Low | Medium |
| **Option C: Static FAQ Responses** | Simple to write. | Cannot calculate dynamic quantities based on customer's actual area ($m^2$) or count. | High | Low |

## Recommendation

**Adopt Option B: Deterministic Construction Materials Estimator.**
1. Implement `estimateConstructionMaterials(task, quantity, options)` with calibrated Venezuelan construction formulas:
   - `pegar_bloques`: 1 cement sack per 30-35 blocks, 0.15 $m^3$ washed sand per sack.
   - `vaciar_piso_losa`: 0.8 cement sacks per $m^2$ (at 10cm depth), 0.05 $m^3$ sand, 0.07 $m^3$ crushed stone (piedra picada), 1 $m^2$ truckson mesh.
   - `frisar_pared`: 1 cement sack per 7 $m^2$, 0.025 $m^3$ fine sand.
   - `cerca_alambre_pua`: 4-5 lines of wire per linear meter, staples, posts every 2.5m.
   - `pintar_superficie`: 1 gallon per 25-30 $m^2$ (2 coats), 1 cuñete per 100-120 $m^2$.
2. Implement `detectConstructionTask(query)`:
   - Identify task intent and extract dimensions ($m^2$, meters, block count).
   - If dimension is missing, return `aclarar: true` asking for the project size.
3. Integrate with `live_buscar.js`:
   - Intercept construction inquiries before `missing` fallback.
   - Return structured estimate with human-readable instruction and `items_presupuesto` string for instant quotation.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False positives on direct product inquiries (e.g. "bloque #10", "cemento gris") | Low | Task detector requires construction action verbs ("pegar", "vaciar", "frisar", "para hacer", "cuanto material se va para") combined with project targets. |
| Inaccurate material estimates | Low | Formulas are calibrated against standard Venezuelan maestro de obra ratios with conservative safety margins. |
| Catalog regression | Low | Gated by 86 benchmark queries with 0 false negatives in `node rag.js regresion`. |

## Open Questions

None. Formulas match standard Venezuelan hardware store building practices.

## Ready For Planning

**Yes**. Scope is clear, bounded, testable, and provides immense value to WhatsApp customers.
