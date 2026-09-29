# Delta Spec: problem-classifier

## ADDED Requirements

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
