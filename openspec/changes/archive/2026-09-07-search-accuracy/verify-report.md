```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:64edf3dd6414e4680e1085760f42d996e8cc97d59cef9c37fabec619796d8c8d
verdict: pass
blockers: 0
critical_findings: 0
requirements: 7/7
scenarios: 12/12
test_command: node --test tests/coloquial_harness.test.js
test_exit_code: 0
test_output_hash: sha256:2a900036f1118251d2abe286b1ad5ae5967814be6a223ea61c9b2f106040d460
build_command: node --check scripts/_test_coloquial.js scripts/_diag_negativa.js rag.js scripts/_test_busqueda_50.js tests/coloquial_harness.test.js
build_exit_code: 0
build_output_hash: sha256:00e728c867599d3d9232d65b54b0a19d32c12569d2cf47079212fb75dbb27f2c
```

## Verification Report

**Change**: search-accuracy
**Version**: N/A (delta spec, first measurement)
**Mode**: Standard (project `tdd: false`; RED-first used per tasks.md)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 20 |
| Tasks complete | 20 |
| Tasks incomplete | 0 |

All 20 tasks `- [x]` in `tasks.md`; `apply-progress.md` documents each with evidence. Dispatcher native status: `applyState: all_done`, `taskProgress 20/20`, `nextRecommended: verify`, `blockedReasons: []`.

### Build & Tests Execution

**Build**: ✅ Passed — `node --check` over the 5 changed/committed source files (syntax gate; project has no compile step).
```text
[scripts\_test_coloquial.js] exit=0
[scripts\_diag_negativa.js] exit=0
[rag.js] exit=0
[scripts\_test_busqueda_50.js] exit=0
[tests\coloquial_harness.test.js] exit=0
build_output_hash: sha256:00e728c867599d3d9232d65b54b0a19d32c12569d2cf47079212fb75dbb27f2c
```

**Tests**: ✅ 15 passed / 0 failed / 0 skipped (6 suites) — `node --test tests/coloquial_harness.test.js`
```text
▶ CLI 3/3 · D1 axios shim 2/2 · D2 atomic persistence 3/3 · D3 sales-recency buckets 3/3 · D4 A/B gate 2/2 · D5 diagnostics live body 2/2
ℹ tests 15 · suites 6 · pass 15 · fail 0 · cancelled 0 · skipped 0 · todo 0
test_exit_code: 0
test_output_hash: sha256:2a900036f1118251d2abe286b1ad5ae5967814be6a223ea61c9b2f106040d460
```

**Coverage**: ➖ Not available (no coverage threshold in `openspec/config.yaml`; hermetic suite + live E2E evidence instead).

**Live E2E evidence (real execution, no re-run of the 320-set)**:
- Gate R4: `node scripts/_test_coloquial.js --ab vec sinvec` → vec 72.2% | sinvec 72.2% | gap 0 pts < 5 | **REJECTED** (exit 0).
- Diagnóstico R6: `node scripts/_diag_negativa.js --qs "Tiene pipas de agua de 200"` → `veredicto: NO_VENDIDO` (regla viva, TTL 90d).
- Regresión R5: `node rag.js regresion` → 86 filas, **0 FN por negaciones** (filas 1/4 → `no_vendido`), `RANKING malo: 0`, `excepciones: 0`; únicos sospechosos: #11 "sinz" y #28 "lamina de zinc" — PRE-EXISTENTES, no relacionados con `busqueda_negativa`, documentados en apply (3.4).
- Archivos oficiales: `_coloquial_resultados_vec.json` y `_sinvec.json` — ambos `exacto 231 (72,2%)`, `categoria 58`, `nada 31`, 320 registros con los 7 campos, buckets 171+26+123=320, `meta.join_paginado: true`, `popularidad_rows: 4817`.

### Spec Compliance Matrix
| Requirement | Scenario | Test | Result |
|-------------|----------|------|--------|
| R1 Per-case results persistence | Full-set run writes all cases | `tests/coloquial_harness.test.js` > D2 (atomic write, N records, 7 fields) + oficiales: 320 records, campos completos | ✅ COMPLIANT |
| R1 | Partial run is not official | `tests/coloquial_harness.test.js` > D2 (--limit nunca escribe oficial) + smoke apply `--limit 3` → OFFICIAL_WRITTEN=NO | ✅ COMPLIANT |
| R2 Sales-recency bucket breakdown | Buckets printed and consistent | `tests/coloquial_harness.test.js` > D3 (denominadores suman) + oficiales suman 320 en ambos | ✅ COMPLIANT |
| R2 | Null ultima_venta → sin historial | `tests/coloquial_harness.test.js` > D3 (`bucketDeUltimaVenta` null→sin historial, 365d) | ✅ COMPLIANT |
| R3 Side-effect isolation flag | Baseline run with side-effects off | `tests/coloquial_harness.test.js` > D1 (short-circuit POSTs vocabulario/automejora, transporte intacto; sin flag llega al transporte) | ✅ COMPLIANT |
| R4 Cached A/B baseline and gate | Gap below threshold → REJECTED | `tests/coloquial_harness.test.js` > D4 (4.9→REJECTED) + live gate → REJECTED gap 0 | ✅ COMPLIANT |
| R4 | Gap at or above threshold → conditional | `tests/coloquial_harness.test.js` > D4 (5.0→conditional) | ✅ COMPLIANT |
| R4 | Same cached queries | `_coloquial_set.json` versionado, git-clean, 320 casos; ambos meta.set idénticos | ✅ COMPLIANT |
| R5 Regression front-C verification | Catalog contains items → purge rows | ítems NO existen en catálogo (apply 3.1-3.2) → branch `exists: false`; `rag.js regresion` live: 0 FN por negaciones | ✅ COMPLIANT |
| R5 | Purge does not alter ranking | sin purge (ítems ausentes); `RANKING malo: 0`; `live_buscar.js`/`new_buscar.js` intactos (git status) | ✅ COMPLIANT |
| R6 Diagnostics aligned to live rule | Diagnostics match live behavior | `tests/coloquial_harness.test.js` > D5 (diagBuscar flags no_vendido, cero POSTs) + live `--qs` NO_VENDIDO = rag.js diag | ✅ COMPLIANT |
| R7 Gate verdict and deferrals recorded | Verdict and deferrals are durable | RAG.md §3 (fila 2026-09-07, REJECTED gap 0, tabla A/B) + plans/010 (Status REJECTED, buckets, diferimientos con plan dueño) | ✅ COMPLIANT |

**Compliance summary**: 12/12 scenarios compliant

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| R1 | ✅ Implemented | D2 `.tmp` + `fs.renameSync`, solo corrida completa, `--etiqueta` sufija archivo |
| R2 | ✅ Implemented | Join paginado por offset (PAGE=1000, corta en `< PAGE`), fallo → warn + sin historial, nunca crash |
| R3 | ✅ Implemented | D1 axiosShim intercepta solo POSTs a `catalogo_vocabulario`/`automejora-busqueda` → `{data: []}` |
| R4 | ✅ Implemented | D4 `--ab <a> <b>` lee solo archivos, gap = vector − sin-vector, `<5 → REJECTED` |
| R5 | ✅ Implemented | `_test_busqueda_50.js` filas 23/26 `exists: false`; sin purge (ítems no existen) |
| R6 | ✅ Implemented | `_diag_negativa.js` corre el cuerpo vivo completo + `--qs`; `rag.js diag` imprime `no_vendido` |
| R7 | ✅ Implemented | RAG.md §3 y plans/010 Status con veredicto, gap, buckets y diferimientos |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 axios shim aislamiento | ✅ Yes | tests D1 2/2 |
| D2 persistencia atómica por caso | ✅ Yes | tests D2 3/3; oficiales 320/320 |
| D3 buckets join popularidad | ✅ Yes | tests D3 3/3 + fix paginación (meta.join_paginado=true, 4817 filas) |
| D4 gate A/B por archivos etiquetados | ✅ Yes | live: REJECTED gap 0; tests D4 2/2 |
| D5 diagnóstico = cuerpo vivo | ✅ Yes | `_diag_negativa.js` reescrito; tests D5 2/2 |
| D6 Front-C: hand-verify + exists | ✅ Yes | ítems ausentes → `exists: false`, sin purge |
| D7 veredicto en RAG.md + plans/010 | ✅ Yes | fila 2026-09-07 + Status REJECTED |
| D8 gitignore resultados | ✅ Yes | `.gitignore:67` `scratch_live/_coloquial_resultados*.json`; `git check-ignore` confirma ambos oficiales |

### Issues Found
**CRITICAL**: None
**WARNING**: None (todas las verificaciones pasaron)
**SUGGESTION / NOTAS**:
- Worktree sin commitear (esperado, del orquestador): `scripts/_test_coloquial.js` (fix paginación D3), `RAG.md`, `plans/010-recall-por-antiguedad-de-venta.md` — deben commitearse antes del archive para que la auditoría quede completa.
- Pre-existentes NO relacionados: sospechosos #11 "sinz" y #28 "lamina de zinc" en `regresion` (fuera de alcance, documentados en apply 3.4/apply-progress).
- `n8n_workflow.json` y `boot_serrucho.ps1` modificados localmente — mods PRE-EXISTENTES no relacionados (no incluidos).
- La medición 72,2% es una REGRESIÓN vs histórico 76,9% (intento 4 de plan 006, `0c31b52`) — documentada; retrabajo RRF/revisión de `0c31b52` → plan 006.

### Verdict
**PASS** — 12/12 escenarios compliant, 20/20 tareas, gate REJECTED documentado con evidencia reproducible; ranking no tocado.