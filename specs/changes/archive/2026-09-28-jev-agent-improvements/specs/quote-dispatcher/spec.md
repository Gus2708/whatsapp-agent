# Delta Spec: quote-dispatcher

## ADDED Requirements

### Requirement: quote-dispatcher/list-routing — Structured Quote Pipeline Handoff
The system MUST direct multi-item inquiries with explicit quantities classified as `quote` directly to the `hacer_presupuesto_tool` pipeline, bypassing single-item product searches.

#### Scenario: Customer requests a budget for multiple items
- GIVEN an incoming customer message listing multiple items with quantities ("hazme presupuesto de 20 metros de cable #12 y 4 bombillos led 12w")
- WHEN the classifier identifies intent `quote` with confidence >= 0.85
- THEN the system routes the message directly to the budgeting pipeline with pre-parsed item candidates.

#### Scenario: Single item price inquiry is treated as product search
- GIVEN an incoming customer message asking for the price of a single product ("cuánto cuesta el cable #12")
- WHEN the intent is classified as `product_inquiry`
- THEN the system routes the query to `buscar_productos` with popularity and stock ranking.
