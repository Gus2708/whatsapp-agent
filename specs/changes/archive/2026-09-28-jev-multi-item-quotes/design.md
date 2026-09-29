# Design: jev-multi-item-quotes

## Technical Approach

Upgrade `parseItems(str)` across `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js` into an intelligent deterministic multi-item list tokenizer:
1. **Pre-processing**:
   - Normalize string, strip leading list markers (e.g. `-`, `*`, `•`, `\d+[\.\)]`).
2. **Boundary-Aware Conjunction Splitting**:
   - Rather than relying solely on `[,;\n]+`, identify natural language boundaries:
     - Look for conjunctions: `y`, `e`, `con`, `mas`, `más`, `ademas`, `además`, `tambien`, `también`.
     - Boundary rule: Conjunction must be preceded by whitespace and followed by either:
       a) A quantity indicator: digits (`\d+`), written numbers (`un`, `una`, `dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve`, `diez`, `medio`), OR
       b) A recognized unit/item keyword (`sacos?`, `tubos?`, `laminas?`, `láminas?`, `cabillas?`, `cuñetes?`, `galones?`, `rollos?`, `cajas?`, `piezas?`, `unidades?`, `barras?`, `pliegos?`).
3. **Item Parsing & Quantity Extraction**:
   - Strip leading list symbols (`[-*•]`) and enumeration prefixes (`^\s*\d+[\.\)]\s*`).
   - Extract prefix written numbers (`un`, `una`, `dos`, etc.) and convert to numeric `cantidad`.
   - Extract prefix numeric digits (`2 sacos de cemento`, `2.5 metros de cable`).
   - Extract postfix formats (`cemento:2`, `cemento=2`, `cemento x 2`, `cemento (2)`).
   - Strip unit qualifiers (`sacos?`, `unidades?`, `uds?`, `piezas?`, `metros?`, `mts`, `cuñetes?`, `galones?`, `de`, `del`, `la`, `el`, `los`, `las`) while preserving dimensional descriptions (`2x1`, `1/2`, `3.66m`).
4. **Source Parity & Synchronization**:
   - Keep the tokenizer implementation synchronized across `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js`.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Tokenization Engine | Deterministic Regex Tokenizer | LLM Agent Call | Sub-millisecond latency, zero token cost, zero hallucination, predictable execution in production n8n workflows. |
| Boundary Lookahead | Conjunction + Quantity/Unit Lookahead | Blind split on "y" / "con" | Prevents false splits on product names containing conjunctions (e.g. "blanco y negro", "sol y sombra", "pega y sella"). |
| Written Number Range | 1 to 10 + fractions (`medio`) | Full text-to-number parser (0-1000) | WhatsApp quote messages in production overwhelmingly use 1-10 written in words ("un saco", "dos tubos", "tres rollos"). Larger quantities are written in digits. Keeps footprint small and fast. |
| Source Placement | Synced in `lib/serrucho-search.js` & quote scripts | Central import in n8n | n8n Code nodes run as self-contained JS snippets in execution containers; core logic must be synced and validated via `check_sources_sync.js`. |

## Architecture Design

### Project Placement

```text
lib/
└── serrucho-search.js
    └── parseItems()
        [modify] Deterministic list tokenizer with conjunction splitting, written numbers, and bullet stripping.
scratch_live/
└── live_presupuesto.js
    └── parseItems()
        [modify] Live n8n quote tool implementation synchronized with lib.
scripts/
└── new_presupuesto.js
    └── parseItems()
        [modify] Development reference synchronized with scratch_live.
tests/
└── multi-item-quotes.test.js
    └── testMultiItemQuotes()
        [new] Dedicated test suite for natural language multi-item quotes.
```

### Data Flow

```text
Raw WhatsApp String:
"2 sacos de cemento y 4 tubos 2x1 y 6 laminas de zinc"
                 │
                 ▼
[Conjunction Lookahead Splitter]
   Tokens:
   1: "2 sacos de cemento"
   2: "4 tubos 2x1"
   3: "6 laminas de zinc"
                 │
                 ▼
[Per-Item Quantity & Unit Extractor]
   1: { cantidad: 2, nombre: "cemento" }
   2: { cantidad: 4, nombre: "tubos 2x1" }
   3: { cantidad: 6, nombre: "laminas de zinc" }
                 │
                 ▼
[Quote Search Pipeline (Parallel)]
   Promise.all(items.map(it => buscarUno(it.nombre)))
                 │
                 ▼
Formatted Markdown Budget Quote & BCV Total
```

## Interfaces

```typescript
interface ParsedItem {
  nombre: string;
  cantidad: number;
}

function parseItems(str: string): ParsedItem[];
```

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit Test | Conjunction splitting ("y", "e", "con", "más", "ademas", "tambien") | Assert clean item lists without dropped items. |
| Unit Test | Bullet points and numbered lists (`-`, `*`, `•`, `1.`, `2)`) | Assert removal of markers from item names. |
| Unit Test | Written numbers ("un", "dos", "tres", etc.) | Assert correct quantity conversion. |
| Unit Test | Backwards compatibility (`name:qty`, `name x qty`) | Assert identical behavior to existing parser. |
| Integration Test | Parity check | `node scripts/check_sources_sync.js` verifies identical `parseItems` across all files. |
| Regression Gate | Catalog benchmarks | `node rag.js regresion` enforces 0 false negatives across 86 queries. |

## Migration / Rollout

1. 100% backwards-compatible: existing `name:qty` and comma-separated inputs continue to produce identical outputs.
2. Synchronize sources across `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js`.
3. Rollback can be performed immediately via Git revert if needed.

## Technical Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| False split on product names containing "y" (e.g. "blanco y negro") | Low | The conjunction lookahead strictly requires a subsequent quantity or recognized unit before splitting. |
| Unit stripping removing necessary dimensions | Low | Dimension terms (`2x1`, `1/2`, `3.66m`) are untouched by unit stripping regexes. |
| Code drift between n8n tool and lib | Low | Verified by automated `scripts/check_sources_sync.js`. |

## Open Questions

None.
