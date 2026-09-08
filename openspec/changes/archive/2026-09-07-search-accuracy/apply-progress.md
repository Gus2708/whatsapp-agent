# Apply Progress — search-accuracy

- **Change**: `search-accuracy`
- **Store**: openspec (repo-local) — `C:\Proyect\whatsapp-agent\openspec`
- **Fecha**: 2026-09-07
- **Fase**: apply (sub-agente `sdd-apply`, modo Standard — `tdd: false` por defecto; se usó RED-first según `tasks.md`)
- **Estado global**: **20/20 tareas completadas** — Fases 1-5 implementadas y verificadas. Medición A/B (4.1-4.3) ejecutada por el orquestador, basura del join D3 corregida, veredicto REJECTED documentado en RAG.md y plans/010 (5.1-5.2).

## Tareas completadas (Fase 1: Foundation — WU1 `harness-coloquial`)

| # | Evidencia | Resultado |
|---|---|---|
| 1.1 | RED: `tests/coloquial_harness.test.js` falla contra harness sin modificar (`--test-name-pattern="CLI"`, 3 tests failed, `status null` por timeout 8s — el módulo sin gate corría 320 casos por red) | RED ✓ |
| 1.2 | D1 `--sin-aprender`: axiosShim cortocircuita SOLO POSTs a `catalogo_vocabulario`/`automejora-busqueda` → `{data:[]}`; GETs y RPC POSTs pasan | 2 tests verdes |
| 1.3 | D2 persistencia atómica `.tmp`+`renameSync`; `--limit` nunca escribe oficial; fallo limpia `.tmp` y re-lanza | 2 tests verdes |
| 1.4 | D3 buckets `<1 año`/`>1 año`/`sin historial` con denominadores; fallo de fetch de `producto_popularidad` → warn + todo a sin historial | 3 tests verdes |
| 1.5 | D4 `--ab <a> <b>`: gap = vector − sin-vector `exacto_pct`; `<5 → REJECTED`, `≥5 → conditional` | 2 tests verdes |
| 1.6 | `.gitignore` += `scratch_live/_coloquial_resultados*.json` | ✓ |
| 1.7 | GREEN: `node --test tests/coloquial_harness.test.js` → **13/13** | GREEN ✓ |

**Runtime harness (WU1)**: `node scripts/_test_coloquial.js --limit 3 --sin-aprender --etiqueta smoke` → exit 0, `PARCIAL: 3 de 320`, exacto 2, categoria 1, fallo 0; `OFFICIAL_WRITTEN=NO`, `TMP_LEFTOVER=NO`.
**Rollback boundary WU1**: commit `853c4b2` (3 archivos: `scripts/_test_coloquial.js`, `tests/coloquial_harness.test.js`, `.gitignore`) — reversible sin tocar fase 2/3.
**Attempt WU1**: adquirido `sha256:145b5fbf...`, settle `passed` con `--evidence-revision sha256:9de91f07...` → `state: complete`.

## Tareas completadas (Fase 2: Diagnostics alignment R6/D5 — WU2a `diagnostics-alignment-d5`)

| # | Evidencia | Resultado |
|---|---|---|
| 2.1 | RED-extend: 2 tests D5 fallan (`diagBuscar is not a function` — `_diag_negativa.js` síncrono sin exports) | RED ✓ |
| 2.2 | `scripts/_diag_negativa.js` reescrito: corre el CUERPO VIVO completo de `live_buscar.js` (mismo loader que `_diag_negaciones.js`), D1 `crearAxiosShim(null,{sinAprender:true})`, modo `--qs`, validación de flags, gate `require.main === module`, exports `{diagBuscar, PRUEBAS}` | ✓ |
| 2.3 | `rag.js diagnostico()`: `casoRes.no_vendido = Boolean(lex.no_vendido)` + print `1b. Regla viva no_vendido` | ✓ (live: línea visible) |
| 2.4 | Ambos tools vs regla viva `c01ed5d` → `NO_VENDIDO` live para "Tiene pipas de agua de 200" y "…cielo razo porfavor"; test hermético D5: cero POSTs al transporte, query neg con `creado_en=gte.` | ✓ |

**Focused test**: `node --test tests/coloquial_harness.test.js` → **15/15** (6 suites).
**Runtime harness (WU2a)**: `node scripts/_diag_negativa.js --qs "Tiene pipas de agua de 200"` → `veredicto: NO_VENDIDO`; `node rag.js diag "Tiene pipas de agua de 200"` → `1b. Regla viva no_vendido: NO VENDIDO`. Dashboard: `npm --prefix dashboard run test` → **21/21**.
**Rollback boundary WU2a**: commit `f16df12` (3 archivos: `scripts/_diag_negativa.js`, `rag.js`, `tests/coloquial_harness.test.js`).
**Attempt WU2a+WU2b**: adquirido `sha256:90d95d55...` (request-id `apply-wu2-diagnostics-frontc`), settle `passed` `sha256:0293aa9f...` → `state: complete`.

## Tareas completadas (Fase 3: Front-C R5/D6 — WU2b)

| # | Evidencia | Resultado |
|---|---|---|
| 3.1 | Verificación manual vs catálogo (REST anon reads, 2 probes): "pipa 200mm" NO existe (PVC solo 1/2"-1"); "estructura/soporte del cielo raso" NO existe (drywall solo accesorios; "cielo" solo pintura AZUL CIELO; soportes son de cortina). Los negativos guardados son comportamiento CORRECTO | ✓ |
| 3.2 | Rama "else": los ítems NO existen → NO se requiere purge; la expectativa se fija en `exists: false` (la opción de purge solo aplica si existen ítems) | ✓ (sin purge) |
| 3.3 | `scripts/_test_busqueda_50.js` filas #23 y #26: `exists: null` → `exists: false` | ✓ (diff 2 líneas) |
| 3.4 | `node rag.js regresion` (live, 86 filas): filas 1 y 4 → `· no_vendido` — **0 falsos negativos por negaciones**; ranking sin cambios (ranking no tocado: `live_buscar.js`/`new_buscar.js` intactos) | ✓ |

**Rollback boundary WU2b**: commit `8f7efc1` (1 archivo: `scripts/_test_busqueda_50.js`).
**Sospechosos pre-existentes documentados** (NO relacionados con `busqueda_negativa`, NO corregidos — ranking congelado): #11 "Que precio este tipo de **sinz** de 6 metros" (typo→zinc, `exists: true`, enc=0) y #28 "lamina de zinc" [`cat`] (gap del matcher, `exists: true`, enc=0). Evidencia: aparecen iguales antes y después del cambio, fuera del alcance de Fases 1-3.

## Tareas completadas (Fase 4: Measurement R4/R1/R2 — WU4 `measurement-ab`, ejecutadas por orquestador)

| # | Evidencia | Resultado |
|---|---|---|
| 4.1 | Run A: `node scripts/_test_coloquial.js --sin-aprender --etiqueta vec` (full, ~16 min) → `scratch_live/_coloquial_resultados_vec.json` | **231/320 exacto (72,2%)**, 58 categoría, 31 fallo total |
| 4.2 | Run B: `+ --sin-vector --etiqueta sinvec` (full, ~16 min) → `scratch_live/_coloquial_resultados_sinvec.json` | **231/320 exacto (72,2%)** — idéntico a Run A |
| 4.3 | Gate: `node scripts/_test_coloquial.js --ab vec sinvec` | **REJECTED** (gap 0 pts < 5; la capa vectorial no aporta; condicional NO se abre; baseline `0c31b52` = 72,2%) |

**Bug D3 encontrado por el orquestador** (evitando documentar basura): `producto_popularidad`
corta en **1000 filas por request** aunque pidas `limit=10000` (la tabla tiene 4.817);
el join original mandaba 247/320 casos a "sin historial" FALSO (se esperaban ~123 según plan 010).
Corregido con paginación por offset en `scripts/_test_coloquial.js`; buckets recalculados y
reescritos atómicamente en ambos archivos oficiales (`meta.join_paginado`, `meta.popularity_rows`).
Buckets finales: `<1 año` 72,5% (124/171), `>1 año` 53,8% (14/26), `sin historial` 75,6% (93/123),
denominadores suman 320. **Attempt WU4-fix**: adquirido `sha256:f4c4a09f...` (request-id `fix-buckets-join-01`), settle `passed` `sha256:9cfc26da...` → `state: complete`. Tests herméticos siguen **15/15**.

**Hallazgo**: el recall actual (72,2%) es **menor** al histórico (76,9%) — el intento 4 del plan
006 (`0c31b52`) neutralizó el aporte vectorial (gap 0) y bajó el recall. Documentado como
regresión medida en RAG.md §3 y plans/010; retrabajo en plan 006 (RRF/revisión de `0c31b52`).

## Tareas completadas (Fase 5: Documentation R7/D7 — WU5 `verdict-docs`)

| # | Evidencia | Resultado |
|---|---|---|
| 5.1 | `RAG.md` §3 tabla de evolución + tabla del aporte vectorial A/B | REJECTED + regresión 76,9→72,2 documentada |
| 5.2 | `plans/010-recall-por-antiguedad-de-venta.md` Status | REJECTED + desglose por bucket permanente; diferimientos con plan dueño: RRF+revisión `0c31b52`→plan 006; full SIN audit, 3-large embeddings, weighted sampling, pasos 4-5 del 010→sus planes |

**Diferibilidad durable**: el harness queda 100% listo para ejecutar 4.1-4.3 (flags `--sin-aprender`, `--sin-vector`, `--etiqueta`, `--ab` validados con tests; D2 escribe solo en corrida completa; D8 gitignora los resultados). Nota: el harness NO incluye popularidad vectorial (fuera de alcance del diseño; documentado en design.md).

## Desviaciones del diseño

- **Ninguna estructural**. Detalles de implementación coherentes con design.md:
  - `_diag_negativa.js` imprime también el `top-3` cuando hay resultados (aditivo, no cambia veredictos).
  - En `rag.js`, la línea `1b. Regla viva no_vendido` se imprime solo cuando `lex.no_vendido` es verdadero (condición aditiva, sin alterar el flujo del diagnóstico).
  - El veredicto del gate (task 4.3) NO se ejecutó por diferición (no es desviación de código).

## Problemas encontrados

- **Bug D3 (join de popularidad) — corregido**: `producto_popularidad` corta en 1000 filas/request pese a `limit=10000`; el join sin paginar produjo 247/320 "sin historial" falsos. Paginación por offset implementada y buckets recalculados (los archivos oficiales se reescribieron atómicamente con `meta.join_paginado=true`).
- **Ninguno bloqueante.** Notas:
  - RED del archivo completo pre-impl era imposible (IIFE del módulo corría 320 casos por red) → RED demostrado con `--test-name-pattern="CLI"`; los tests de módulo (D1-D4) corren solo en GREEN con el gate `require.main === module`.
  - `node:test` exige destructuring de `describe`/`it` (RefError resuelto en WU1).
  - 2 sospechosos pre-existentes en `regresion` (ver Fase 3) — fuera de alcance.
  - El anon key NO puede DELETE sobre `busqueda_negativa` (por eso el diseño solo requiere purge cuando existen ítems, con SQL de consola); en este cambio no hizo falta purge.

## Estado final

**20/20 tareas completas** — Fases 1-5 implementadas y verificadas. Fases 1-3 committeadas como
work units `853c4b2`, `f16df12`, `8f7efc1` (rama `perucho`; conventional commits sin atribución IA).
Fases 4-5 ejecutadas por el orquestador: medición A/B completa (231=231, REJECTED gap 0), corrigió
el bug D3 de paginación en `scripts/_test_coloquial.js` (cambio pendiente de commit), y documentó
el veredicto + regresión en RAG.md y plans/010. Inventario untracked intacto (`openspec/` + 2 scripts
pre-existentes, digest estable).