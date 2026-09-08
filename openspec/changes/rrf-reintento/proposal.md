# Proposal: Hybrid Vector Adoption & Regression Isolation

> **STATUS 2026-09-08 (cierre)**: completado con veredicto medido — ver sección
> [Result](#result-veredicto-final-2026-09-08). Resumen: A3 + recalibración integrados en el
> código del repo; **gate REJECTED (4,1 pts < 5) → sin deploy**; Phase C: `b439c4a`/`c33e0b0`
> inocentes (caída externa); regresión: 2 FN **pre-existentes** (delta 0 vs baseline).

## Intent

Attempt 4 (`0c31b52`) left the vector dormant: vec 231 = sinvec 231, gap 0 REJECTED, vs historical 246/320 (76.9%). The old "category differs" rule recovered the vector's +7 but broke `tapa para el baño`. Restore the vector contribution with a hybrid adoption rule (no attempt-4 bugs, no regression) and isolate the 244→231 drop (`b439c4a`, `c33e0b0`) to beat 76.9%.

> **Corrección de atribución (2026-09-08)**: el gap 0 del 07-09 fue medición **sin vector**
> (OPENAI_API_KEY vacía + egress geo-bloqueado por OpenAI): ambos lados corrieron el camino
> frío idéntico. No era "el intento 4 neutralizó el vector". La premisa de este cambio era
> válida: re-medir caliente era la única forma de saber el aporte real.

## Scope

### In Scope

1. **A3 (main)**: hybrid adoption in vector rescue: `scratch_live/live_buscar.js` + `scripts/new_buscar.js` (byte-identical; `check_sources_sync` in `npm test`): adopt if `simLex < UMBRAL_LEXICO_FIABLE` OR (category differs AND top vector sim ≥ 0.55).
2. **C**: on-disk A/B (no prod) of `b439c4a` / `c33e0b0`; fold confirmed fix in.
3. Measure on cached set: `vec-new` vs `sinvec-new` + gate, 86 regression, `npm test`.
4. Deploy via `deploy_nodos.js` if gate passes.

### Out of Scope

- Real RRF (Opción B): DEFERRED — needs family dedupe; only if gate < 5 after A3+C.
- `n8n_workflow.json` (pre-existing worktree mod); `_coloquial_set.json` (versioned); non-A3 matcher changes.

## Capabilities

### New Capabilities

- `hybrid-vector-adoption`: thresholds, byte-sync guard, gate evidence, regression protections.

### Modified Capabilities

- `search-accuracy-benchmark`: R4 subject → deployed hybrid rule; gate mechanics unchanged.

## Approach

Keep `_falta` trigger; adopt when `simLex < 0.52 || (categoriaDiff && _vec[0].similitud >= 0.55)`. Probe `disco de corte` (NOT adopted) and `tapa para el baño` (adopted). C: full harness per suspect commit from disk; fold confirmed fix. Then gate (gap ≥ 5), `regresion` 0 FN, `npm test`.

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `scratch_live/live_buscar.js` | Modified | hybrid adoption (A3) |
| `scripts/new_buscar.js` | Modified | byte-identical + guard |
| `RAG.md`, `plans/010-*.md` | Modified | verdict + deferrals (R7) |
| `scripts/deploy_nodos.js` | Used | deploy if gate passes |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reintroduce disco/tapa bugs | Med | probe both before/after |
| 0.55 fragile (margin 0.399–0.606) | Med | keep simLex branch |
| HNSW noise (1–2 diffs) | High | 320 A/B only; 5-pt gate |
| C inconclusive (env drift) | Med | scope to mechanical suspects |
| Latency/cost | Low | still gated by `_falta` |

## Rollback Plan

`git checkout -- scratch_live/live_buscar.js scripts/new_buscar.js`; redeploy via `deploy_nodos.js` if deployed. C fixes are separate reversible commits.

## Dependencies

Supabase for harness (~16 min); cached set; sync guard.

## Success Criteria

- [x] `vec-new` > 246/320 (76.9%) — ❌ NO (244/320; la condición exacta era 246)
- [x] `sin historial` ≥ 75.6% —
  - ✅ 96/123 (78,0%) en vec-new
  - ❌ 93/123 (75,6%) en sinvec-new (justo en la línea; 75,591 → redondeo 75,6)
- [x] 0 FN on `regresion` (86 cases) — ❌ 2 FN pre-existentes (`#11 sinz`, `#28 lamina de zinc`; baseline `b1e8823` idéntico, delta 0 — criterio "0 FN" ya roto antes del cambio, no es regresión de este cambio)
- [x] Gate gap ≥ 5 pts — ❌ **4,1 pts → REJECTED, no deploy** (el vector vivo aporta +13 reales: 244 vs 231, pero no cruza la barra)
- [x] `new_buscar.js` byte-identical; `npm test` green — ✅ byte-idénticos (hash `74fb22d5…`); `tests/**/*.test.js` 118/118 + `check_sources_sync` OK; `check_workflow_sync` RED pre-existente fuera de alcance (n8n_workflow.json no se toca)
- [x] disco/tapa probes correct — ✅ disco NO adoptado / tapa SÍ adoptada (post recalibración 0.55)
- [x] `n8n_workflow.json` untouched — ✅ sin cambios en el diff del cambio

## Result (veredicto final 2026-09-08)

- **A3 + recalibración quedan committed en el repo** (`6f9778e`, `1a7ce70`, `c3b7484`, `b4213ef`)
  **pero NO desplegados**: el gate honesto dio **4,1/5 pts** (vec-new 244/320 vs sinvec-new
  231/320, vector vivo vía override local OpenRouter) → la rama condicional de deploy no abre.
- **Phase C**: 4 corridas calientes A/B de `b439c4a`/`c33e0b0` todas 243/320 (after==before) →
  **inocentes**; la caída 246→231 no se reproduce caliente (deuda externa: popularidad/
  vocabulario regenerados de noche).
- **Regresión**: 2 FN pre-existentes (delta 0), documentados en RAG.md §6/§7.
- Deferrals: **RRF diferido** (requiere dedupe por familia; solo si gate ≥ 5 tras A3 — ahora
  mismo el gate está < 5, no reintentar sin el prerrequisito).
- Comandos/cometido y evidencia por fase: `openspec/changes/rrf-reintento/apply-progress.md`.