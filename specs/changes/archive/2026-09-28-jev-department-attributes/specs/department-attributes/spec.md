# Delta Spec: department-attributes

## ADDED Requirements

### Requirement: department-attributes/extraction — Deterministic Attribute Extraction
The system MUST deterministically extract technical dimensions, calibers, presentations, and quality grades from customer queries across core hardware macro-departments.

#### Scenario: Roofing length and caliber extraction
- GIVEN a customer inquiry ("precio de lamina de zinc de 6 metros calibre 30")
- WHEN `extractDepartmentAttributes()` evaluates the query under department `techos_laminas`
- THEN the system extracts `length: "6m"` and `caliber: "30"`.

#### Scenario: Structural iron dimension and thickness extraction
- GIVEN a customer inquiry ("tubo de herreria 2x1 de 1.1 milimetros")
- WHEN `extractDepartmentAttributes()` evaluates the query under department `hierro_perfiles`
- THEN the system extracts `dimension: "2x1"` and `thickness: "1.1mm"`.

#### Scenario: Paint presentation, class, and finish extraction
- GIVEN a customer inquiry ("cuñete de pintura clase b blanca caucho")
- WHEN `extractDepartmentAttributes()` evaluates the query under department `pinturas`
- THEN the system extracts `presentation: "cuñete"`, `grade_class: "b"`, `finish: "caucho"`, and `color: "blanco"`.

#### Scenario: Plumbing pipe diameter extraction
- GIVEN a customer inquiry ("tubo de agua 1/2 pulgada")
- WHEN `extractDepartmentAttributes()` evaluates the query under department `plomeria_griferia`
- THEN the system extracts `diameter: "1/2"`.
