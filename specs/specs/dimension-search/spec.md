# Spec: dimension-search

## Domain Overview
Domain behavior synchronized from change artifacts.

## Requirements

### Requirement: dimension-search/disambiguation — Targeted Dimension Clarification
The search engine MUST detect when a customer inquiry for a multi-dimension product family lacks necessary dimensional parameters, and generate an explicit clarification instruction listing El Serrucho's actual in-stock size options.

#### Scenario: Missing length in roofing sheet inquiry
- GIVEN a customer inquiry ("tienen laminas de zinc?") without specifying sheet length
- WHEN search executes evaluation
- THEN `aclarar: true` is set with an instruction informing the bot of available store lengths (6m, 12 pies / 3.66m, 10 pies / 3.05m, 8 pies / 2.44m).

#### Scenario: Exact dimension bonus when specified
- GIVEN a customer inquiry with exact dimension ("lamina de zinc de 6 metros")
- WHEN search executes scoring
- THEN 6m sheets receive an attribute bonus (+50) and rank at the top, without triggering clarification.

#### Scenario: Fail-closed boundary on single-dimension items
- GIVEN an inquiry for products that do not vary by dimension (e.g. "pala redonda", "saco de cemento")
- WHEN search executes evaluation
- THEN dimensional clarification is not triggered and standard matching returns results normally.
