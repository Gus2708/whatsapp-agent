# search-accuracy-benchmark — Design

Implements [spec](specs/search-accuracy-benchmark/spec.md) for proposal [search-accuracy](proposal.md). Measures only; ranking is never touched.

## 1. Implementation Constraints

- **Hard rule: no ranking change.** `scratch_live/live_buscar.js`, `scripts/new_buscar.js`, and `n8n_workflow.json` are NOT modified. The two A/B runs execute the same live body; the only difference is `--sin-vector` (existing `construirEnv` switch).
- **Same cached set.** `scratch_live/_coloquial_set.json` is versioned and read-only; never regenerated. Verified: exactly 320 cases, 320 unique `codigo`.
- **0c31b52 baseline.** Both runs happen NOW on current code; historical RAG.md numbers (76.9% / 74.7%) are context, not the measurement.
- `n8n_workflow.json` is already locally modified (unrelated) — must not be regenerated or committed by this change.

## 2. Key Decisions

| # | Decision | Value | Cost / Notes |
|---|---|---|---|
| D1 | **Side-effect isolation via axios shim** (R3). The harness already injects `axiosShim` into the live body (`new Function`). When `--sin-aprender` is set, `axiosShim.post` short-circuits POSTs whose URL contains `catalogo_vocabulario` or `automejora-busqueda`, returning `{data: []}` and never touching the network. | Zero change to live code; matches the existing injection seam; RPC POSTs (`buscar_productos`, `buscar_fuzzy`) and all GETs pass through unchanged, so results are identical. | Silent skip — no counting outside the harness report. |
| D2 | **Per-case persistence** (R1). File `scratch_live/_coloquial_resultados.json`, written atomically (`.tmp` + `fs.renameSync`) only on full-set completion. `--limit N` never writes the official file. Envelope: `{ meta, resumen, resultados[320] }`. | Machine-readable A/B input; partial runs can't corrupt official data. | Run is 15–30 min; one file per tag (`--etiqueta` suffixed). |
| D3 | **Bucket breakdown** (R2). One fetch of `producto_popularidad?select=codigo_interno,ultima_venta&limit=10000` at start; map join by `codigo`. `ultima_venta >= now−365d` → `<1 año`; present but older → `>1 año`; null/absent → `sin historial`. Bucket recall printed in `resumen.buckets`; denominators always sum to 320 (null bucket never drops cases, per spec). Fetch failure → warn and put all in `sin historial` (never crash the run). | Direct reuse of plan 010 bucket semantics; no DB schema change. | Popularidad may lag; buckets are evidence, not labels. |
| D4 | **A/B gate via tagged files** (R4). Run A: `node scripts/_test_coloquial.js --sin-aprender --etiqueta vec`; run B: same + `--sin-vector --etiqueta sinvec`. Then `node scripts/_test_coloquial.js --ab vec sinvec` reads the two files (no re-run) and applies the gate on `exacto` percentage gap (vector − sin-vector). Gap < 5 pts → **REJECTED**; ≥ 5 pts → **conditional** (opens only plan 010 steps 4-5, executed later with `--sin-ventas`). | No network needed for the verdict; same queries by construction (same file). | Direct `node` invocation: `rag.js` passes flags but drops bare args, so `--ab vec sinvec` values are lost through it. |
| D5 | **Diagnostics aligned to live rule** (R6). Rewrite `scripts/_diag_negativa.js` to run the WHOLE live body (same loader as `_diag_negaciones.js`, with D1 isolation) instead of replicating the rule statically; verdict is the body's own `esNoVendido` (NEGATIVO ⊆ CONSULTA, `_nt.length<=8`, no MODIFIERS filtering, 90-day TTL via `creado_en`). Add `--qs "<consulta>"` mode for single-query checks. `rag.js diag` already executes the live body (`runMatcher`) → it inherits the live rule; extend its output with a `no_vendido` line when the matcher returns `NO_VENDIDO_JSON`. | Cannot drift from live behavior (single source of truth); replaces the stale hardcoded rows and the inverted `negActual` docstring. | `_diag_negativa.js` was verified OUT OF SYNC (old rule `consulta ⊆ negativo` in `negActual` + hardcoded 2026-08-13 rows). |
| D6 | **Front-C data op** (R5). Hand-verify the two regression queries (`"Tiene pipas de agua de 200"`, `"…cielo razo porfavor"`) against the catalog (via `rag.js diag` / catalog query). If items exist: purge the stale `busqueda_negativa` rows (SQL `DELETE ... WHERE termino_raw = '<query>'` in Supabase console — the repo has no write path to that table, anon key can't DELETE) AND upgrade the two suite rows in `scripts/_test_busqueda_50.js` from `exists: null` to `exists: true` so the suite actively guards. Else: set them to `exists: false` explicitly. Re-run `node rag.js regresion` → must report **0 FN**. Row `creado_en` ~2026-08-13; 90-day TTL expires ~2026-11-11 (matches proposal). | Purge/scoping is a one-off data op, not code; gates only negativity, never ranking order (verified: `esNoVendido` is an early return before ranking). | Manual SQL step owned by executor; requires Supabase console access. |
| D7 | **Verdict documentation** (R7). Executor records the measured gap + verdict in `RAG.md` (§3 stats table) and `plans/010-recall-por-antiguedad-de-venta.md` (Status), with each deferral and its owning plan: RRF → plan 006; full SIN audit, 3-large embeddings, weighted sampling, and plan 010 steps 4-5 → their plans. | Durable, auditable evidence for ranking decisions. | — |
| D8 | **Ignore generated results.** `.gitignore` gains `scratch_live/_coloquial_resultados*.json`. Current pattern `scratch_live/*_resultado.json` does NOT match the plural `_resultados.json`; plan 010's claim that `*.json` is covered is inaccurate. | Keeps 300 KB-plus generated artifacts out of git; the cached `_coloquial_set.json` stays versioned. | Deviation from proposal's "affected areas" list — justified by R1's output file. |

## 3. Interfaces

### CLI (`scripts/_test_coloquial.js`)

| Flag | Meaning |
|---|---|
| `--set` default | full 320-case run; writes official file on completion |
| `--limit N` | partial run; prints only, never writes official file |
| `--sin-vector` | existing; drops OpenAI key (cold path) |
| `--sin-aprender` | new; D1 isolation (no upsert, no webhook) |
| `--etiqueta <tag>` | existing (print label); now also suffixes the output file: `_coloquial_resultados_<tag>.json` |
| `--ab <a> <b>` | new; reads two tagged files, prints gate verdict, no search executed |

### `_coloquial_resultados*.json` schema

```json
{
  "meta": { "set": "_coloquial_set.json", "casos": 320, "flags": ["--sin-aprender"], "fecha": "ISO", "duracion_s": 960 },
  "resumen": {
    "exacto": 246, "exacto_pct": 76.9, "categoria": 43, "nada": 31,
    "buckets": {
      "<1 año":  { "total": 174, "exacto_pct": 80.0 },
      ">1 año":  { "total": 23,  "exacto_pct": 70.0 },
      "sin historial": { "total": 123, "exacto_pct": 50.0 }
    }
  },
  "resultados": [
    { "codigo": "X", "consulta": "…", "ok": true, "posicion": 2, "top1": "…", "rescate": false, "parcial": false }
  ]
}
```

- `ok` = exact normalized-description hit (same rule as today's `hit`); `posicion` = 1-based index of the expected product in `productos`, `0` when absent; `top1` = `productos[0]?.nombre ?? null`; `rescate` = `Boolean(res.rescate)`; `parcial` = `Boolean(res.parcial)` (drop-one relaxation).

## 4. File Changes

| File | Change |
|---|---|
| `scripts/_test_coloquial.js` | Modify: D1 shim interception, D2 persistence (atomic), D3 bucket join + report, D4 `--ab`, D8-aware filenames |
| `scripts/_diag_negativa.js` | Rewrite: run live body + D1 isolation, `--qs` mode, drop hardcoded rows |
| `rag.js` | Modify: `diag` prints `no_vendido` line; `medir` already passes flags |
| `scripts/_test_busqueda_50.js` | Modify (D6): 2 rows `exists: null` → asserted true/false after hand-verification |
| `.gitignore` | Modify (D8): add `scratch_live/_coloquial_resultados*.json` |
| `RAG.md`, `plans/010-*.md` | Modify (D7): verdict, gap, deferrals |
| `tests/coloquial_harness.test.js` | New: hermetic tests (node:test + fake-axios) |

NOT touched: `live_buscar.js`, `new_buscar.js`, `n8n_workflow.json`, `_coloquial_set.json`.

## 5. Testing Strategy

Hermetic (no network), reusing `tests/support/fake-axios.js` (unmatched-request tracking + `assertAllMatched`):

- Flag parsing: unknown flag → stderr + exit 1; `--ab` with missing files → clear error; `--limit` + `--etiqueta` combos.
- D1: with `--sin-aprender`, POSTs to `catalogo_vocabulario` / `automejora-busqueda` are never issued (assertAllMatched passes; fake logs show the skip); RPC POSTs and GETs still issued.
- D2: full run writes `meta/resumen/resultados` with exactly N records and all 7 fields; `--limit` writes nothing; atomic file survives a simulated throw mid-write.
- D3: pure `bucketDeUltimaVenta(fecha, hoy)` — null → `sin historial`; exactly 365d boundary; denominators sum to total.
- D4: gate math — gaps 4.9 → REJECTED, 5.0 → conditional.
- `rag.js regresion` = 0 FN (executor E2E, live).

RED tests first: `node --test tests/coloquial_harness.test.js` fails before implementation.

## 6. Threat Matrix

No new routing, git, PR, or executable-file boundaries. The only process boundary is the existing `rag.js` → `correr()` child dispatch, extended only by pass-through flags — covered by the harness tests above.

| Boundary | Applicability | Reason |
|---|---|---|
| Documentation-like paths | N/A | No docs executed |
| Git repository selection | N/A | No `git -C`/path selection added |
| Commit state | N/A | No commit manipulation |
| Push state | N/A | No push logic |
| PR commands | N/A | No PR automation |

## 7. Risks and Mitigations

- **HNSW noise**: vector vs `--sin-vector` both run against the same 320 cases; a 1-2 case diff is noise (RAG.md §6.3) — the 5-pt gate (=16 cases) absorbs it.
- **~16–30 min per full run** ×2: use `--limit` for smoke checks; official numbers only from full runs (`--limit` never writes official file).
- **`rag.js` drops bare args**: gate invoked as `node scripts/_test_coloquial.js --ab vec sinvec`, documented in RAG.md §6.
- **Purge requires manual SQL** (anon key can't DELETE `busqueda_negativa`): blocked until executor has console access; suite expectations upgraded so a regression is caught next time.
- **Popularidad lag**: bucketing is evidence, never a gate input.

## 8. Out of Scope / Deferred

RRF (plan 006), full SIN audit, 3-large embeddings, weighted sampling, plan 010 steps 4-5 (`--sin-ventas`). All recorded in D7. Ranking layer unchanged.