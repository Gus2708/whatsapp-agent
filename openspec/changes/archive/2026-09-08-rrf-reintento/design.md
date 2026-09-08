# Design: Hybrid Vector Adoption & Regression Isolation

## Technical Approach

Three tracks, one change. **A3** edits only the adoption condition in the vector-rescue zone of the matcher (`live_buscar.js` lines 665-680, mirrored byte-identically into `new_buscar.js`): it adds a category+confidence branch beside the existing simLex branch while `_falta` (line 666) remains the sole entry gate — the happy path never calls OpenAI. **C** isolates the 244→231 drop by running the harness against old matcher bodies from a temp tree: the harness already executes the body from disk every run (`_test_coloquial.js:32,60`), so only the body is swapped. **Gate** reuses the cached-set A/B (`--ab`, threshold ≥ 5) plus existing regression and sync guards.

## Architecture Decisions

| # | Decision | Choice | Alternatives | Rationale |
|---|----------|--------|--------------|-----------|
| A3-1 | Adoption condition | `(_lexFalla) || (_catDiff && _vecFiable)`, `_vecFiable` = `_vec.length>0 && Number(_vec[0].similitud) >= 0.55` | pure category rule (breaks tapa); pure simLex (current: gap 0, vector dormant); lower threshold (fragile, band 0.399–0.606) | Recovers the ~+7 category cases whose `simLex >= 0.52` while keeping disco/tapa protections |
| A3-2 | `simLex === null` | falls to category branch **with** the 0.55 guard: `_lexFalla = _vr.simLex !== null && _vr.simLex < UMBRAL_LEXICO_FIABLE` | unguarded `catDiff` fallback (today) | Spec R-A3: "same top-similitud guard"; blocks `buscar_semantico` noise-floor rows (umbral 0.45) |
| A3-3 | Empty vector | `_vec.length > 0` gate in the final condition; `_vecFiable` false with no rows | — | Spec: empty vector SHALL NOT be adopted |
| A3-4 | Rescue sort (975-979) | **UNCHANGED** | touch similitud/sales tiebreak | Sort already ranks vector rows by `similitud` with sales tiebreak for \|dsim\| < 0.03 (explore: confirmed). A3 only changes which queries reach it, never the order |
| A3-5 | Byte-identity | Same patch applied to both files | single source + generator | Existing convention: every matcher commit touches both; `check_sources_sync.js:13-16` asserts equality; hashes must stay equal to today's `4f261dbb…` |
| P-1 | Probe layer 1 | Hermetic truth-table driving the REAL body via `tests/support/load-live-buscar.js` + stubbed embeddings/RPCs | unit test of a logic copy | Doctrine (D5): never test a replication of the matcher |
| P-2 | Probe layer 2 | New live runner `scripts/_test_probes.js` reusing `buscarCon`/`crearAxiosShim`/`construirEnv` | new flag in `_test_coloquial.js`; hook into `rag.js` suite | No `rag.js` scope creep; probes cost ~30 s |
| C-1 | Isolation | Temp-tree overlay per suspect: old body + current set/harness/creds | full `git worktree`; revert-in-place | Body is the single variable; set/harness stay current (42db33c D3 fix must be present) |
| C-2 | Fold-in | Separate reversible commit, both matcher files patched identically | amend into A3 | Spec R-FASEC: bounded, reversible, verified |

## Data Flow

```
query ──► lexical (ilike + casanDeVerdad, drop-one) ──► res[0]
   │
   └─── iff _falta (666: missing word in top-1):
           buscarVectorial(res[0].codigo_interno) ──► {filas, simLex}
             ├─ _lexFalla  = simLex!==null && simLex<0.52        (613)
             ├─ _catDiff   = _vcat !== _d0.split(' ')[0]
             ├─ _vecFiable = _vec.length>0 && Number(_vec[0].similitud)>=0.55
             └─ adopt ⇔ _vec.length>0 && (_lexFalla || (_catDiff && _vecFiable))
                   ──► res = _vec; _rescate={categoria:_vcat, termino:'', confianza:4}
                   ──► sort 975-979 (similitud, |dsim|>=0.03, else sales) — unchanged
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scratch_live/live_buscar.js` | Modify | Add `UMBRAL_VECTOR_ADOPTAR = 0.55` after line 613; replace lines 671-679 with hybrid condition |
| `scripts/new_buscar.js` | Modify | Identical patch; verify `git hash-object` equal + `check_sources_sync` green |
| `tests/probes_hibrida.test.js` | Create | Hermetic truth-table over the live body (5 spec scenarios) |
| `scripts/_test_probes.js` | Create | Live E2E probes: disco NOT adopted, tapa adopted |
| `RAG.md`, `plans/010-*.md` | Modify | Verdict + deferrals/rollback notes (proposal) |
| `n8n_workflow.json`, `_coloquial_set.json` | No touch | `n8n_workflow.json` already has pre-existing worktree M; set versioned at `a0ceb1f` |

## Interfaces / Contracts — exact A3 patch (adoption zone, lines 665-680)

```js
const _d0 = norm(res[0].descripcion || '');                    // 665 — unchanged
const _falta = qTokens.filter(t => !/\d/.test(t)).some(t =>    // 666 — unchanged (sole gate)
  !aliasDe(t).some(a => _d0.includes(a)));
if (_falta){                                                   // 667 — unchanged
  const _vr = await buscarVectorial(res[0].codigo_interno);    // 668 — unchanged
  const _vec = _vr.filas;                                      // 669 — unchanged
  const _vcat = _vec.length ? norm(_vec[0].descripcion || '').split(' ')[0] : '';
  const _catDiff = _vcat !== _d0.split(' ')[0];
  const _vecFiable = _vec.length > 0 && Number(_vec[0].similitud) >= UMBRAL_VECTOR_ADOPTAR;
  const _lexFalla = _vr.simLex !== null && _vr.simLex < UMBRAL_LEXICO_FIABLE;
  if (_vec.length > 0 && (_lexFalla || (_catDiff && _vecFiable))){
    res = _vec;
    _rescate = { categoria: _vcat, termino: '', confianza: 4 };
  }
}
```
Plus, after line 613: `const UMBRAL_VECTOR_ADOPTAR = 0.55;`

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Hermetic | Adoption truth table (real body, stubbed vector endpoints, `OPENAI_API_KEY` injected) | `tests/probes_hibrida.test.js`: (a) simLex 0.40 → adopt; (b) simLex 0.58 + same cat + vec 0.60 → NO; (c) simLex 0.58 + catDiff + vec 0.60 → adopt (+7); (d) simLex 0.58 + catDiff + vec 0.50 → NO; (e) simLex null + catDiff + vec 0.60 → adopt; (f) empty vector → NO; (g) `_falta` false → embeddings endpoint never called |
| Live probes | disco de corte / tapa para el bano (real Supabase+OpenAI, `--sin-aprender` shim) | `node scripts/_test_probes.js`: disco → top1 identical to `--sin-vector` run, `rescate:false`; tapa → vector run `rescate:true`, top1 matches `/inodoro|poceta|\bwc\b/i`, differs from sin-vector run. Result JSON `scratch_live/probes_resultado.json` |
| A/B gate | 320 cached | `--ab vec-new sinvec-new`; gap ≥ 5 → conditional |
| Regression | 86 cases | `node rag.js regresion` → 0 FN |
| Sync guard | Byte-identity | `npm test` (`check_sources_sync.js`) + `git hash-object` on both files |

## Threat Matrix

N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. (Phase C uses read-only `git show` into a temp dir; the only executed code is the repo's own harness and matcher body.)

## Migration / Rollout

**Phase C isolation** (per suspect S ∈ {b439c4a, c33e0b0}; ~32 min each, optional 0c31b52 reference +16 min — run under `%TEMP%\opencode\rrf-c\<S>`):
1. Build tree: `scratch_live/`, `lib/`, `scripts/`, `.env` (copied, never symlinks into repo).
2. `git show S~1:scratch_live/live_buscar.js > <tree>\scratch_live\live_buscar.js`; repeat for `S` into a second tree.
3. Overlay CURRENT `_coloquial_set.json`, `scripts/_test_coloquial.js` (D3 pagination fix land), `scripts/_lib_credenciales.js`, `lib/serrucho-search.js`, `.env`.
4. From each tree: `node scripts/_test_coloquial.js --sin-aprender --etiqueta <S>-before|-after` (never `--sin-vector`: total recall per body). Results persist inside the temp tree only.
5. **Confirmation**: `after.exacto < before.exacto` → suspect confirmed (drop reproduced on cached set; the optional 0c31b52 body run ≈ 244 grounds the −13 denominator; env drift shifts both sides equally). Inconclusive → verdict documented, zero matcher changes (R-FASEC).
6. **Fold-in** (if confirmed): minimal bounded correction, both matcher files identically → ONE separate commit → re-run that pair's A/B + `regresion` + `npm test`. Never breaks sync; `n8n_workflow.json` untouched; rollback = `git revert <commit>`.

**Gate sequence** (measured after A3 with/without fold-in):
```
node scripts/_test_coloquial.js --sin-aprender --etiqueta vec-new      # hybrid rule
node scripts/_test_coloquial.js --sin-aprender --sin-vector --etiqueta sinvec-new
node scripts/_test_coloquial.js --ab vec-new sinvec-new                # gap >= 5 → conditional
node scripts/_test_probes.js
node rag.js regresion                                                  # 0 FN
npm test
```
Verdicts: `vec-new` > 246/320 (76.9%); `sin historial` bucket ≥ 75.6%; gap ≥ 5; probes green; 0 FN.

**Deploy** — ONLY if gate passes: `node scripts/deploy_nodos.js` (npm test guard built in; pushes body into node `buscar_productos_tool` via API, never via `n8n_workflow.json`). **Rollback**: `git checkout -- scratch_live/live_buscar.js scripts/new_buscar.js` + redeploy. C-fix rollback: `git revert` of its commit.

## Open Questions

- None blocking. Note: the 0.55 guard sits inside the measured HNSW band (TAPA DE INODORO observed at 0.544 and 0.619); `tapa para el bano` adoption therefore relies on the simLex branch. If a live-probe run reports `simLex >= 0.52`, the probe may flake — re-run once and record both trials in `probes_resultado.json`.