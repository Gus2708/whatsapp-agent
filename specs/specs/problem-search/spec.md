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
