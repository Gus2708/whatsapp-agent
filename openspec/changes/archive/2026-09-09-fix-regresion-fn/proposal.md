# Proposal: Fix LÁMINA Rule Array-Alias Regression (FN #11/#28)

## Intent

The LÁMINA rule (commit `2b065b4`) self-empties its results when the query mentions lámina/zinc but no sub-filter fires. `let lf = unicos` (`live_buscar.js:867`) aliases the array; the tail block (907-909) empties `unicos` then iterates the same emptied array. "lamina de zinc" returns 0 rows → FN #11 ("Que precio este tipo de sinz de 6 metros") and #28 in `node rag.js regresion` (86 cases; 34 flagged, 2 exact FN). "lamina de zinc azul" survives only because `wantAzul` binds a fresh array. SQL rows arrive fine; the bug is post-dedup.

## Scope

### In Scope
- Defensive copy: `let lf = unicos.filter(() => true)` at `live_buscar.js:867` + byte-identical mirror in `new_buscar.js`.
- Optional reversible commit (Phase C): tilde variants in sub-filter regexes (`arquitect\w*` → "arquitectónicas") for #25/#34/#38, only if azul/rojo/prepintada controls stay intact.
- Measurement: `node rag.js regresion` + probes; matchers byte-identical; `npm test` green (incl. `check_sources_sync`).

### Out of Scope
- `n8n_workflow.json` / `boot_serrucho.ps1` (pre-existing mods).
- Regenerating `scratch_live/_coloquial_set.json`.
- 320-case harness (deferred debt; touches only the LÁMINA rule, not global ranking).
- `check_workflow_sync` red (pre-existing, non-blocker).

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `search-accuracy-benchmark`: R5 (zero FN) becomes satisfiable for LÁMINA — delta scenarios for #11/#28 and tilde partials.

## Approach

Phase A (required, one line): `.filter(() => true)` — same idiom as CEMENTO/CABILLA/PINTURA rules. Phase C (optional, separate reversible commit): regex tilde forms, probe-gated. Ranking untouched. Conditional deploy only if ranking changes (it does not — rule returns 0 today).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scratch_live/live_buscar.js` | Modified | LÁMINA line 867 alias → copy |
| `scripts/new_buscar.js` | Modified | Byte-identical mirror |
| `tests/lamina_search.test.js` | Modified | Alias-regression + tilde cases |
| `search-accuracy-benchmark` spec | Modified | Delta scenarios for R5 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Phase C breaks azul/rojo/prepintada | Med | Reversible, probe-gated; skip if controls regress |
| Other lambda queries shift | Low | Same-rule filter; no ranking change |

## Rollback Plan

Revert the Phase A commit (one line, both files). Phase C: revert its own commit. Re-run `regresion` + probes after any revert.

## Dependencies

- None external. Requires `node rag.js regresion` (~2 min) and two probes.

## Success Criteria

- [ ] `regresion`: #11/#28 no longer flagged; FN 2 → 0; 34 flags reduced.
- [ ] Probe "lamina de zinc" ≥ 1 result (today 0); control "lamina de zinc azul" still 4.
- [ ] Phase C (if taken): #25/#34/#38 flags reduced; azul/rojo/prepintada probes unchanged.
- [ ] Matchers byte-identical; `npm test` green incl. `check_sources_sync`; no deploy (conditional documented).