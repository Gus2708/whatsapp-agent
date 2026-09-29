# Delta Spec: search-alignment

## ADDED Requirements

### Requirement: search-alignment/department-boost — Category Prioritization
The search engine MUST prioritize candidate products belonging to the query's identified department over incidental matches from conflicting departments.

#### Scenario: Zinc roofing query avoids construction mesh
- GIVEN a customer query asking for roofing zinc ("que precio este tipo de sinz de 6 metros")
- WHEN search evaluates candidates with department `techos_laminas`
- THEN `Lamina Techo Galv 6MTS` ranks above any `Malla Electrosoldada 6X6` despite overlapping numeric tokens.

### Requirement: search-alignment/material-guard — Material Compatibility Enforcement
The search engine MUST suppress candidates with conflicting material designations when the query specifies a strict material target.

#### Scenario: Wood disc query avoids metal discs
- GIVEN a customer query specifying a wood cutting disc ("disco de corte de madera de 14")
- WHEN search evaluates candidates
- THEN metal cutting discs (`Disco Corte P/metal`) are penalized or filtered out, leaving wood-compatible blades or clarifying unavailability.

### Requirement: search-alignment/fail-closed — Graceful Global Fallback
The system MUST fall back to global unconstrained search whenever department confidence is low (< 0.80) or unclassified.

#### Scenario: Ambiguous or rare product query
- GIVEN a customer query with ambiguous department or low confidence
- WHEN search evaluates the query
- THEN global search executes without department penalty, preventing false-negative drops.
