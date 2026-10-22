# Proposal: Attribute Integrity Guard and Water-Based Paint Normalization

## Intent

On 2026-10-13, a customer requested:
`"Pintura de agua color pink Beige"`

The sales assistant ("Perucho") responded with:
- `Pintura De Caucho Tipo A Evermax C-653 Agua Marina [AGOTADO]`
- `Pintura Caucho Aguamarina C Gal Floripaint [DISPONIBLE]`
- `Pintura Caucho Every C-253 Aguamarina B [DISPONIBLE]`
- `Pintura Caucho Aguamarina C Cunete Floripaint [DISPONIBLE]`
And concluded with:
`"Color Lila, estas son las opciones relacionadas disponibles 👀 ¿Te sirve alguna o prefieres que un empleado experto te atienda mejor? 👨🏻🔧"`

Investigating the incident uncovered three critical flaws:
1. **Colloquial Term Collision**: In Venezuela, "pintura de agua" is the standard colloquial term for water-based emulsion paint (*pintura de caucho*). Because the catalog exclusively names these `PINTURA CAUCHO ...`, the unmapped word `"agua"` collided with the only catalog paints containing "agua": `"Agua Marina"` and `"Aguamarina"`. Furthermore, the store *did* have the requested beige paint in stock (`PINTURA CAUCHO BEIGE C GAL FLORIPAINT`), but could not reach it because `"agua"` diverted retrieval.
2. **Silent Fallback Dropping Attributes as Exact**: When drop-one relaxation failed, the engine fell back to `ilike(largas.slice(0, 2))` which truncated the query to `['pintura', 'agua']`. Because `_dropped` was only set by `relajarDropOne`, this 2-word fallback dropped all remaining attributes (`pink`, `beige`) without recording what was dropped, without setting `_out.parcial`, and without triggering `confirm` routing. The system labeled unrelated products as `match_status: "exact"` and `action: "show_results"`.
3. **Stray Color Saved as Customer Name**: On 2026-09-02, the customer's phone number was saved in `clientes_chat` with `nombre: "Color Lila"` because a previous inquiry regarding paint color was ingested as a person's name without validation.

This change provides a comprehensive, generalized guardrail across all catalog products to prevent attribute-drop hallucinations, normalizes water-based paint terminology, and guards customer name ingestion.

---

## Scope

### In Scope
1. **Water-Based Paint Normalization**:
   - Normalize `pintura de agua`, `pinturas de agua`, `pintura al agua`, `a base de agua` to `pintura caucho` in `SIN` and `expandir()`.
   - Add `pink -> rosad`, `lila -> lila`, and full color coverage to `COLOR_STEM` and `CANONICAL_COLORS`.

2. **Attribute Integrity Guard for Any Product**:
   - Track all dropped tokens when multi-token fallbacks (such as `largas.slice(0, 2)`) run, ensuring `_dropped` is always populated.
   - Enforce that queries dropping attributes (colors, materials, subtypes, measures) are NEVER marked `match_status: "exact"`. They must be classified as `relaxed` / `action: "confirm"` with `_out.parcial = true` and explicit agent instructions.
   - Introduce an Attribute Color Guard: if a query specifies a color, but candidate products do not match that color, prohibit exact match status and instruct the agent to clarify availability.

3. **Customer Name Ingestion Guard**:
   - Reset the corrupted name for phone `46051243335877@lid` in Supabase `clientes_chat`.
   - In `guardar_memoria_engram`, guard against saving recognized colors, catalog categories, or hardware words as customer names.

4. **Testing and Verification**:
   - Add unit tests in `tests/paint_search.test.js` and `tests/catalog-search.test.js` verifying water-based paint search, beige retrieval, and color drop protection.
   - Maintain full synchronization across `lib/serrucho-search.js`, `lib/catalog-search.js`, `scratch_live/live_buscar.js`, `scripts/new_buscar.js`, and `n8n_workflow.json`.

### Out of Scope
- Modifying the underlying Supabase database schema or altering product SKU records.
- Redesigning the WAHA transport layer or Docker container setup.
