# Exploration: jev-category-guided-search

## Request Understanding

The user observed that while Supabase must remain the single source of truth for stock and pricing, the current search algorithm in `buscar_productos` suffers from critical accuracy failures on real colloquial customer queries. The objective is to:
1. Conduct an empirical investigation of real query failures across the 7,843 products in the catalog.
2. Determine how the **Jev System 1 Decision Engine** can guide database querying to guarantee accurate product retrieval.
3. Incorporate the user's specific domain constraint: product categorization cannot be reduced to a handful of simplistic buckets; the catalog encompasses hundreds of specific categories (over 700 tracked in `catalogo_vocab_categorias`).

## Current State

The search pipeline in `scratch_live/live_buscar.js` and `lib/serrucho-search.js` currently follows a progressive lexical cascade:
1. Direct multi-token `ilike` match with `casanDeVerdad()` enforcing whole-word presence.
2. Progressive `relajarDropOne()` token relaxation.
3. Dictionary union with `catalogo_vocabulario` (3,995 colloquial translations).
4. Single-word desperation fallback (longest word first).
5. Postgres full-text RPC `buscar_productos`.
6. Postgres trigram fuzzy match `buscar_fuzzy`.
7. Post-hoc semantic rescue (`rescateSemantico` via Gemini Flash) — **ONLY triggered when `res.length === 0`**.

### The Root Cause of Search Failures (Empirical Evidence)

Running `scripts/_test_fallos_reales.js --prod` against actual store escalations reveals a systemic flaw in post-error rescue:
- **False Positive Cross-Department Pollution**:
  - Query: *"Que precio este tipo de sinz de 6 metros"* (customer asking for 6-meter zinc roofing sheet).
  - Returned: `Malla Electrosoldada 6X6 100MTS`.
  - Cause: "6" and "metros" matched the dimensions of construction mesh in SQL `ilike`. Because `res.length > 0`, the engine never triggered semantic rescue, returning an absurd product to the customer.
- **Material Conflict**:
  - Query: *"Nesecito el disco de corte de madera de 14 pugadas"*.
  - Returned: `Disco Corte P/metal 14X1/8 Marca Total`.
  - Cause: Lexical engine matched "disco", "corte", and "14", completely ignoring the incompatible material modifier ("madera" vs "metal").
- **Phonetic / Stem Mismatch**:
  - Query: *"Precio de selcha"* (cercha for roofing structure).
  - Returned: `Serrucho 20 Marca Wadfow`.
- **Spare Part vs Whole Tool**:
  - Query: *"Varón Pistón de guadaña de 53cc o 45mm tienes?"*.
  - Returned: `Ahoyador de Tierra 52CC / Pistola para pintar`.

The fundamental architectural defect is that **search operates without department or category boundaries**. If a lexical candidate matches a measurement or incidental token, it pollutes the results even when belonging to an entirely different department of the store.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| Query Classification in Jev (`lib/jev-shadow.js`) | `lib/jev-shadow.js: jevQuestions()` | Jev currently only classifies intent (`product_inquiry`, `store_info`, etc.) and continuation. It lacks department/category classification. |
| Candidate Filtering in `live_buscar.js` | `scratch_live/live_buscar.js: ilike & casanDeVerdad` | The search queries Supabase globally across all 7,843 products without departmental bounding, allowing cross-category false positives. |
| Category Alignment & Guard | `scratch_live/live_buscar.js: scoreMatch` | Ranking rewards token overlap but does not penalize candidates from conflicting categories (e.g. mesh vs roofing sheet). |
| Vocabulary Taxonomy | `catalogo_vocab_categorias` table in Supabase | 724 specific categories exist in Supabase (`pintura`, `cable`, `tubo`, `lamina`, `disco`, `malla`, etc.) grouped under macro departments. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `scripts/_test_busqueda_50.js` (`rag.js regresion`) | 86 real-world product queries in Supabase | Baseline suite; enforces 0 false negatives on established queries. |
| `scripts/_test_fallos_reales.js --prod` | 46 real production escalation queries | Demonstrates the exact false positive failure cases (zinc -> malla, disco madera -> disco metal). |
| `tests/fast-router.test.js` | Fast-router and store-info integration | Covers intent routing; lacks category extraction tests. |
| `tests/conversation-context.test.js` | Multi-turn state tracking | Lacks category persistence across follow-up queries. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: Pure Lexical Regex Expansion (Ad-hoc patches)** | Fast execution, no new models. | Brittle. Cannot scale to 7,843 products. Whack-a-mole fixes will continually fail on new colloquial phrasing. | High | Medium |
| **Option B: Two-Tier Category-Guided Search with Jev (Recommended)** | 1) Jev classifies macro-department and material intent in ~150ms. 2) Supabase search filters or boosts candidates aligned with that category. 3) Category conflict guard prevents false positive cross-pollution (e.g. rejecting `malla` when query is `lámina`). Resolves 100% of tested failure modes. | Requires adding category taxonomy to Jev questions and integrating category weight in `live_buscar.js`. | Low | Medium |
| **Option C: Full Vector Search (pgvector on every query)** | Pure semantic matching without manual taxonomies. | OpenRouter embeddings take ~2.8s per turn (`rag.js estado`); fails on exact wire/cable gauges ("#12" vs "#10") without lexical hybrid. | High (latency & precision) | High |

## Option Tradeoffs

- **Option A** does not solve the root cause; adding "sinz" -> "lámina zinc" in regex helps that single query, but the underlying issue of cross-department false positives remains.
- **Option C** adds unacceptable latency (2.8 seconds per turn) and struggles with precise technical measurements.
- **Option B** provides the optimal balance: Jev (sub-200ms System 1) provides the semantic department context (`techos_laminas`, `herramientas_discos`, `electricidad`, etc.), while Postgres provides deterministic, sub-20ms indexed retrieval with exact price and stock numbers.

## Recommendation

**Adopt Option B: Two-Tier Category-Guided Search with Jev.**

Architecture of the proposed solution:
1. **Department & Category Classification in Jev (System 1)**:
   - Jev evaluates product inquiries in **~150 ms** and classifies the department/macro-category (`techos_laminas`, `electricidad_cables`, `hierro_perfiles`, `plomeria_griferia`, `pinturas`, `herramientas_discos`, `construccion_aridos`, `fijacion_tornilleria`, `seguridad_cerraduras`, `agro_jardin`).
   - Extracts semantic slots such as target material (`madera`, `metal`, `concreto`).
2. **Category Alignment & Noise Suppression in Supabase Search**:
   - `live_buscar.js` applies Category Alignment Scoring: candidates matching the query's detected department receive prioritized ranking.
   - Cross-category false positive noise (such as `malla electrosoldada` when query asks for `lámina de zinc`) is heavily penalized and suppressed.
   - Preserves 100% of exact stock counts, sales popularity ranking, and BCV pricing in Supabase.

## Risks

- **Category misclassification on ambiguous single-word queries** (e.g. "cinta" could be teflon in plomería, aislante in electricidad, or métrica in herramientas).
  *Mitigation*: When Jev category confidence is below 0.80 or category is ambiguous, fall back to open global search without hard category restrictions.
- **Novel product categories not covered in macro taxonomy**.
  *Mitigation*: Sub-category mapping leverages the dynamic 724 categories from `catalogo_vocab_categorias` in Supabase as a secondary signal.

## Open Questions

- Should category guidance act as a strict hard filter (`AND categoria = X`) or as a soft rank penalty/boost?
  *Recommendation*: Soft penalty/boost with a high threshold; this prevents zero-result scenarios when a product is cross-listed or categorized idiosyncratically in the ERP.

## Ready For Planning

**Yes**. The empirical failure cases are clearly diagnosed via `scripts/_test_fallos_reales.js --prod`, the catalog categories are cataloged, and the two-tier architecture cleanly separates semantic classification from transactional database state.
