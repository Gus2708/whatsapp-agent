# Spec: problem-search

## Domain Overview
Domain behavior synchronized from change artifacts.

## Requirements

### Requirement: problem-search/expansion — Problem-to-Solution Mapping
The search engine MUST translate high-confidence problem intents into targeted catalog product families within the matching department.

#### Scenario: Leak repair query maps to waterproofing solutions
- GIVEN a query classified as `goteras_impermeabilizacion`
- WHEN the search resolver evaluates candidate solutions
- THEN candidate queries target `cemento plastico`, `manto asfaltico`, `cinta manto`, and `primer asfaltico` under department `techos_laminas`.

#### Scenario: Plumbing leak query maps to adhesive and sealants
- GIVEN a query classified as `fuga_agua_plomeria`
- WHEN the search resolver evaluates candidate solutions
- THEN candidate queries target `pega pvc`, `teflon`, and `soldadura liquida` under department `plomeria_griferia`.

### Requirement: problem-search/stock-priority — In-Stock Solution Prioritization
The search engine MUST prioritize in-stock solution items and present available pricing in USD and BCV.

#### Scenario: Available cemento plástico prioritized over out-of-stock items
- GIVEN a leak repair query where `Cemento Plastico Covo` is in stock and other items are exhausted
- WHEN search executes solution ranking
- THEN available items appear at the top of results with active stock counts and prices.

### Requirement: problem-search/literal-protection — Protection of Direct Product Queries
The search engine MUST NOT rewrite or distort direct product searches into unrelated problem solutions.

#### Scenario: Customer asking for cemento gris receives cemento gris
- GIVEN a customer query explicitly asking for "saco de cemento gris"
- WHEN search evaluates candidates
- THEN `Cemento Gris CSC 42.5KG` is returned; problem solutions (such as cemento plástico) are not injected.

### Requirement: problem-search/dynamic-expansion — Dynamic Solution Search Expansion
The search engine MUST dynamically expand candidate search queries using extracted `solution_terms` within the target department whenever lexical search on raw problem phrases yields zero results or conflicting cross-department matches.

#### Scenario: Dynamic expansion on zero results
- GIVEN a customer inquiry ("se me despegó una baldosa") where literal matching on "despegó baldosa" yields 0 products
- WHEN the search engine evaluates dynamic `solution_terms` (`["pega piso", "cemento blanco"]`) within department `construccion_aridos`
- THEN the search returns available in-stock items matching *Pega Piso* or *Cemento Blanco*.

#### Scenario: Protection against incidental cross-department hits
- GIVEN a customer inquiry ("tubo que bota agua") where literal matching hits an incidental item from a conflicting department (*Bota de Seguridad*)
- WHEN the search engine detects a department conflict (`calzado` / `seguridad` vs `plomeria_griferia`)
- THEN the engine discards conflicting incidental matches and evaluates dynamic `solution_terms` (`["pega pvc", "teflon"]`) under department `plomeria_griferia`.

#### Scenario: Fail-closed boundary
- GIVEN a customer inquiry with `solution_terms: []` or confidence < 0.80
- WHEN search executes
- THEN dynamic solution expansion is bypassed and standard search behavior executes untouched.
