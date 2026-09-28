# Spec: construction-estimator

## Domain Overview
Domain behavior synchronized from change artifacts.

## Requirements

### Requirement: construction-estimator/task-detection — Construction Task Intent Detection
The system MUST detect when a customer asks for materials for a construction or renovation project and extract the task type and project dimension.

#### Scenario: Customer asks for materials to lay blocks
- GIVEN a customer message `"cuanto material se va para pegar 200 bloques"`
- WHEN `detectConstructionTask(query)` is executed
- THEN it identifies task `pegar_bloques` with quantity `200` and unit `bloques`.

#### Scenario: Customer asks for materials to pour a slab/floor
- GIVEN a customer message `"que necesito para vaciar una placa de 20 metros cuadrados"`
- WHEN `detectConstructionTask(query)` is executed
- THEN it identifies task `vaciar_piso_losa` with quantity `20` and unit `m2`.

### Requirement: construction-estimator/material-calculation — Calibrated Material Estimation
The system MUST calculate required material quantities using standard Venezuelan construction formulas and format both human-readable advice and `items_presupuesto` strings.

#### Scenario: Material calculation for 200 blocks
- GIVEN task `pegar_bloques` with quantity `200`
- WHEN `estimateConstructionMaterials(task, 200)` is invoked
- THEN it returns:
  - Cemento gris: 7 sacos
  - Arena lavada: 1 m³
  - `items_presupuesto`: `"7 sacos de cemento gris, 1 metro de arena lavada"`

#### Scenario: Material calculation for 20m² concrete slab
- GIVEN task `vaciar_piso_losa` with quantity `20`
- WHEN `estimateConstructionMaterials(task, 20)` is invoked
- THEN it returns:
  - Cemento gris: 16 sacos
  - Arena lavada: 1 m³
  - Piedra picada: 1.5 m³
  - Malla truckson: 20 m²

### Requirement: construction-estimator/missing-dimension-clarification — Dimension Disambiguation
When an inquiry targets a construction task without providing dimensions, the system MUST return a clarification request asking for the size or square meters.

#### Scenario: Inquiry without dimensions
- GIVEN `"que materiales necesito para vaciar un piso"`
- WHEN `detectConstructionTask(query)` is executed
- THEN it returns `requires_dimension: true` with a clarification message asking for the area in square meters.

### Requirement: construction-estimator/fail-closed-boundaries — Direct Product Search Boundary
The task detector MUST return `null` for direct product inquiries so they proceed to regular catalog search without interference.

#### Scenario: Direct product search
- GIVEN `"bloque 10"`, `"cemento gris"`, or `"cabilla 1/2"`
- WHEN `detectConstructionTask(query)` is executed
- THEN it returns `null`.
