# Proposal: jev-installation-kits

## Intent

Hardware store WhatsApp customers frequently purchase primary fixtures (e.g. *poceta / inodoro*, *lavamanos*, *fregadero*, *láminas de techo*, *tubos de PVC*) without ordering the essential complementary accessories required to install them. This causes customer frustration when installation stalls on site and represents missed sales opportunities for the store. Furthermore, when customers directly ask *"¿Qué necesito para instalar una poceta?"* or *"kit para lavamanos"*, the search engine often fails to find matching complete kits in inventory and responds with `encontrados: 0` or triggers `[PEDIR_AYUDA]`.

This proposal implements a **Deterministic Installation Kit Resolver (`lib/installation-kits.js`)** that:
1. Detects customer inquiries asking what is needed to install a fixture or explicitly asking for an installation kit.
2. Returns calibrated accessory kits containing all mandatory installation components according to Venezuelan plumbing, roofing, and sanitary trade standards.
3. Automatically attaches a `kit_sugerido` to search results when primary fixtures are queried, enabling the AI bot to proactively offer the installation kit with pre-formatted quote strings ready for `hacer_presupuesto_tool`.
4. Guarantees 0 false negatives across all 86 catalog regression benchmark queries.

## Scope

### In Scope

- **Core Kit Resolver (`lib/installation-kits.js`)**:
  - Implement `getInstallationKit(categoryOrKey)` covering the 5 most critical trade categories:
    1. `sanitario_poceta`: Herraje de poceta, canilla para poceta 1/2 x 7/8, llave de arresto 1/2, cuello de cera con guía, tornillos de fijación para sanitario, teflón.
    2. `lavamanos`: Grifería para lavamanos, canillas para lavamanos 1/2 x 1/2, sifón / desagüe de lavamanos, llave de arresto 1/2, teflón.
    3. `fregadero`: Grifería de fregadero, canillas para fregadero, contracanasta con sifón de fregadero, silicón transparente, teflón.
    4. `techo_laminas`: Ganchos para techo con tuerca y goma (o tornillos autoperforantes con arandela de goma), caballete / cumbrera, silicón o cemento plástico para remates.
    5. `tuberias_pvc`: Pega soldadura PVC, limpiador PVC, codos/uniones, cinta teflón.
  - Implement `detectInstallationQuery(query)`: Detects queries asking how to install, mount, or what is needed for installing fixtures (*"qué necesito para instalar una poceta"*, *"kit de instalación para lavamanos"*).
  - Implement `getComplementaryKitForProduct(productName, department)`: Identifies if a primary product in search results qualifies for an accessory kit upsell.
- **Search Integration (`scratch_live/live_buscar.js`)**:
  - Intercept explicit installation queries before `missing` fallback, providing kit breakdown and pre-formatted quote string.
  - Enrich top fixture search results with `kit_sugerido` metadata for the AI agent to offer.
- **Source Parity & Synchronization**:
  - Keep `lib/installation-kits.js`, `scratch_live/live_buscar.js`, and `scripts/new_buscar.js` synchronized, passing `scripts/check_sources_sync.js`.
- **Zero Regression**: Pass all 86 benchmark queries in `node rag.js regresion` with 0 false negatives, and pass all existing unit tests in `npm test`.

### Out of Scope

- Modifying existing database schema or creating synthetic bundled SKUs in Supabase.
- Replacing the primary product search results with kits when the user clearly only wanted the fixture.

## Capabilities

### New Capabilities

- `installation-kit-resolver`: Deterministic lookup and packaging of complementary accessories for standard plumbing, sanitary, and roofing installations.
- `installation-intent-detection`: Extraction of installation kit requests and inquiries from natural WhatsApp customer language.

### Modified Capabilities

- `live-search-pipeline`: Enhanced to intercept installation questions and attach suggested installation kits to qualifying primary fixture queries.

## Approach

1. **Deterministic Trade Bundles**:
   - Encapsulate the trade requirements in `lib/installation-kits.js` with structured item arrays, technical descriptions, and `items_presupuesto` strings.
2. **Dual Pathway Support**:
   - *Direct Inquiry Pathway*: Customer asks *"qué necesito para instalar un inodoro"*. The search pipeline intercepts the inquiry, returning the full itemized list with technical notes and quote-ready string.
   - *Complementary Upsell Pathway*: Customer searches *"poceta"* or *"fregadero sencillo"*. The search returns the matching fixtures from catalog inventory, but enriches the JSON response with `kit_sugerido`. The AI agent can present the fixtures and immediately suggest adding the installation kit.
3. **Seamless Quote Handoff**:
   - Each kit provides an `items_presupuesto` string formatted for direct ingestion into `parseItems()` and `hacer_presupuesto_tool`.
4. **Fail-Closed Boundaries**:
   - Single accessory searches (*"canilla para poceta"*, *"herraje de inodoro"*, *"gancho de techo"*) are not intercepted and remain standard catalog searches.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/installation-kits.js` | High | New module with installation kits, intent detector, and complementary matcher. |
| `lib/serrucho-search.js` | Medium | Re-exports kit functions for system-wide access. |
| `scratch_live/live_buscar.js` | High | Adds installation query interception and `kit_sugerido` enrichment to search results. |
| `scripts/new_buscar.js` | High | Synchronized development copy. |
| `tests/installation-kits.test.js` | High | Comprehensive test suite covering kits, detection, quote parsing, and boundaries. |
| `scripts/check_sources_sync.js` | Low | Source sync verification. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Intercepting single accessory searches | Low | Detector requires action verbs (*"instalar", "colocar", "montar", "que necesito para"*) or explicit keyword *"kit"* + fixture target. |
| Overly aggressive upsell | Low | The `kit_sugerido` is passed as an optional advisory property in the search envelope; the agent recommends it naturally without forcing. |
| Catalog regression | Low | Gated by 86 benchmark queries with 0 false negatives in `node rag.js regresion`. |

## Rollback Plan

1. Revert changes to `scratch_live/live_buscar.js` and `scripts/new_buscar.js`.
2. Run `scripts/check_sources_sync.js` and `npm test` to verify clean state.

## Success Criteria

- Inquiry *"qué necesito para instalar una poceta"* returns:
  - Complete list: herraje, canilla, llave de arresto, cuello de cera, tornillos, teflón.
  - Quote-ready string for `hacer_presupuesto`.
- Search for *"poceta"* returns catalog pocetas and includes `kit_sugerido` in response.
- Query *"kit de instalación de lavamanos"* returns the lavamanos installation kit.
- Direct query for an accessory like *"canilla para poceta"* or *"herraje"* returns catalog results directly without interception.
- 0 false negatives across all 86 benchmark queries in `node rag.js regresion`.
- 100% pass on all unit tests (`npm test`).

## Open Questions

None. Kits represent standardized Venezuelan installation practices.

## Verification Plan

### Automated Tests

- `node --test tests/installation-kits.test.js`: Assert kit definitions across all 5 categories, query detection, upsell detection, quote string parsing, and boundary safety.
- `node scripts/check_sources_sync.js`: Enforce zero source drift across live and dev files.
- `node rag.js regresion`: Verify 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 240+ passing unit tests.
