# Apply Progress: Fix LÁMINA Rule Array-Alias Regression (FN #11/#28)

> Applies `openspec/changes/fix-regresion-fn` (proposal → design → tasks).
> Status: **complete** — code, tests, measurement and docs done; NOT deployed; next phase: **verify**.
> Branch: `perucho`. Commits: `0a1b971` (fix), `fdd4c3d` (tests), plus docs commit. No push, no PR.

## Executive Summary

The LÁMINA rule (`2b065b4`) self-emptied its candidate list whenever the query triggered no
sub-filter: `let lf = unicos` aliased the array, and the trailing rewrite block
(`unicos.length = 0; for (x of lf) unicos.push(x)`, lines 907-909) iterated an emptied list →
**0 results** for "lamina de zinc" and "sinz de 6 metros" (regression FNs #28/#11).

Phase A replaces the alias with a defensive copy — `unicos.filter(() => true)` — the same
idiom already used by the CEMENTO/CABILLA/PINTURA rules. Applied byte-identical to
`scratch_live/live_buscar.js` and `scripts/new_buscar.js` (R-MIRROR). A 7-row hermetic
regression table was added to `tests/lamina_search.test.js` with the fixture rows it needs.

## Evidence (measured 2026-09-08)

| Check | Baseline (`b1e8823`) | After fix | Verdict |
|---|---|---|---|
| `node rag.js regresion` (86 cases) — FN | 2 | **0** | ✅ core R-FN met |
| #28 "lamina de zinc" flags | ❌ FALSO-NEGATIVO | none | ✅ |
| #11 "sinz de 6 metros" flags | ❌ FALSO-NEGATIVO | 🟡 parcial | ⚠️ class change; watchlist, not FN |
| Total flags | 34 | 33 | ⚠️ 1 short of the task's ≤32 (same #11 residual) |
| Live probe "lamina de zinc" | 0 | **4** | ✅ |
| Live control "lamina de zinc azul" | 4 | **4** | ✅ sub-filters unchanged |
| Live tilde probe "…arquitectónicas…" (Phase C gate) | — | **4**, all → `_esCuadrada` | ✅ skip gate met |
| `node scripts/check_sources_sync.js` | — | OK | ✅ mirror intact |
| `node --test tests/lamina_search.test.js` | — | 10/10 | ✅ |
| `npm test` (11 node suites + sync checks) | 119 pass | 119 pass | ✅ |
| dashboard typecheck / test | — | exit 0 / 21 pass | ✅ |
| `check_workflow_sync.js` | red at HEAD (1041 vs 1049 lines, pre-existing) | red (unchanged) | ✅ non-blocker per delta spec |

## Deviation from task letter (documented, not silent)

Task 3.2's letter ("#11/#28 unflagged; flags 34→≤32") is **partially met**:
`falsos_negativos` is 0 and #28 is unflagged, but #11 keeps a `🟡 parcial` flag and total
flags measure 33.

Root cause of the residual is NOT the aliasing bug (fixed). Under contract v11,
`encontrados > 0` = a useful product is returned; "parcial" lands because the top-4 for
"sinz de 6 metros" are mallas/alambrón — the `medLargas` measure filter (`"6"`) plus
existencia ranking beat the 6-mts zinc lamina. This is pre-existing **typo + measure**
debt in the measure/ranking layer (RAG.md §7), explicitly out of scope ("NO toques ranking
general"; design threat matrix: ranking NOT affected). The design even predicted #11's
deeper issue ("el mapa SIN ya tiene 'sinz':'lamina zinc' pero no alcanza: el rescate no
resuelve el typo + medida").

Delta scenario "LÁMINA alias FNs cleared" should therefore be judged on its primary
assertion — `falsos_negativos` is 0 — with #11's "parcial" treated as known residual debt
(same count, weaker class, root cause outside this change).

## Phase C (tilde) — NOT adopted

Gate (tasks 4.1): live probe "tienes lamina arquitectónicas de las q mide 6 metros x 1 de
ancho que presio la tienes" → **4 encontrados > 0**, all narrowing to `_esCuadrada`
(3× Lamina Arquitectonica + 1× Canal Cuadrado), with Phase A alone. `norm()` strips the
accent from the query before `wantCuadrada` fires, so accented raw descriptions never need
to match. Skipped and documented in RAG.md (delta scenario "Phase C skipped is
non-breaking" holds: controls unchanged).

## Test artifacts

- Fixture: `tests/fixtures/catalog.json` now 16 rows — LAM-006 plain zinc (regression
  probe), LAM-007/008/009 zinc+azul variants so the azul control asserts exactly 4.
- Table: `REGRESION_LAMINA_TABLE` (7 rows) in `tests/lamina_search.test.js` — alias,
  alias-typo, azul/rojo/prepintada/cuadrada controls, tilde probe. Hermetic driver:
  `tests/support/load-live-buscar.js` (injected axios, fixture config).
- Independent RED evidence (scratch, pre-fix): "lamina de zinc"→0, "lamina sinz"→0.

## Ledger (runtime attempts)

4 attempts acquired/settled via `gentle-ai sdd-attempt` (all `state: complete`):

| Work unit | Harness | Evidence |
|---|---|---|
| fase3-regresion-86 | `node rag.js regresion` | `scratch_live/regresion_resultado.json` (gitignored) |
| fase3-probe-lamina-zinc | `node rag.js buscar "lamina de zinc"` | 4 rows (temp) |
| fase3-probe-azul-control | `node rag.js buscar "lamina de zinc azul"` | 4 rows (temp) |
| fase3-probe-tilde-gate | `node rag.js buscar "…arquitectónicas…"` | 4 rows, all cuadradas (temp) |

All harnesses reused (project-owned, read-only). No tracked files changed by harness runs.

## Deploy

**NOT deployed — default NO.** The LÁMINA rule returned 0 rows pre-fix for these queries
(no ranking change), so deployment is optional and only via `scripts/deploy_nodos.js`
(read-only; **not run**) if the maintainer requests it. The n8n workflow picks up
`scratch_live/live_buscar.js` on next boot only if the maintainer decides. `.env` untouched.

## Work units (conventional commits, no AI attribution, no push/PR)

1. `0a1b971 fix(search): LAMINA rule uses defensive array copy (live + mirror)`
2. `fdd4c3d test(search): LAMINA alias-regression table and zinc fixture rows`
3. `docs(search): record fix-regresion-fn apply verdict and Phase C skip` — RAG.md + change docs

## Next

Pass to the **verify** phase: re-run `node --test tests/lamina_search.test.js` and
`node rag.js regresion`, judge the `search-accuracy-benchmark` delta scenarios (zero FN,
mirror sync, no-touch guard, Phase C non-breaking skip).