# Delta Spec: installation-kits

## ADDED Requirements

### Requirement: installation-kits/intent-detection — Installation Query Intent Detection
The system MUST detect when a customer asks what is needed to install a fixture or asks explicitly for an installation kit, identifying the target fixture category.

#### Scenario: Customer asks what is needed to install a toilet
- GIVEN a customer query `"qué necesito para instalar una poceta"` or `"materiales para montar un inodoro"`
- WHEN `detectInstallationQuery(query)` is executed
- THEN it returns a match with category `sanitario_poceta`.

#### Scenario: Customer asks for a sink installation kit
- GIVEN a customer query `"kit de instalacion para lavamanos"` or `"combo para instalar fregadero"`
- WHEN `detectInstallationQuery(query)` is executed
- THEN it returns a match with category `lavamanos` or `fregadero`.

### Requirement: installation-kits/kit-resolution — Deterministic Accessory Kit Definitions
The system MUST provide calibrated lists of complementary accessories for standard Venezuelan hardware fixtures, with item names, quantities, technical notes, and quote-ready `items_presupuesto` strings.

#### Scenario: Toilet installation kit resolution
- GIVEN target category `sanitario_poceta`
- WHEN `getInstallationKit('sanitario_poceta')` is executed
- THEN it returns items:
  - `herraje para poceta` (1 unidad)
  - `canilla para poceta` (1 unidad, 1/2 x 7/8)
  - `llave de arresto` (1 unidad, 1/2)
  - `cuello de cera` (1 unidad)
  - `tornillos de fijacion para poceta` (1 juego)
  - `teflon` (1 rollo)
  - and `items_presupuesto` formatted for `parseItems()`.

#### Scenario: Kitchen sink installation kit resolution
- GIVEN target category `fregadero`
- WHEN `getInstallationKit('fregadero')` is executed
- THEN it returns items:
  - `griferia de fregadero`
  - `canillas para fregadero`
  - `contracanasta para fregadero`
  - `sifon para fregadero`
  - `silicon transparente`
  - `teflon`

### Requirement: installation-kits/complementary-upsell-attachment — Upsell Attachment on Primary Fixture Search
When a customer searches for a primary fixture in the catalog, the system MUST identify if an installation kit is relevant and attach `kit_sugerido` to the search response envelope without replacing the primary product results.

#### Scenario: Customer searches for toilet
- GIVEN a search query `"poceta"` or `"inodoro blanco"`
- WHEN the search pipeline executes and finds matching fixtures
- THEN the response includes `kit_sugerido` containing the toilet installation kit metadata and sales advice.

#### Scenario: Customer searches for roofing sheets
- GIVEN a search query `"lamina de zinc"` or `"lamina arquitectonica"`
- WHEN the search pipeline executes
- THEN the response includes `kit_sugerido` for roofing accessories (ganchos de techo, caballete, sellador).

### Requirement: installation-kits/fail-closed-boundaries — Accessory Search Preservation
The system MUST NOT intercept queries that specifically search for a single accessory product, allowing them to proceed directly to regular catalog search.

#### Scenario: Direct accessory search
- GIVEN `"canilla para poceta"`, `"herraje de inodoro"`, or `"gancho para techo"`
- WHEN `detectInstallationQuery(query)` is executed
- THEN it returns `null`.
