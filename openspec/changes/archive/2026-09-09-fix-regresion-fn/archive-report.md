# Archive Report — fix-regresion-fn

- **Change**: `fix-regresion-fn`
- **Store**: openspec (repo-local) — `C:\Proyect\whatsapp-agent\openspec`
- **Date**: 2026-09-09
- **Phase**: archive (sub-agent `sdd-archive`)
- **Archived to**: `openspec/changes/archive/2026-09-09-fix-regresion-fn/`
- **Rama**: `perucho`

## 1. Archive Readiness

Dispatcher native status: `archive: ready`, `nextRecommended: archive`.

- Task Completion Gate: **PASSED** — `tasks.md` shows 12/12 tasks `- [x]`, 0 unchecked implementation tasks. Task 4.2 is a conditional closed in **FALSE** with evidence (gate 4.1: tilde probe returned 4 rows > 0 with Phase A alone → "Phase C not adopted"; no work owed), consistent with the archived rrf-reintento convention of conditionals closed in FALSE with evidence.
- Verify gate: `verify-report.md` verdict `pass_with_warnings` (`gentle-ai.verify-result/v1`), `critical_findings: 0`, `blockers: 0`, requirements **5/5**, scenarios **12/12**. Evidence revision `sha256:f98420648416ed7d15afa45c22581e022b6866728f6d3eb9747dd445e085b43a`. No CRITICAL issues → archive not blocked by the verify gate.
- Action context: no `workspace-planning` mode; all archive operations confined to repo-local `openspec/` (+ a scoped `RAG.md` note). No `openspec/config.yaml` exists, so no `rules.archive` constraints apply.

## 2. Final State at Close

> Per the Final-State Authority hierarchy — tasks artifact, then orchestrator final-state facts (the launch prompt is the most recent account and OUTRANKS intermediate snapshots), then verify-report/apply-progress as valid history of their time.

- **Root cause fixed**: the LÁMINA rule (commit `2b065b4`) aliased `unicos` (`let lf = unicos`, `live_buscar.js:867`); the trailing rewrite block (907-909) emptied `unicos` then iterated the same emptied array → 0 rows for "lamina de zinc" / "sinz de 6 metros" (FNs #28/#11). Phase A replaced the alias with a defensive copy (`unicos.filter(() => true)`), the same idiom as CEMENTO/CABILLA/PINTURA, applied byte-identical to `scratch_live/live_buscar.js` and `scripts/new_buscar.js`.
- **Regression verdict (final, double-confirmed)**: `falsos_negativos` **2 → 0**. Case #28 ("lamina de zinc") **no longer flagged**. Case #11 ("Que precio este tipo de sinz de 6 metros") is **no longer a FALSO-NEGATIVO** but flags `🟡 parcial` — class change to measure/ranking debt, out of scope for this change, follow-up tracked in RAG.md §7. Total flags 34 → 33 (the residual is the same #11 `parcial`, not an FN).
- **Live probes**: "lamina de zinc" **0 → 4**; control "lamina de zinc azul" **== 4** (sub-filters intact); tilde probe "…arquitectónicas…" **4 > 0** with Phase A alone, all narrowing to `_esCuadrada` → **Phase C NOT adopted** (gate with Phase A alone returned > 0; skip documented).
- **Tests**: `node --test tests/lamina_search.test.js` **10/10** (7-row regression table + legacy tests); `npm test` **119/119** with `check_sources_sync` **OK**; `check_workflow_sync` RED is pre-existing, proven in a detached worktree on parent `244bd51` — non-blocker per delta spec R-NOTOUCH.
- **Commits** (rama perucho, conventional, no AI attribution, no push/PR): `0a1b971` (fix), `fdd4c3d` (tests), `01a91db` (docs). None touch `n8n_workflow.json`, `boot_serrucho.ps1`, or `scratch_live/_coloquial_set.json`.
- **Deploy**: **NO** (conditional, not opened — the LÁMINA rule returned 0 pre-fix for these queries, so there is no ranking change; `deploy_nodos.js` not run).
- **Contradiction resolution**: no unrankable contradictions. The `apply-progress` "Deviation from task letter" (flags 34→33 vs ≤32) and the verify-report WARNING #1 are consistent with the final state: the letter's ≤32 was not met, but the primary spec criterion (falsos_negativos == 0) was met, and the residual is out-of-scope debt — not echoed as an open failure.

### Final-state facts vs intermediate snapshots

- `apply-progress` (2026-09-08) recorded 4.2 as pending-conditional ("Phase C skipped") and flags 34→33; the current `tasks.md` (persisted, uncommitted checkbox flip `- [ ]` → `- [x]` for 4.2) is the terminal account: 12/12 complete. Reported per the hierarchy, not as a stale gap.
- The orchestrator's final-state facts (FN 0 twice-confirmed, sha256 `f9842064…`, 119/119) corroborate `verify-report`'s claims; no snapshot claim contradicts a higher-ranked source.

## 3. Spec Sync (Step 2)

One delta spec in the change: `specs/search-accuracy-benchmark/spec.md`. Main spec exists → merge edit into `openspec/specs/search-accuracy-benchmark/spec.md` (the mechanical-copy restriction governs full-file copies; a delta merge into an existing spec is a genuine merge edit, same convention as the rrf-reintento R4 merge).

| Domain | Action | Details |
|--------|--------|---------|
| search-accuracy-benchmark | **Updated** | R5 "Regression front-C verification" **MODIFIED** (replaced with the delta's full block: 2 preserved scenarios + 2 new — "LÁMINA alias FNs cleared", "Zinc probe and azul control"; `(Previously: …)` note added). **ADDED** 4 requirements: "LÁMINA rule defensive array copy" (R8), "Byte-identical mirror and source sync" (R9), "Accented sub-filter variants (Phase C, conditional)" (R10), "No-touch guard" (R11). Index table extended R8–R11. R1–R7 preserved unchanged (R4 carries the previously-merged rrf-reintento state, still uncommitted in the worktree). |

**RAG.md**: acotada archive note appended to §7 item 2 (`fix-regresion-fn` RESUELTO), stating the cycle closed PASS WITH WARNINGS and the #11 `parcial` debt remains that entry. No other RAG.md change.

## 4. Archive Move (Step 3) — Mechanical Copy Contract

- Source: `openspec/changes/fix-regresion-fn`
- Destination: `openspec/changes/archive/2026-09-09-fix-regresion-fn`
- Mechanism: per the orchestrator's explicit instruction and the rrf-reintento precedent ("snapshot `diff -r` + plain `mv`, no `git mv`"), a plain `mv` with a pre-move recursive snapshot. NOTE: `git mv` is impossible here regardless — the change folder contains an untracked file (`verify-report.md`), so `git mv` on the directory is refused; plain `mv` is the correct mechanical mechanism, exactly as in the rrf-reintento archive.
- Pre-move snapshot verified byte-equal to source (**SNAPSHOT_VERIFY: OK**).
- Post-move: source absent, destination present.
- MANDATORY readback `diff -r` (snapshot vs destination): **EMPTY — no differences (PASS)**, exit 0 — the only passing evidence.

Verbatim readback output:

```text
SNAPSHOT_VERIFY: OK
SOURCE_GONE: True
READBACK: EMPTY - no differences (PASS)
```

(The `archive-report.md` written in Step 5 is additive and excluded from the comparison — it did not exist in the source snapshot.)

## 5. Archive Verification (Step 4)

| Check | Result |
|-------|--------|
| Main specs updated correctly | ✅ `openspec/specs/search-accuracy-benchmark/spec.md` R5 replaced + R8–R11 added; R1–R7 preserved |
| Change folder moved to archive | ✅ `openspec/changes/archive/2026-09-09-fix-regresion-fn/` |
| Archive contains all artifacts | ✅ proposal.md, specs/search-accuracy-benchmark/spec.md, design.md, tasks.md, apply-progress.md, verify-report.md |
| Archived `tasks.md` no unchecked tasks | ✅ 12/12 `- [x]`, 0 `- [ ]` (4.2 closed in FALSE with evidence) |
| Active changes dir no longer has change | ✅ `openspec/changes/fix-regresion-fn` absent; `openspec/changes` holds only `archive/` |
| `diff -r` readback empty | ✅ empty output, exit 0 |

## 6. Risk Register / Carry-Forward (at close)

1. **#11 residual `🟡 parcial`** (measure/ranking debt, not FN): "sinz de 6 metros" returns malla/alambrón top-4 because the `medLargas` measure filter ("6") + existencia ranking beat the 6-mts zinc lamina. Out of scope for this change; follow-up already tracked in RAG.md §7 item 2 (suggested: sub-filtro material zinc via the computed-but-unused `wantZinc`, or a stricter measure filter). Not a blocker.
2. **Worktree drift (pre-existing, must be committed under its own work unit before deploy)**: `n8n_workflow.json` + `boot_serrucho.ps1` (Sep 6 hardening, mtimes pre-dating this change), untracked `scripts/apply_workflow_hardening.js` + `scripts/patch_container_runtime.js`, and the rrf-reintento archive leftovers (tracked `D` + untracked archive folder + uncommitted R4 merge in the main spec). The rrf-reintento leftovers must NOT be tangled with the fix-regresion-fn archive in a single commit — separate work units per work-unit hygiene. This drift keeps `check_workflow_sync` red (widening source), proven pre-existing at `244bd51`.
3. **Front-C queries #1/#4 flag `no_vendido`** (`conocido: null`, both): NOT false negatives (`falsos_negativos` 0), but the stale-`busqueda_negativa`-purge-vs-corrected-expectation reconciliation recommended by verify-report WARNING #3 remains **UNRESOLVED at archive time** — carried forward explicitly, not silently closed. Needs a data cleanup decision (purge/scoped rows vs corrected expectations) before the next regresion gate is trusted for those two cases.
4. **Archive result is uncommitted in the worktree** (precedent-consistent with the rrf-reintento archive, which also left its move/merge uncommitted): the archived folder, the main-spec merge (shared file also carrying rrf R4 — commit separately), the RAG.md note, and the tracked-file deletions for the moved artifacts are all pending. Recommend `docs(openspec): archive fix-regresion-fn` as its own work unit once the maintainer consolidates the openspec docs state.

## 7. Traceability

Artifacts read (openspec paths): `proposal.md`, `specs/search-accuracy-benchmark/spec.md` (delta), `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`; plus `openspec/specs/search-accuracy-benchmark/spec.md` (main) and the prior archive `2026-09-08-rrf-reintento/` (structure + merge convention). Store is openspec (repo-local); no Engram observation IDs apply to filesystem artifacts. Engram mirror of this report persisted under topic `sdd/fix-regresion-fn/archive-report` per the persistence contract (type `architecture`, `capture_prompt: false`).

## 8. Verdict

**SDD cycle COMPLETE.** Change planned, implemented (12/12 tasks, 4.2 closed in FALSE with evidence), verified (PASS WITH WARNINGS, 5/5 requirements, 12/12 scenarios, `falsos_negativos` 0 double-confirmed), and archived with a byte-identical mechanical copy (empty `diff -r` readback). Deploy correctly NOT executed (conditional never opened — no ranking change). The #11 `parcial` residual, the pre-existing worktree drift, and the #1/#4 `no_vendido` reconciliation are recorded as carry-forward debt with owning follow-ups, not as blockers.