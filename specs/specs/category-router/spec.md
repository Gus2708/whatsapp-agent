# Spec: category-router

## Domain Overview
Domain behavior synchronized from change artifacts.

## Requirements

### Requirement: category-router/department — Macro-Department Classification
The system MUST classify product inquiries into authoritative store departments using Jev System 1 with calibrated confidence.

#### Scenario: Customer inquires about roofing sheets
- GIVEN an incoming customer message asking about roofing ("¿qué precio este tipo de sinz de 6 metros?")
- WHEN the classifier evaluates the message with department classification
- THEN the system assigns department `techos_laminas` with confidence >= 0.80.

#### Scenario: Customer inquires about electrical wiring
- GIVEN an incoming customer message asking for wire ("cable #12 rojo por metro")
- WHEN the classifier evaluates the message with department classification
- THEN the system assigns department `electricidad_cables` with confidence >= 0.85.

#### Scenario: Customer inquires about cutting discs
- GIVEN an incoming customer message asking for cutting discs ("disco de corte de madera de 14 pulgadas")
- WHEN the classifier evaluates the message with department classification
- THEN the system assigns department `herramientas_discos` with confidence >= 0.85.

### Requirement: category-router/material — Material Slot Extraction
The system MUST extract specific material targets (`madera`, `metal`, `concreto`) to prevent incompatible tool matching.

#### Scenario: Wood cutting disc specification
- GIVEN an incoming query specifying a cutting disc for wood ("disco para madera 14 pulg")
- WHEN the classifier parses the material slot
- THEN `material_target` is set to `madera`.

#### Scenario: Unspecified material defaults to open search
- GIVEN an incoming query with no material specification ("disco de 4-1/2")
- WHEN the classifier parses the material slot
- THEN `material_target` is `null` and search evaluates all available materials.
