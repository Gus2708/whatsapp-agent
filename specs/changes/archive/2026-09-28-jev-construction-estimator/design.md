# Design: jev-construction-estimator

## Technical Approach

Implement a deterministic construction materials estimator and task detector for Venezuelan hardware store operations:
1. **Module `lib/construction-estimator.js`**:
   - `estimateConstructionMaterials(task, quantity, options)`: Computes materials and quantities for 5 core tasks:
     - `pegar_bloques`: Cemento gris ($\lceil N/30 \rceil$ sacos), arena lavada ($\lceil (N/30) \times 0.15 \rceil$ $m^3$).
     - `vaciar_piso_losa`: Cemento gris ($\lceil \text{area} \times 0.8 \rceil$ sacos), arena lavada (area * 0.05 $m^3$), piedra picada (area * 0.07 $m^3$), malla truckson ($\text{area}$ $m^2$).
     - `frisar_pared`: Cemento gris ($\lceil \text{area}/7 \rceil$ sacos), arena fina (area * 0.025 $m^3$).
     - `cerca_alambre_pua`: Alambre de púa ($\text{lines} \times \text{meters}$), grapas ($\lceil \text{meters}/50 \rceil$ empaques de 500g).
     - `pintar_superficie`: Pintura (cuñetes if area $\ge 80$, else galones), rodillo, brocha, tirro.
   - `detectConstructionTask(query)`: Detects construction action patterns, normalizes quantities, and flags missing dimensions when unstated.
2. **Search Pipeline Integration (`scratch_live/live_buscar.js`)**:
   - When a query matches a construction task:
     - If dimensions are missing, return `aclarar: true` prompting for area or quantity.
     - If dimensions are present, return an informative response containing the estimated materials and a ready-to-quote `items_presupuesto` string.
3. **Re-export via `lib/serrucho-search.js`**:
   - Make `estimateConstructionMaterials` and `detectConstructionTask` accessible through `serrucho-search`.
4. **Source Parity & Synchronization**:
   - Keep `lib/construction-estimator.js`, `scratch_live/live_buscar.js`, and `scripts/new_buscar.js` synchronized, validated by `scripts/check_sources_sync.js`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Calculation Engine | Pure deterministic formulas in JS | LLM prompt calculation | Sub-millisecond execution (<0.2ms), zero token cost, zero hallucination, repeatable results conforming to Venezuelan trade standards. |
| Pipeline Placement | Intercept in `live_buscar.js` before `missing` fallback | Separate n8n tool | Existing chat workflow routes all customer inquiries through `buscar_productos` or `hacer_presupuesto`. Intercepting here gives instant capability without modifying n8n graph connections. |
| Dimension Handling | Prompt for $m^2$ or count when missing | Guess a default size (e.g. 10m2) | Guessing causes customer confusion and quotes for wrong amounts; asking for square meters is standard trade practice. |
| Quote Integration | Generate `items_presupuesto` string | Raw JSON only | Allows direct seamless piping into `hacer_presupuesto_tool` or `parseItems()`. |

## Architecture Design

### Project Placement

```text
lib/
├── construction-estimator.js
│   └── estimateConstructionMaterials()
        [new] Calculates material quantities for standard construction tasks.
└── serrucho-search.js
    └── detectConstructionTask()
        [new] Re-exports construction task detection and estimation functions.
scratch_live/
└── live_buscar.js
    └── buscar()
        [modify] Intercepts construction task inquiries and returns estimated materials.
scripts/
└── new_buscar.js
    └── buscar()
        [modify] Development reference synchronized with scratch_live.
tests/
└── construction-estimator.test.js
    └── testConstructionEstimator()
        [new] Unit and integration tests for construction estimation.
```

### Data Flow

```text
Customer Inquiry: "¿Qué necesito para vaciar un piso de 20 metros cuadrados?"
                         │
                         ▼
             [detectConstructionTask]
                         │
         Task: "vaciar_piso_losa", Quantity: 20
                         │
                         ▼
          [estimateConstructionMaterials]
                         │
   Materials:
   - Cemento Gris: 16 sacos
   - Arena Lavada: 1.0 m³
   - Piedra Picada: 1.5 m³
   - Malla Truckson: 20 m²
   items_presupuesto: "16 sacos de cemento gris, 1 metro de arena lavada, 1.5 metros de piedra picada, 20 metros de malla truckson"
                         │
                         ▼
               Bot / WhatsApp Response:
   "Para vaciar 20 m² de piso (espesor 10cm) el estimado estándar es:
    • 16 sacos de Cemento Gris
    • 1 m³ de Arena Lavada
    • 1.5 m³ de Piedra Picada
    • 20 m² de Malla Truckson
    ¿Deseas que te prepare la cotización con precios de una vez?"
```

## Interfaces

```typescript
interface EstimatedMaterial {
  nombre: string;
  cantidad: number;
  unidad: string;
}

interface ConstructionEstimateResult {
  tarea: string;
  descripcion_tarea: string;
  cantidad: number;
  unidad_entrada: string;
  materiales: EstimatedMaterial[];
  items_presupuesto: string;
  nota_tecnica: string;
}

interface ConstructionTaskDetection {
  match: boolean;
  tarea?: string;
  cantidad?: number;
  unidad?: string;
  requires_dimension?: boolean;
  mensaje_aclarar?: string;
}

function detectConstructionTask(query: string): ConstructionTaskDetection | null;
function estimateConstructionMaterials(task: string, quantity: number, options?: object): ConstructionEstimateResult;
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | `estimateConstructionMaterials()` across all 5 tasks | Assert exact material quantities and `items_presupuesto` string. |
| Unit Test | `detectConstructionTask()` pattern matching | Assert detection for blocks, slabs, plaster, fencing, painting. |
| Unit Test | Missing dimension clarification | Assert `requires_dimension: true` and clarification prompt. |
| Boundary Test | Direct product inquiries | Assert `detectConstructionTask` returns `null` for "cemento gris", "bloque 10", etc. |
| Integration Test | Search pipeline integration | Assert `live_buscar.js` returns structured estimate instead of `missing`. |
| Regression Gate | Catalog benchmarks | `node rag.js regresion` enforces 0 false negatives across 86 queries. |

## Migration / Rollout

1. 100% backwards-compatible: queries not matching construction tasks pass directly to existing search logic.
2. Synchronize sources across `lib/`, `scratch_live/`, and `scripts/`.
3. Rollback can be performed immediately via Git revert if needed.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Unintended intercept on product search | Low | Strict regex requiring action verb plus target or explicit "cuanto material se va para". |
| Incorrect trade formulas | Low | Calibrated against standard Venezuelan construction maestro ratios with standard safety margins. |
| Source synchronization drift | Low | Verified by automated `scripts/check_sources_sync.js`. |

## Open Questions

None.
