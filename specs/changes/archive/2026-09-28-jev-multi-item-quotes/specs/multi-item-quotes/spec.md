# Delta Spec: multi-item-quotes

## ADDED Requirements

### Requirement: multi-item-quotes/natural-delimiter-splitting — Natural Language Item Splitting
The parser MUST split conversational multi-item inputs into distinct items when connected by Spanish conjunctions and connective adverbs (`y`, `e`, `con`, `mas`, `más`, `ademas`, `además`, `tambien`, `también`) followed by a quantity or item indicator, without mangling product names.

#### Scenario: Customer sends items connected by conjunctions
- GIVEN a customer request `"2 sacos de cemento y 4 tubos 2x1 y 6 laminas de zinc"`
- WHEN `parseItems(str)` is invoked
- THEN it returns 3 items:
  1. `{ nombre: 'cemento', cantidad: 2 }`
  2. `{ nombre: 'tubos 2x1', cantidad: 4 }`
  3. `{ nombre: 'laminas de zinc', cantidad: 6 }`

#### Scenario: Mixed commas and terminal conjunction (Oxford list)
- GIVEN a request `"2 sacos de cemento, 4 cerchas y 10 tubos 1x1"`
- WHEN `parseItems(str)` is invoked
- THEN it parses all 3 items without dropping the final 10 tubes.

#### Scenario: Conjunction inside product name is not split
- GIVEN an item name `"pintura blanco y negro"` or `"bombillo sol y sombra"` without a subsequent quantity
- WHEN `parseItems(str)` is invoked
- THEN the name is preserved as a single item and NOT split.

### Requirement: multi-item-quotes/bullet-and-marker-cleaning — List Marker Normalization
The parser MUST strip bullet symbols (`-`, `*`, `•`) and numeric enumeration prefixes (`1.`, `2)`) from raw lines and tokens so they do not contaminate product names or impede quantity matching.

#### Scenario: Multi-line bulleted list
- GIVEN an input:
  ```
  - 2 sacos de cemento
  * 4 tubos
  • 1 manto asfaltico
  ```
- WHEN `parseItems(str)` is invoked
- THEN it yields 3 clean items without leading `-`, `*`, or `•` in `nombre`.

### Requirement: multi-item-quotes/written-quantity-parsing — Written Number Extraction
The parser MUST recognize Spanish cardinal numbers (`un`, `una`, `dos`, `tres`, `cuatro`, `cinco`, `seis`, `siete`, `ocho`, `nueve`, `diez`) as numeric quantities at item boundaries.

#### Scenario: Customer specifies quantities as words
- GIVEN `"un cuñete de pintura y dos sacos de cemento"`
- WHEN `parseItems(str)` is invoked
- THEN it returns:
  1. `{ nombre: 'pintura', cantidad: 1 }`
  2. `{ nombre: 'cemento', cantidad: 2 }`

### Requirement: multi-item-quotes/backwards-compatibility — Strict Syntax Backwards Compatibility
The parser MUST remain 100% backwards-compatible with existing colon (`name:qty`), equals (`name=qty`), and multiplication (`name x qty`) syntaxes.

#### Scenario: Legacy colon and comma format
- GIVEN `"cemento:2, tubos 2x1:4"`
- WHEN `parseItems(str)` is invoked
- THEN it parses accurately into `{ nombre: 'cemento', cantidad: 2 }` and `{ nombre: 'tubos 2x1', cantidad: 4 }`.
