# Delta Spec: problem-search

## ADDED Requirements

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
