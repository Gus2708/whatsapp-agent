# Proposal: jev-multi-item-quotes

## Intent

When customers request quotes on WhatsApp, they rarely format items using strict `name:qty` or comma-separated syntax. They write naturally in conversational Spanish:
1. Conjunctions (*"2 sacos de cemento y 4 tubos 2x1 y 6 láminas de zinc"*).
2. Oxford-style mixed separators (*"2 sacos de cemento, 4 cerchas y 10 tubos 1x1"*).
3. Connective prepositions (*"también", "además", "con", "más"*).
4. Bullet points and numbered lists (*"- 2 sacos de cemento\n* 4 tubos\n1. 3 láminas"*).
5. Written number quantities (*"un cuñete de pintura y dos sacos de cemento"*).

Currently, `parseItems(str)` only splits on `[,;\n]+`. Consequently:
- Conjunction-connected items are merged into a single mangled item (`"cemento y 4 tubos 2x1 y 6 laminas de zinc"` with quantity 2).
- Comma-conjunction lists drop the final items entirely (`"cerchas y 10 tubos 1x1"` with quantity 4).
- Bullet symbols (`-`, `*`, `•`) break leading quantity regexes and contaminate product search queries.

This proposal upgrades `parseItems` across all search and quote modules into an intelligent deterministic multi-item list tokenizer that accurately identifies item boundaries, normalizes quantities, cleans bullet and numeric list noise, and preserves technical product attributes.

## Scope

### In Scope

- **Natural Delimiter Splitting**: Intelligently split on conjunction boundaries (` y `, ` e `, ` con `, ` más `, ` mas `, ` ademas `, ` además `, ` tambien `, ` también `) when followed by a quantity or item indicator, alongside standard delimiters (`[,;\n]+`).
- **Bullet & Numbered List Normalization**: Strip bullets (`-`, `*`, `•`) and enumerated list markers (`1.`, `2)`, etc.) cleanly from each line or token.
- **Prefix & Written Quantity Extraction**: Support written numbers (`un`, `una`, `dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve`, `diez`, `medio`) as numeric quantities in addition to standard digits.
- **Postfix Syntax Support**: Retain and normalize `:qty`, `=qty`, `x qty`, `(qty)`.
- **Measurement & Unit Stripping**: Clean unit wrappers (`sacos`, `tubos`, `láminas`, `cuñetes`, `galones`, `metros`, `unidades`, `piezas`, `de`, `del`) without corrupting internal dimensions (e.g. `2x1`, `1/2`, `3.66m`).
- **Source Synchronization**: Synchronize `parseItems` identically across `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js`, passing `scripts/check_sources_sync.js`.
- **Zero Regression**: Pass all 86 benchmark queries in `node rag.js regresion` with 0 false negatives, and pass all existing unit tests in `npm test`.

### Out of Scope

- Modifying catalog stock or pricing RPCs.
- Altering BCV exchange rate calculations or recargo percentages.
- LLM-based API calls inside `parseItems` (the parser must remain deterministic, sub-millisecond, and zero-cost).

## Capabilities

### New Capabilities

- `multi-item-list-tokenizer`: Deterministic splitting of conversational WhatsApp item lists containing conjunctions, mixed commas, bullets, and written quantities.
- `written-quantity-normalization`: Translating Spanish written numbers into valid numeric counts (`un` -> 1, `dos` -> 2, etc.) at item boundaries.

### Modified Capabilities

- `parse-items`: Enhanced `parseItems()` function supporting conversational list parsing while maintaining 100% backwards compatibility with `name:qty`.

## Approach

1. **Pre-processing & Line Tokenization**:
   - Normalize whitespace and strip list bullets (`[-*•]`) and numbered markers (`^\s*\d+[\.\)]\s*`).
2. **Boundary-Aware Conjunction Splitting**:
   - Split tokens using a lookahead regex:
     `\s+(?:y|e|con|mas|más|ademas|además|tambien|también)\s+(?=(?:\d+(?:\.\d+)?\s+|un\s+|una\s+|dos\s+|tres\s+|cuatro\s+|cinco\s+|seis\s+|siete\s+|ocho\s+|nueve\s+|diez\s+|sacos?|tubos?|laminas?|láminas?|cabillas?|cuñetes?|galones?|rollos?|cajas?))`
   - Standard delimiter splitting on `[,;\n]+` remains active.
3. **Quantity Extraction & Number Word Parsing**:
   - Parse written numbers: `{"un": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10}`.
   - Extract prefix quantities (`2 sacos de cemento`, `dos sacos de cemento`).
   - Extract postfix quantities (`cemento:2`, `cemento x 2`, `cemento (2)`).
4. **Unit Stripping**:
   - Strip leading unit counters (`sacos de`, `tubos de`, etc.) without touching dimensions or brand words.
5. **Deduplication & Sanitization**:
   - Ensure clean product query strings (`nombre`) and valid positive quantities (`cantidad`).

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `lib/serrucho-search.js` | High | Upgraded `parseItems()` implementation. |
| `scratch_live/live_presupuesto.js` | High | Upgraded `parseItems()` implementation in live n8n quote tool. |
| `scripts/new_presupuesto.js` | High | Synchronized development copy. |
| `tests/multi-item-quotes.test.js` | High | Dedicated test suite covering conversational list parsing scenarios. |
| `scripts/check_sources_sync.js` | Low | Verification of synchronized source files. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Splitting product names containing "y" (e.g. "blanco y negro", "sol y sombra") | Low | The regex requires a strict positive lookahead for a quantity or unit before treating "y" as a list delimiter. |
| Splitting dimension "x" as a multiplication quantity | Low | Dimensions like `2x1` or `100x100` are protected by `normMedida` rules and quantity postfix regexes require whitespace or end-of-string. |
| Source synchronization drift | Low | Run `node scripts/check_sources_sync.js` as an automated gate. |

## Rollback Plan

1. Revert `parseItems()` in `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js` to the previous single-delimiter implementation.
2. Run `scripts/check_sources_sync.js` and `npm test` to verify.

## Success Criteria

- `"2 sacos de cemento y 4 tubos 2x1 y 6 láminas de zinc"` correctly parses into 3 distinct items:
  1. `{ nombre: 'cemento', cantidad: 2 }`
  2. `{ nombre: 'tubos 2x1', cantidad: 4 }`
  3. `{ nombre: 'láminas de zinc', cantidad: 6 }`
- `"2 sacos de cemento, 4 cerchas y 10 tubos 1x1"` parses into 3 distinct items without dropping the final 10 tubes.
- `"- 2 cemento\n* 4 tubos\n• 1 manto"` cleanly parses without bullet artifacts.
- `"un cuñete de pintura y dos sacos de cemento"` parses into 2 items with quantities 1 and 2.
- Backwards compatibility: `"cemento:2, tubos:4"` still parses identically.
- 0 false negatives across all 86 queries in `node rag.js regresion`.
- 100% pass on all unit tests (`npm test`).

## Open Questions

None.

## Verification Plan

### Automated Tests

- `node --test tests/multi-item-quotes.test.js`: Comprehensive testing of natural language lists, conjunctions, bullets, written quantities, and backwards compatibility.
- `node scripts/check_sources_sync.js`: Enforce zero source drift across `lib/serrucho-search.js`, `scratch_live/live_presupuesto.js`, and `scripts/new_presupuesto.js`.
- `node rag.js regresion`: Verify 0 false negatives on 86 benchmark queries.
- `npm test`: Enforce 221+ passing unit tests.

### Manual Verification

- Test quotes with multi-item conversational strings using `scripts/test_live_node.js` or direct execution of `live_presupuesto.js`.
