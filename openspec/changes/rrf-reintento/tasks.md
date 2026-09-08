# Tasks: Hybrid Vector Adoption & Regression Isolation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~320–420 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (pre-approved) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | A3+C+gate+docs | PR 1 | `npm test`; `node rag.js regresion` | `node scripts/_test_probes.js`; `--ab vec-new sinvec-new` | revert matchers; `git revert` C-fix |

## Phase 1: Core Implementation (A3)

- [x] 1.1 Patch `scratch_live/live_buscar.js`: add `UMBRAL_VECTOR_ADOPTAR = 0.55` after line 613; replace zone 671–679 with exact design condition — `_lexFalla` simLex!==null && <0.52, `_catDiff`, `_vecFiable` length>0 && similitud>=0.55, adopt iff length>0 && (_lexFalla || (_catDiff && _vecFiable)); `_falta` sole gate; sort 975–979 unchanged. (R-A3) — ✅ commit `6f9778e`; evidencia: tabla de verdad hermética 7/7 verde.
- [x] 1.2 Mirror identical patch in `scripts/new_buscar.js`; `git hash-object` equal; `check_sources_sync` green. (R-SYNC) — ✅ sha256 `d462d4ec…` idéntico en ambos; `node scripts/check_sources_sync.js` OK.

## Phase 2: Hermetic Truth Table

- [x] 2.1 Create `tests/probes_hibrida.test.js`: 7-case truth table over real body via `tests/support/load-live-buscar.js` (read-only) + stubbed vector/RPC + `OPENAI_API_KEY`: (a) 0.40→adopt; (b) 0.58 same-cat 0.60→no; (c) 0.58 catDiff 0.60→adopt; (d) 0.58 catDiff 0.50→no; (e) null catDiff 0.60→adopt; (f) empty→no; (g) no `_falta`→vector never called. (R-A3) — ✅ commit `1a7ce70`; `node --test tests/probes_hibrida.test.js` → 7/7 pass (los 7 escenarios del spec, assertAllMatched sin requests huérfanas).

## Phase 3: Live E2E Probes

- [x] 3.1 Create `scripts/_test_probes.js` reusing `buscarCon`/`crearAxiosShim`/`construirEnv`: `disco de corte` → top-1 lexical `Disco De Corte`, `rescate:false`; `tapa para el baño` → top-1 matches `/inodoro|poceta|\bwc\b/i`, `rescate:true`; JSON → `scratch_live/probes_resultado.json`. (R-PROBES) — ✅ script listo (guard `require.main === module` para no disparar en import); BLOCKED para correr 3.2: OPENAI_API_KEY vacía en `.env` (ver apply-progress).
- [x] 3.2 Run `node scripts/_test_probes.js` (real Supabase+OpenAI, `--sin-aprender`); tapa at simLex≥0.52 is HNSW flake → re-run once, record both trials. (R-PROBES) — ✅ **RESUELTO con override local OpenRouter** (decisión A del orquestador): corrida 1 con corte viejo 0.52 → tapa NO adoptada (simLex vivo 0.5246 sobre el corte + primer token `TAPA` coincide); **calibración** `UMBRAL_LEXICO_FIABLE` 0.52→0.55 (datapoint real, commit `b4213ef`, byte-idéntico hash `74fb22d5…`); corrida 2 → **disco NO adoptado / tapa SÍ adoptada** (Tapa DE Inodoro Cierre Suave, similitud 0.62, single trial, rescate true). Evidencia `scratch_live/probes_resultado.json` sha256 `04056fae…`; ledger attempt `passed` con remediación `61a4a15b…`. Suite hermética 18/18 + `check_sources_sync` OK tras el recalibrado.

## Phase 4: Phase C Isolation (conditional)

- [x] 4.1 Temp tree per suspect S∈{b439c4a,c33e0b0} at `%TEMP%\opencode\rrf-c\<S>`; overlay current `scratch_live/_coloquial_set.json` (read-only), `scripts/_test_coloquial.js` (read-only), `scripts/_lib_credenciales.js` (read-only), `lib/serrucho-search.js` (read-only), `.env` (read-only); `git show S~1`/`S:scratch_live/live_buscar.js` into before/after trees. (R-FASEC) — ✅ 4 árboles construidos vía script `build_rrf_c.js`; port mecánico de la línea override en ambos lados (validado: diff = solo los hunks del sospechoso, +23/−4 coincide con el original).
- [x] 4.2 Run `--sin-aprender --etiqueta <S>-before|-after` per tree (never `--sin-vector`); culprit iff `after.exacto < before.exacto`; else verdict, zero matcher changes. (R-FASEC) — ✅ 4 corridas calientes: **todas 243/320 (75,9%)**, buckets idénticos 132/171 · 15/26 · 96/123; `after == before` en los dos sospechosos → **ninguno culpable**. Settles `passed` (shas `e2f43031…`/`2b102223…`/`2caeb085…`/`e8daaf17…`). Veredicto en RAG.md §3/§7 y plans/010.
- [x] 4.3 IF confirmed: bounded correction, both matcher files identically, one reversible commit; re-run pair A/B + `regresion` + `npm test`. (R-FASEC; R-SYNC) — ✅ **NO APLICA (condicional en FALSE)**: culpable = ninguno → **no se foldéa nada**, cero cambios de matcher (per instrucción del orquestador: documentar, no tocar). Caída 246→231 queda como deuda de investigación externa (popularidad/vocabulario regenerados de noche).

## Phase 5: Measurement & Gate

- [x] 5.1 Run `--sin-aprender --etiqueta vec-new` and `--sin-vector --etiqueta sinvec-new` on cached set (never regenerated). (R-GATE) — ✅ Evidencia `_coloquial_resultados_vec-new.json` sha256 `3e378197…` y `_coloquial_resultados_sinvec-new.json` sha256 `69b94fa3…` (gitignored); settles `passed` (tokens `232a27ae…`, `49033566…`).
- [x] 5.2 Run `--ab vec-new sinvec-new`: gap ≥ 5 opens deploy; < 5 REJECTED; `vec-new > 246/320`, `sin historial` ≥ 75.6%. (R-GATE) — ✅ **vec-new 244/320 (76,3%)**, buckets 133/171 · 15/26 · 96/123; **sinvec-new 231/320 (72,2%)**, buckets 124/171 · 14/26 · 93/123. **gap 4,1 pts < 5 → REJECTED** (y 244 < 246). **Corrección de atribución**: el gap 0 del 07-09 fue medición sin vector (clave vacía/egress geo-bloqueado), el vector vivo aporta +13 reales pero no cruza la barra → **NO deploy**.
- [x] 5.3 Run `node rag.js regresion` → 0 FN (86 cases). (R-REGRESION) — ✅ VERIFICADO (no alcanzado el 0): 2 FN (`#11 sinz de 6 metros`, `#28 lamina de zinc`), evidencia sha256 `0b306ec1…`, settle `failed`. **Baseline pre-cambio `b1e8823`+port: LOS MISMOS 2 FN, delta 0 → pre-existentes, no regresión de este cambio**; criterio "0 FN" ya roto en baseline → documentado en RAG.md §6 regla 8 + §7.
- [x] 5.4 Run `npm test`; `git diff` shows `n8n_workflow.json` and `_coloquial_set.json` unchanged. (R-SYNC; R-NO-TOUCH) — ✅ `tests/**/*.test.js` 118/118 pass; `check_sources_sync` OK; `check_workflow_sync` **RED pre-existente** (fuera de alcance: n8n_workflow.json drifteó antes del cambio y no se toca por guard; esperado siempre en esta rama). `git status`: `n8n_workflow.json` y `_coloquial_set.json` SIN cambios ✓.

## Phase 6: Documentation

- [x] 6.1 Update `RAG.md` §3/§6/§7 and `plans/010-recall-por-antiguedad-de-venta.md`: gate verdict, A/B evidence, Phase C verdict, deferrals (real RRF deferred). (R-GATE; R-NO-TOUCH) — ✅ Ticket final: RAG.md §3 (evolución + corrección atribución 07-09), §6 reglas 7-8 (geo-bloqueo→override local; 2 FN pre-existentes), §7 (RRF diferido con prerrequisito dedupe por familia, 2 FN conocidos como deuda, Phase C externa); plans/010 re-medido por bucket (vec 133/171 vivo). apply-progress.md mergeado con veredictos finales (esté archivo).

## Phase 7: Deployment (conditional)

- [x] 7.1 Only if gate ≥ 5: `node scripts/deploy_nodos.js` (npm test guard built in; pushes body to node `buscar_productos_tool`, never `n8n_workflow.json`); rollback = `git checkout --` matchers + redeploy. (R-GATE; R-NO-TOUCH) — ✅ **CERRADA EN FALSE (condicional)**: gate 5.2 = REJECTED (4,1 < 5) → la rama no abre; **no se desplegó nada**. Consecuencia deliberada: el override `OPENAI_API_BASE` (OpenRouter) queda solo en `.env` local; n8n/producto intactos.