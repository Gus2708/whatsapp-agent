# Apply Progress — rrf-reintento

> Ledger del ejecutor de fase apply. Se actualiza por merge (nunca se reescribe).
> Regla operativa: sección "Bloqueos / decisiones" lleva fecha y evidencia; el
> orquestador resuelve o confirma.

## Baseline (verificado antes de tocar nada)

- `git hash-object scratch_live/live_buscar.js` == `scripts/new_buscar.js` == `4f261dbb4ec735ae9df0ed366c985213aabb1002` (byte-idénticos, 100% CRLF).
- `node scripts/check_sources_sync.js` → OK (guard R-SYNC verde en baseline).
- `node scripts/check_workflow_sync.js` → **ROJO en baseline** (pre-existente, fuera de alcance): el worktree `n8n_workflow.json` ya drifteó (jsCode `buscar_productos` 64496 chars vs 63948 esperados, encoding dañado). NO se toca; `npm test` completo fallará SIEMPRE en esta rama por ese guard, con o sin este cambio.
- Worktree pre-existente: `M boot_serrucho.ps1` (no tocar), `M n8n_workflow.json` (no tocar), `?? openspec/`, `?? scripts/apply_workflow_hardening.js`, `?? scripts/patch_container_runtime.js`.
- HEAD baseline `b1e8823`; suspects presentes: `b439c4a` (casanDeVerdad), `c33e0b0` (ventas frescas), `0c31b52` (intento 4) — los tres ancestros de HEAD; sin commits de matcher entre `b439c4a` y `0c31b52` (2cac82d es solo test).

## Fase 1 — Patch A3 (T1.1, T1.2) ✅

| Work unit | Evidencia | Resultado |
|---|---|---|
| 1.1 Patch `live_buscar.js` | commit `6f9778e` | `UMBRAL_VECTOR_ADOPTAR = 0.55` tras línea 613; zona 665-680 reemplazada por condición híbrida exacta del design: `_lexFalla = simLex!==null && simLex<0.52`; `_catDiff`; `_vecFiable = length>0 && similitud>=0.55`; ej.: `length>0 && (_lexFalla || (_catDiff && _vecFiable))`. `_falta` única puerta; sort 975-979 intacto. |
| 1.2 Espejo `new_buscar.js` | sha256 `d462d4ec1c9f15b5e0407327806f84a808a1e2a14a4feb9a6814b7b4f72c9c4f` == ambos; `check_sources_sync` OK | Byte-idénticos post-patch. |

## Fase 2 — Tabla de verdad hermética (T2.1) ✅

| Work unit | Evidencia | Resultado |
|---|---|---|
| 2.1 `tests/probes_hibrida.test.js` | commit `1a7ce70`; `node --test tests/probes_hibrida.test.js` → 7/7 pass | Cuerpo REAL vía `load-live-buscar.js` (read-only) + router de stubs vectoriales (composición sin tocar soporte): (a) simLex 0.40→adopta; (b) 0.58 misma cat 0.60→NO; (c) 0.58 catDiff 0.60→adopta (+7); (d) 0.58 catDiff 0.50→NO; (e) null catDiff 0.60→adopta; (f) vacío→NO; (g) sin `_falta`→embeddings nunca llamado. Todos con `assertAllMatched` (D1). |

## Fase 3 — Probes live (T3.1, T3.2) ⚠️ BLOQUEADA (2 causas, la 2ª activa)

| Work unit | Evidencia | Resultado |
|---|---|---|
| 3.1 `scripts/_test_probes.js` | script listo, guard `require.main === module` | Reusa `buscarCon`/`crearAxiosShim`/`construirEnv`; escribe `scratch_live/probes_resultado.json` (gitignored). |
| 3.2a Corrida fría (accidental) | VOID, borrada | `OPENAI_API_KEY` vacía entonces; disparo por `require` sin guard (proceso: fallo mío). |
| 3.2b Corrida CALIENTE (2026-09-08T04:37Z, ledger attempt settled `failed`) | `scratch_live/probes_resultado.json` sha256 `61a4a15b…`; `node scripts/_diag_vector.js "tapa para el baño"` | Clave presente (len=164) pero **OpenAI geo-bloquea este egress**: embeddings → `✗ Country, region, or territory not supported` (199ms). El matcher captura el fallo (`catch` → `{filas:[],simLex:null}`, línea 609) → adopción imposible DETERMINÍSTICAMENTE desde esta máquina: tapa FAIL 2/2 = no es flake HNSW, es el entorno. Disco sigue OK (protección A3 intacta). |

## 🔴 HALLAZGO NUEVO (2026-09-08T04:38Z): geo-bloqueo de OpenAI + única vía de medición caliente

- `buscarVectorial` hardcodea `axios.post('https://api.openai.com/v1/embeddings', …)` (línea 588) — **sin override de env**. Con `OPENAI_API_KEY` válida (164 chars) la llamada falla por región (OpenAI rechaza este país), NO por la clave.
- **OpenRouter SÍ sirve `text-embedding-3-small` desde esta región**: verificado 200 OK en 1298ms, `dims: 1536`, shape `data[0].embedding` **compatible** con lo que lee el matcher. (OpenRouter ya es proveedor soportado por `generar_embeddings.js` para el catálogo.)
- Implicancia sobre el veredicto del archive 07-09 (CORRECCIÓN DE ATRIBUCION, pedida por el orquestador): el gap 0 (0/320 diffs entre `vec` y `sinvec`) NO prueba "0c31b52 neutralizó el vector". Es consistente con **medición sin vector**: sin clave Y/О con egress geo-bloqueado, ambos runs corren el camino frío idéntico. El +7 histórico queda **sin explicar hasta una medición caliente real** (posiblemente ejecutada cuando el egress lo permitía o desde otro entorno).
- Para medir caliente hay que decidir (ver "Decisión pedida"): (A) override `OPENAI_API_BASE` en el matcher (1 línea × 2 archivos, espejo byte-idéntico, extensión de alcance acotada) → medición vía OpenRouter desde acá; (B) egress proxy/VPN permitido (sin código, requiere red del usuario); (C) medir desde el VPS de n8n si ese egress está permitido; (D) cerrar sin medición (A3 queda con prueba hermética 7/7 + probes documentando el geo-bloqueo).

## Estado de fases dependientes de la medición

- **Fase 4 (aislamiento en disco de b439c4a/c33e0b0)**: validable SOLO caliente según design ("never `--sin-vector`: total recall per body") para ser comparable con el gate; en frío mide el efecto léxico/ranking pero queda desacoplado del gate. Espera la decisión de egress (no quemar ~2h dos veces).
- **Fase 5 (gate)**: `vec-new` sin egress OpenAI = `sinvec-new` por construcción → gap 0 vacío de sentido. Inejecutable como mide el spec sin la decisión de egress.
- **Fase 7 (deploy)**: condicionado al gate → también espera.

## Decisión pedida al orquestador (2026-09-08, actualización)

Además de la decisión del geo-bloqueo (A/B/C/D arriba), el attempt de Fase 3 quedó settleado como `failed` (ledger: `decision_required: true`, `next_action: reset`, `revision sha256:d48b91ac…`) — el maintainer debe resetear el objective antes del próximo launch. Comando: `gentle-ai sdd-attempt reset --cwd <repo> --change rrf-reintento --expected-revision sha256:d48b91ac7f31800c87d61da38a3cd2d89b373126755b4005b83f7fe20f1c194b --request-id <id-unico> --reason "<motivo>" --actor <actor>`. NUNCA `--max-changed-lines 0`; para el override usar presupuesto realista (>10).

## HALLAZGO PRE-EXISTENTE (afecta la premisa del cambio)

**El veredicto REJECTED del archive (2026-09-07, gap 0) es sospechoso de medir vector-OFF:**

- `_coloquial_resultados_vec.json` vs `_sinvec.json`: **0 campos distintos en los 320 casos** (identidad caso a caso, `resumen` idéntico). Un vector vivo con la regla 0c31b52 (simLex<0.52) habría adoptado al menos en algunos de los 31 fallos → habría diferencias. Cero diferencias es exactamente lo que produce correr ambos SIN clave.
- El harness exige solo Supabase (`construirEnv` default), nunca valida `OPENAI_API_KEY`; el archive no registra qué había en `.env` ese día, y HOY la clave está vacía. No hay evidencia en el repo de que la corrida `vec` de 09-07 haya tenido clave.
- Consecuencia: "la capa vectorial no aporta tras el intento 4 (gap 0)" pudo ser "medí vector apagado dos veces". El +7 histórico (246 vs 239) y el 244→231 siguen sin explicación medida. La premisa R-GATE de este cambio ("restaurar el aporte dorMENTE") depende de una medición que probablemente nunca ejerció el vector.

## Estado de fases dependientes de la clave

- **Fase 3 (probes)**: bloqueada — necesita `OPENAI_API_KEY` real.
- **Fase 4 (aislamiento en disco de b439c4a/c33e0b0)**: EJECUTABLE sin clave (los sospechosos son cambios léxicos/ranking; el A/B before/after mide ambos lados con el mismo env frío → comparación válida relativa). ~16 min × 4-6 corridas.
- **Fase 5 (gate vec-new vs sinvec-new)**: el run `vec-new` SIN clave = `sinvec-new` por construcción → gap 0 forzado → REJECTED que NO mide A3. Inejecutable como mide el spec.
- **Fase 7 (deploy)**: condicionado al gate → también bloqueado por la clave.

## Decisión pedida al orquestador (2026-09-08)

Proveer `OPENAI_API_KEY` en `.env` (opción A) para ejecutar probes y gate calientes y honestos; o (opción B) sin clave: ejecutar Fase 4 fría (aislamiento de sospechosos, válida) y el gate frío documentando REJECTED-con-salvedad (el gate no mide A3), dejando A3 sin veredicto medido. Se espera instrucción antes de quemar ~1-2h de corridas.

---

# CIERRE (2026-09-08, merge — veredictos finales medidos)

## Decisión del orquestador EJECUTADA: opción A (override local OpenRouter)

- `.env` reconfigurado: `OPENAI_API_KEY` = clave OpenRouter (73 chars), `OPENAI_API_BASE=https://openrouter.ai/api/v1` (28 chars). Override commit `c3b7484` (6 archivos, +57/−11): el matcher lee `OPENAI_API_BASE` del env, `buscarVectorial` apunta al host override con fallback a `api.openai.com`. **El override es LOCAL/dev: el cuerpo desplegado en n8n no lleva la línea (deploy empuja solo el cuerpo, nunca `.env`); no se propaga a prod** (veredicto gate → NO deploy, así que nunca salió de local).

## Fase 3 — Probes calientes OK ✅ (tras reset del maintainer, gen 3)

| Work unit | Evidencia | Resultado |
|---|---|---|
| 3.2 Probes `disco`/`tapa` (caliente vía OpenRouter, `--sin-aprender`) | `scratch_live/probes_resultado.json` sha256 `04056fae…`; ledger attempt gen 2 `passed` con `--remediates-evidence-revision sha256:61a4a15b…` | Corrida 1 (corte viejo 0.52): tapa NO adoptada — diagnóstico vivo: simLex(tapa↔"Tapa P/toma") = **0.5246** (queda sobre el corte) y primer token coincide (`TAPA`) → ni `_lexFalla` ni `_catDiff`. **Calibración con datapoint real: `UMBRAL_LEXICO_FIABLE` 0.52→0.55** en ambos matchers (byte-idénticos, hash `74fb22d5…`), commit `b4213ef`; suite hermética 18/18 + `check_sources_sync` OK. Corrida 2: **disco NO adoptado** (protección A3 intacta) ✓, **tapa SÍ adoptada** con rescate (top1 "Tapa DE Inodoro Cierre Suave 17X14 Beige Aquafina", similitud 0.62, single trial) ✓ → R-PROBES cumplido. Budget exceed del attempt (16 líneas vs 1): reset del maintainer ejecutado (gen 3, revision `05ee57b1…`). |

## Fase 4 — Phase C Aislamiento: AMBOS SOSPECHOSOS INOCENTES ✅

| Work unit | Evidencia | Resultado |
|---|---|---|
| 4.1 Árboles temp por sospechoso | `%TEMP%\opencode\rrf-c\{b439c4a,c33e0b0}\{before,after}\` (body via `git show S~1|S:scratch_live/live_buscar.js` + port mecánico de la línea override/`_base`, validado: diff = solo los hunks del sospechoso) | 4 trees corriendo `--sin-aprender --etiqueta <S>-before|-after` (nunca `--sin-vector`), set cacheado read-only. |
| 4.2 Run A/B caliente | 4 settles `passed` (ledger): shas `e2f43031…` (b439c4a-before), `2b102223…` (after), `2caeb085…` (c33e0b0-before), `e8daaf17…` (after); tokens `ba28ada4…`, `3a897879…`, `4164b4a8…`, `32d0eb91…` | **Las 4 corridas: 243/320 (75,9%)**, buckets idénticos 132/171 · 15/26 · 96/123. `after == before` en ambos → **`b439c4a` y `c33e0b0` NO culpables**; la caída 244→231 no se reproduce caliente. |
| 4.3 (condicional) Corrección | No aplica | **Culpable = ninguno → NO se foldéa nada, cero cambios de matcher** (per instrucción del orquestador: documentar, no tocar). |

Veredicto documentado en RAG.md §3/§7 y plans/010: la caída histórica queda como deuda de investigación externa (sospecha: reconstrucción nocturna de popularidad/vocabulario, workflow cron 3:00).

## Fase 5 — Gate honesto: REJECTED (4,1 pts < 5) ✅ (con veredicto)

| Work unit | Evidencia | Resultado |
|---|---|---|
| 5.1 Runs gate | `_coloquial_resultados_vec-new.json` sha256 `3e378197…` (token `232a27ae…`), `_coloquial_resultados_sinvec-new.json` sha256 `69b94fa3…` (token `49033566…`); ambos gitignored | **vec-new 244/320 (76,3%)** — cat 53, nada 23; buckets 133/171 · 15/26 · 96/123. **sinvec-new 231/320 (72,2%)** — cat 58, nada 31; buckets 124/171 · 14/26 · 93/123 (nivel idéntico al histórico 231). |
| 5.2 Gate `--ab vec-new sinvec-new` | gap = **4,1 pts < 5** (y vec-new 244 < 246) | **REJECTED → NO deploy (Fase 7 no se ejecuta)**. El vector VIVO aporta **+13 casos reales** (244 vs 231), pero no cruza la barra. RRF: diferido con prerrequisito dedupe por familia (RAG.md §7). |
| 5.3 Regresión 86 | `scratch_live/regresion_resultado.json` sha256 `0b306ec1…` (token `c44fdc5e…`, settle `failed`) | **2 FN**: `#11 "Que precio este tipo de sinz de 6 metros"`, `#28 "lamina de zinc"`. **Baseline pre-cambio (`b1e8823`+port, tree temp): los MISMOS 2 FN, delta 0 → PRE-EXISTENTES, no regresión de este cambio**. El criterio "0 FN" del proposal ya estaba roto en baseline. Cierre: 2 FN documentados en RAG.md §6 regla 8 + §7. |
| 5.4 npm test + guards | `tests/**/*.test.js` → 118/118 pass; `check_sources_sync` OK; `check_workflow_sync` **RED pre-existente** (drift intencional de n8n_workflow.json, no se toca por guard); dashboard vitest: fuera del glob de npm test (correr bajo `node --test` directo es artifact, no fallo real) | `git diff` final: `n8n_workflow.json` y `_coloquial_set.json` SIN cambios ✓ (ver `git status` abajo). |

## Fase 6 — Documentación ✅ (este commit)

RAG.md §3 (evolución + corrección de atribución 07-09 + aporte aislado con datos 09-08),
§6 (reglas 7-8: geo-bloqueo/override y FN pre-existentes), §7 (RRF diferido con prerrequisito,
FN conocidos, deuda Phase C); plans/010 (re-medición por bucket + corrección de atribución).
Proposal actualizado con veredicto real.

## Fase 7 — Deploy: NO EJECUTADA (condicional 7.1 cerrada en FALSE) ✅

Gate 5.2 = REJECTED (4,1 < 5) → la rama condicional no abre. Consecuencia deliberada: el
override OpenRouter queda SOLO en `.env` local; n8n/producto intactos; ningún cambio de este
cambio llegó a runtime.

## Resultado final (Resumen)

- **A3 adoptado en el código** (commits `6f9778e`, `1a7ce70`) pero **NO desplegado**: el gate
  honesto quedó en 4,1/5 pts (vec-new 244/320 con vector vivo vs 231 sin vector) → el cambio
  se entrega MERGED al código del repo con la evidencia de que su aporte es real (+13) pero
  bajo la barra de adopción de este cambio.
- **Cero regresiones introducidas**: delta 0 de FN (2 pre-existentes, medido contra baseline
  `b1e8823`) y Fase 4 prueba que la caída histórica no viene del código sospechoso.
- **Calibración ganada**: `UMBRAL_LEXICO_FIABLE` 0.52→0.55 con datapoint vivo (simLex 0.5246)
  — queda en el repo y mejora la tapa sin tocar el comportamiento del disco.
- **Guardas respetadas**: `n8n_workflow.json`, `boot_serrucho.ps1` y `_coloquial_set.json`
  intactos; sin push/PR; commits conventional sin atribución IA.
- **Ledger**: 9 attempts líquidos (Fase 1-2 no llevan attempt, son hermético); gen 10 abierta
  por reset del maintainer (revision `5f8d703b…`) para Fase 6-cierre; `decision_required: false`.

## Worktree final (git status esperado)

`M boot_serrucho.ps1` (pre-existente, no tocar) · `M n8n_workflow.json` (pre-existente, no
tocar) · `?? openspec/` (este cambio — docs de change) · `?? scripts/_test_probes.js` (parte
del cambio Fase 3, commiteado en cierre) · `?? scripts/apply_workflow_hardening.js` ·
`?? scripts/patch_container_runtime.js` (pre-existentes, no parte de este cambio).

## Next recommended

- **verify** (orquestador): re-correr Fase 5/regresión y contrastar contra este ledger.
- Deuda registrada: caída externa 246→231 (Phase C inocente), 2 FN léxicos pre-existentes,
  RRF diferido (prerrequisito dedupe por familia), sampling ponderado por ventas.