# Spec: problem-classifier

## Domain Overview
Domain behavior synchronized from change artifacts.

## Requirements

### Requirement: problem-classifier/intent — Functional Repair Intent Classification
The system MUST classify customer problem descriptions into authoritative repair intent categories using Jev System 1 with calibrated confidence.

#### Scenario: Customer inquires about roof leaks
- GIVEN an incoming customer message describing a roof leak ("buenas tardes algo para tapar una gotera en el techo")
- WHEN the classifier evaluates the message
- THEN the system assigns `problem_intent` to `goteras_impermeabilizacion` and `department` to `techos_laminas` with confidence >= 0.80.

#### Scenario: Customer inquires about plumbing leaks
- GIVEN an incoming customer message describing a leaking pipe ("para pegar un tubo de agua que bota")
- WHEN the classifier evaluates the message
- THEN the system assigns `problem_intent` to `fuga_agua_plomeria` and `department` to `plomeria_griferia` with confidence >= 0.80.

#### Scenario: Customer inquires about rust treatment
- GIVEN an incoming customer message describing rusted iron gates ("algo para quitar el oxido de las rejas")
- WHEN the classifier evaluates the message
- THEN the system assigns `problem_intent` to `oxido_corrosion` and `department` to `pinturas` with confidence >= 0.80.

### Requirement: problem-classifier/fail-closed — Direct Product & Ambiguity Preservation
The system MUST preserve standard search execution when the query is a specific product inquiry or when problem classification is uncertain.

#### Scenario: Direct product inquiry
- GIVEN an incoming query naming a specific catalog product ("saco de cemento gris", "cable 12 awg")
- WHEN the classifier evaluates the message
- THEN `problem_intent` is assigned to `ninguno_o_especifico` and no problem expansion is performed.

#### Scenario: Ambiguous query with low confidence
- GIVEN an incoming query with problem confidence < 0.80
- WHEN the classifier evaluates the message
- THEN the system treats `problem_intent` as inactive and executes standard catalog search.

### Requirement: problem-classifier/dynamic-slot — Dynamic Solution Terms Slot Extraction
The system MUST extract 1 to 3 generic hardware solution terms (`solution_terms`) alongside macro-department classification when a customer describes a repair or functional problem, without relying on static enum categories.

#### Scenario: Open repair inquiry (loose tile)
- GIVEN an incoming customer inquiry describing a loose tile ("se me despegó una baldosa del piso")
- WHEN Jev System 1 evaluates the message
- THEN the system extracts `solution_terms: ["pega piso", "cemento blanco"]` and `department: "construccion_aridos"` with confidence >= 0.80.

#### Scenario: Mechanical repair inquiry (squeaky door)
- GIVEN an incoming customer inquiry describing a squeaky door ("la puerta rechina mucho que le echo")
- WHEN Jev System 1 evaluates the message
- THEN the system extracts `solution_terms: ["aflojatodo", "grasa"]` and `department: "herramientas_discos"` with confidence >= 0.80.

#### Scenario: Direct product inquiry sets empty solution terms
- GIVEN an incoming customer inquiry naming a specific catalog product ("disco de corte metal 4 1/2", "cable 12 awg")
- WHEN Jev System 1 evaluates the message
- THEN `solution_terms` is an empty array `[]` and direct product search executes without solution replacement.
