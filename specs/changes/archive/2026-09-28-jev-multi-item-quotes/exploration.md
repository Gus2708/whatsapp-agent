# Exploration: jev-multi-item-quotes

## Request Understanding

When customers request quotes on WhatsApp, they rarely format items using strict `name:qty` or comma-separated syntax. They write naturally in conversational Spanish:
1. Conjunctions (*"2 sacos de cemento y 4 tubos 2x1 y 6 láminas de zinc"*).
2. Oxford-style mixed separators (*"2 sacos de cemento, 4 cerchas y 10 tubos 1x1"*).
3. Connective prepositions (*"también", "además", "con", "más"*).
4. Bullet points and numbered lists (*"- 2 sacos de cemento\n* 4 tubos\n1. 3 láminas"*).

The objective is to implement **Robust Multi-Item List Splitting and Parsing** in `lib/serrucho-search.js` and `scratch_live/live_presupuesto.js`:
- Parse natural language lists without losing items connected by "y", "con", "más", etc.
- Clean bullet markers (`-`, `*`, `•`) and numeric list enumerations (`1.`, `2)`).
- Preserve item-level technical attributes (lengths, calibers, presentations) extracted via `extractDepartmentAttributes`.
- Maintain 100% backwards-compatibility with existing `name:qty` formats.

## Current State

In `lib/serrucho-search.js` and `scratch_live/live_presupuesto.js`:
- `parseItems(str)` only splits on `[,;\n]+`.
- If a customer sends `"2 sacos de cemento y 4 tubos 2x1 y 6 laminas de zinc"`, it treats the entire string as a single item (`"cemento y 4 tubos 2x1 y 6 laminas de zinc"` with quantity 2).
- If a customer sends `"2 sacos de cemento, 4 cerchas y 10 tubos 1x1"`, the last item becomes `"cerchas y 10 tubos 1x1"` with quantity 4, and the 10 tubes are completely dropped.
- If bullets are used (`- 2 cemento\n* 4 tubos`), the dash or asterisk remains part of the product name, failing the quantity extraction regex.

## Affected Areas

| Area | Evidence | Why It Matters |
|---|---|---|
| List Tokenizer (`lib/serrucho-search.js`) | `lib/serrucho-search.js: parseItems()` | Single source of truth for parsing raw user and agent quote strings. |
| Quote Execution (`scratch_live/live_presupuesto.js`) | `scratch_live/live_presupuesto.js: parseItems()` | Directly processes the `productos` input in the live n8n quote tool. |
| Development Copy (`scripts/new_presupuesto.js`) | `scripts/new_presupuesto.js` | Must remain identical to `scratch_live/live_presupuesto.js`. |
| Source Synchronization (`scripts/check_sources_sync.js`) | `scripts/check_sources_sync.js` | Verifies `parseItems` parity across all modules. |

## Existing Tests

| Test/File | Relevance | Missing Coverage |
|---|---|---|
| `tests/serrucho-search.test.js` | Tests basic `parseItems` "name:qty" | Only tests standard comma-separated `name:qty` pairs; no coverage for "y" conjunctions or bullets. |
| `tests/department-attributes.test.js` | Single item attribute extraction | Does not test multi-item quote parsing. |
| `rag.js regresion` | 86 baseline catalog queries | Must maintain 0 false negatives. |

## Options

| Option | Pros | Cons | Risk | Effort |
|---|---|---|---|---|
| **Option A: LLM Multi-item JSON Extraction** | Flexible natural language understanding. | 2-3 second latency per quote, token costs, nondeterministic formatting. | High | Medium |
| **Option B: Intelligent Deterministic Pre-Tokenizer (Recommended)** | 1) Sub-millisecond execution. 2) Zero token cost. 3) Correctly splits natural conjunctions ("y", "con", "más", bullets). 4) Strict backwards compatibility. | Requires careful boundary regex to avoid splitting legitimate product names. | Low | Low-Medium |
| **Option C: Client Prompt Instruction Only** | No code changes in tools. | AI Agents frequently miss items when users don't follow comma instructions. | High | Low |

## Recommendation

**Adopt Option B: Intelligent Deterministic Pre-Tokenizer in `parseItems()`.**
1. Normalize and clean input: strip leading bullets (`[-*•]`) and numbered lists (`\b\d+[\.\)]\s+`).
2. Recognize connective split boundaries:
   - Split on `\s+(?:y|e|tambien|ademas|con|mas)\s+(?=(?:\d+\s+|un\s+|una\s+|dos\s+|tres\s+|cuatro\s+|cinco\s+|seis\s+|diez\s+|sacos?|tubos?|laminas?|cabillas?))` when preceding a quantity or product count.
   - Also split on standard delimiters (`[,;\n]+`).
3. For each item:
   - Match prefix quantities: numbers (`2`, `10.5`), written numbers (`un`, `una`, `dos`, `tres`, `cuatro`, `cinco`, `seis`, `diez`).
   - Match postfix quantities: `:qty`, `=qty`, `x qty`.
   - Strip unit wrappers: `sacos?|unidades?|uds?|piezas?|tubos?|metros?|mts|rollos?|cuñetes?|galones?|de|del|la|el|los|las`.
4. Ensure clean item output with `nombre` and `cantidad`.

## Risks

- **Accidental splitting on "y" inside product descriptions** (e.g. "blanco y negro", "cinta y teflon"):
  *Mitigation*: The lookahead strictly requires a subsequent quantity or known product prefix before splitting on "y".
- **Source sync drift**:
  *Mitigation*: Update `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, `scripts/new_presupuesto.js` and verify with `node scripts/check_sources_sync.js`.

## Open Questions

None. The syntax patterns mirror actual customer quote messages recorded in production WhatsApp logs.

## Ready For Planning

**Yes**. Scope is clear, bounded, testable, and backwards-compatible.
