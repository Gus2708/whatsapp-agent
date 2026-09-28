# Design: jev-installation-kits

## Technical Approach

Implement a deterministic installation kit resolver and detector for complementary plumbing, sanitary, roofing, and pipe installation accessories:
1. **Module `lib/installation-kits.js`**:
   - `INSTALLATION_KITS`: Trade-calibrated dictionary containing required accessory bundles:
     - `sanitario_poceta`: Herraje, canilla 1/2 x 7/8, llave de arresto, cuello de cera, tornillos de fijación, teflón.
     - `lavamanos`: Grifería, 2 canillas 1/2 x 1/2, sifón/desagüe, llave de arresto, teflón.
     - `fregadero`: Grifería, 2 canillas, contracanasta, sifón, silicón transparente, teflón.
     - `techo_laminas`: Ganchos para techo, caballete, cemento plástico / silicón.
     - `tuberias_pvc`: Pega soldadura PVC, limpiador PVC, teflón.
   - `getInstallationKit(category)`: Returns the detailed kit structure with item names, units, descriptions, technical guidance, and `items_presupuesto` strings.
   - `detectInstallationQuery(query)`: Detects when a customer inquiry is asking how to install, mount, or asking for an installation kit for a fixture.
   - `findComplementaryKit(productName, department)`: Matches a primary catalog product or query to its corresponding installation kit for proactive upselling.
2. **Search Pipeline Integration (`scratch_live/live_buscar.js`)**:
   - *Direct Inquiry Interception*: When `detectInstallationQuery` matches, returns an informative JSON response with the complete kit breakdown, trade advice, and pre-formatted `items_presupuesto`.
   - *Complementary Kit Upsell*: When a search returns qualifying primary fixtures (e.g. poceta, fregadero, lavamanos, lámina de techo), attaches `kit_sugerido` to the search response envelope so the AI Agent can proactively offer it.
3. **Re-export via `lib/serrucho-search.js`**:
   - Make `getInstallationKit`, `detectInstallationQuery`, and `findComplementaryKit` accessible system-wide.
4. **Source Parity & Synchronization**:
   - Synchronize across `lib/`, `scratch_live/`, and `scripts/`, validated by `scripts/check_sources_sync.js`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Accessory Bundle Storage | Deterministic dictionary in `lib/installation-kits.js` | Supabase DB tables / LLM prompts | Fast execution (<0.1ms), zero external network latency, zero hallucinations, aligned with Venezuelan maestro de obra practice. |
| Dual Integration Mode | Direct query interception + search result upsell attachment | Direct interception only | Customers often search for the fixture first; attaching `kit_sugerido` to the fixture result empowers the AI bot to upsell naturally. |
| Quote Tokenizer Parity | Generate `items_presupuesto` formatted for `parseItems()` | Raw nested JSON | Allows instant piping into `hacer_presupuesto_tool` without extra transformation. |
| Strict Boundary Guards | Exclude single accessory searches from interception | Generic regex matching | Searching for "canilla para poceta" must find the canilla SKU in catalog, not trigger the entire kit response. |

## Architecture Design

### Project Placement

```text
lib/
├── installation-kits.js
│   └── getInstallationKit()
        [new] Returns calibrated accessory kits for fixtures.
└── serrucho-search.js
    └── getInstallationKit()
        [modify] Re-exports installation kit functions.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Intercepts direct kit inquiries and enriches fixture searches with kit_sugerido.
scripts/
└── new_buscar.js
    └── buscar()
        [modify] Development reference synchronized with scratch_live.
tests/
└── installation-kits.test.js
    └── testInstallationKits()
        [new] Tests for kit resolution, query detection, upsell matching, and boundaries.
```

### Data Flow

```text
Direct Inquiry: "¿Qué necesito para instalar una poceta?"
                     │
                     ▼
         [detectInstallationQuery]
                     │
         Category: "sanitario_poceta"
                     │
                     ▼
            [getInstallationKit]
                     │
   Kit Breakdown:
   - Herraje para poceta (1)
   - Canilla 1/2 x 7/8 (1)
   - Llave de arresto 1/2 (1)
   - Cuello de cera (1)
   - Tornillos de fijación (1 juego)
   - Teflón (1 rollo)
   items_presupuesto: "1 herraje para poceta, 1 canilla para poceta 1/2 x 7/8, 1 llave de arresto 1/2, 1 cuello de cera, 1 juego de tornillos de fijacion para poceta, 1 teflon"
                     │
                     ▼
   Bot Response: Full breakdown with technical advice and prompt to quote.
```

```text
Primary Fixture Search: "poceta blanca"
                     │
                     ▼
             Catalog Search
                     │
   Matched: Poceta Blanca C/tanque
                     │
                     ▼
         [findComplementaryKit]
                     │
   Attaches `kit_sugerido` to JSON response:
   - Suggested: Kit de instalación de poceta
   - items_presupuesto for instant add-on quote
```

## Interfaces

```typescript
interface KitItem {
  nombre: string;
  cantidad: number;
  unidad: string;
}

interface InstallationKit {
  categoria: string;
  nombre: string;
  descripcion: string;
  items: KitItem[];
  items_presupuesto: string;
  consejo_tecnico: string;
}

function getInstallationKit(category: string): InstallationKit | null;
function detectInstallationQuery(query: string): { match: boolean; categoria: string; kit: InstallationKit } | null;
function findComplementaryKit(productName: string, department?: string): InstallationKit | null;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `getInstallationKit()` for all 5 categories | Assert complete items, units, and `items_presupuesto` strings. |
| Unit Test | `detectInstallationQuery()` pattern matching | Assert detection for "instalar poceta", "kit para lavamanos", etc. |
| Boundary Test | Single accessory searches | Assert queries for "canilla para poceta", "herraje", "gancho para techo" return `null`. |
| Integration Test | Search pipeline integration | Assert direct inquiries return kit and fixture queries attach `kit_sugerido`. |
| Regression Gate | Catalog benchmarks | `node rag.js regresion` enforces 0 false negatives on 86 queries. |

## Migration / Rollout

1. Backwards-compatible: existing search behavior for unmodified queries is 100% preserved.
2. Synchronize sources across `lib/`, `scratch_live/`, and `scripts/`.
3. Verified via `scripts/check_sources_sync.js` and `npm test`.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False positive on individual accessory queries | Low | Strict regex requiring action verb ("instalar", "montar", "colocar", "que necesito para") or explicit "kit para" / "combo para". |
| Over-aggressive upsell | Low | The `kit_sugerido` is an informational field in the search response, leaving the AI Agent in control of friendly presentation. |

## Open Questions

None.
