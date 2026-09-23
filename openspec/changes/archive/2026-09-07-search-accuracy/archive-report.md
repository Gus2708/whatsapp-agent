# Archive Report — search-accuracy

- **Change**: `search-accuracy`
- **Store**: openspec (repo-local) — `C:\Proyect\whatsapp-agent\openspec`
- **Date**: 2026-09-07
- **Phase**: archive (sub-agent `sdd-archive`)
- **Archived to**: `openspec/changes/archive/2026-09-07-search-accuracy/`
- **Rama**: `perucho`

## 1. Archive Readiness

Dispatcher native status (pre-launch): `archive: ready`, `taskProgress 20/20`, `applyState: all_done`, `nextRecommended: archive`, `blockedReasons: []`.

- Task Completion Gate: **PASSED** — `tasks.md` shows 20/20 tasks `- [x]`, 0 unchecked implementation tasks.
- Verify gate: `verify-report.md` verdict `pass`, `critical_findings: 0`, `blockers: 0`, requirements 7/7, scenarios 12/12 (validator `gentle-ai sdd-verify-validate` reported `valid: true` per orchestrator).
- Action context: no `workspace-planning` mode; no `allowedEditRoots` restriction reported; archive confined to repo-local `openspec/`.

## 2. Final State at Close (per Final-State Authority: tasks artifact > orchestrator final-state facts > verify-report/apply-progress)

- **Measurement verdict**: A/B on cached set (320 cases) — vector 231/320 (72,2%) = sin-vector 231/320 (72,2%), **gap 0 pts → REJECTED**. Historical 76,9% → today 72,2% = measured REGRESSION, attributed to plan 006 attempt 4 (`0c31b52`).
- **Buckets** (paged join corrected): `<1 año` 72,5% (124/171), `>1 año` 53,8% (14/26), `sin historial` 75,6% (93/123); denominators sum 320.
- **Deliverables**: harness `scripts/_test_coloquial.js` instrumented (D1–D4 + paged join D3 + `--ab` gate), hermetic tests `tests/coloquial_harness.test.js` (**15/15, 6 suites**), `scripts/_diag_negativa.js` rewritten (D5), `rag.js diag` aligned, `scripts/_test_busqueda_50.js` `exists:false` (D6), `RAG.md` §3 + `plans/010-*.md` verdict recorded (D7).
- **Commits**: `853c4b2` (WU1 harness+tests+gitignore), `f16df12` (WU2a diagnostics), `8f7efc1` (WU2b suite expectations), `42db33c` (D3 pagination fix), `b1e8823` (verdict docs). No commit touches ranking (`live_buscar.js`, `new_buscar.js`, `n8n_workflow.json` intact for this change — `n8n_workflow.json` has an unrelated pre-existing local modification, not included).
- **Deferrals documented** (R7): RRF rework + `0c31b52` review → plan 006; full SIN audit, 3-large embeddings, weighted sampling, plan 010 steps 4-5 → their own plans.
- **Contradiction check**: `verify-report` note "worktree sin commitear (D3 fix, RAG.md, plans/010)" was written at verification time; the orchestrator's final-state facts place those in commits `42db33c` + `b1e8823`. Higher-ranked source (launch prompt) + `git log` evidence resolve it: those files are committed as of close. No unresolved contradictions.

## 3. Spec Sync (Step 2)

Delta spec domain: `search-accuracy-benchmark`. Main spec `openspec/specs/search-accuracy-benchmark/spec.md` did **not** exist → delta spec is a full spec; copied mechanically with native shell (`Copy-Item` to temp + `Move-Item`), verified byte-identical.

| Domain | Action | Details |
|--------|--------|---------|
| search-accuracy-benchmark | Created | `openspec/specs/search-accuracy-benchmark/spec.md` — 7 requirements (R1–R7), 12 scenarios |

Readback evidence:
- `git diff --no-index "openspec/changes/search-accuracy/specs/search-accuracy-benchmark" "openspec/specs/search-accuracy-benchmark"` → exit 0 (no differences, only LF/CRLF warnings).
- `fc /b` (delta vs main, pre- and post-move) → "FC: no se han encontrado diferencias", exit 0.

## 4. Archive Move (Step 3) — Mechanical Copy Contract

- Source: `openspec/changes/search-accuracy`
- Destination: `openspec/changes/archive/2026-09-07-search-accuracy`
- `git mv` attempted first → failed (`fatal: source directory is empty` — source dir fully untracked, `git ls-files openspec/` = 0). Fallback path executed per skill: snapshot verified against source (`diff -r` between `$snapshot_root/source` and source → empty), then plain `mv`.
- MANDATORY readback `diff -r "$snapshot_root/source" "$destination"` → **empty output, exit 0**. Source absent after move. Snapshot removed by EXIT trap.

Verbatim archive transaction output:

```text
fatal: source directory is empty, source=openspec/changes/search-accuracy, destination=openspec/changes/archive/2026-09-07-search-accuracy
ARCHIVE_MOVE_OK: destination=openspec/changes/archive/2026-09-07-search-accuracy
```

Verbatim post-move readback (`diff -r` snapshot vs destination): *(empty — no differences)*, exit 0.

## 5. Archive Verification (Step 4)

| Check | Result |
|-------|--------|
| Main spec updated correctly | ✅ `openspec/specs/search-accuracy-benchmark/spec.md` byte-identical to delta |
| Change folder moved to archive | ✅ `openspec/changes/archive/2026-09-07-search-accuracy/` |
| Archive contains all artifacts | ✅ proposal.md, specs/search-accuracy-benchmark/spec.md, design.md, tasks.md, apply-progress.md, verify-report.md |
| Archived `tasks.md` no unchecked tasks | ✅ 20/20 `- [x]`, 0 `- [ ]` |
| Active changes dir no longer has change | ✅ `openspec/changes/search-accuracy` absent |
| `diff -r` readback empty | ✅ empty output both moves |

## 6. Risk Register (at close)

- **Regression 76,9% → 72,2%**: real, measured, documented; remediation deferred to plan 006 (RRF + `0c31b52` review). Not resolved by this change by design.
- **Reproducibility**: harness remains fully instrumented (`--sin-aprender`, `--sin-vector`, `--etiqueta`, `--ab`, paged join) for plan 006 re-measurement.
- **Popularidad lag / pagination**: `producto_popularidad` caps at 1000 rows/request; the D3 paged join is the correction; buckets are evidence, not gate input.
- **Unrelated local/untracked state**: `boot_serrucho.ps1`, `n8n_workflow.json` (modified, pre-existing, unrelated); `scripts/apply_workflow_hardening.js`, `scripts/patch_container_runtime.js`, `openspec/` (untracked, not part of change). `scratch_live/_coloquial_set.json` untouched.
- **Deferred work**: RRF/`0c31b52` review (plan 006); full SIN audit, 3-large embeddings, weighted sampling, plan 010 steps 4-5 (own plans).

## 7. Traceability

Artifacts read (openspec paths): `proposal.md`, `specs/search-accuracy-benchmark/spec.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`. Engram artifacts not used (store is openspec; observation IDs N/A). Engram mirror of this report saved under topic `sdd/search-accuracy/archive-report` per persistence contract.

## 8. Verdict

**SDD cycle COMPLETE.** Change planned, implemented (20/20), verified (PASS, 7/7 requirements, 12/12 scenarios), archived with byte-identical mechanical copy. Gate verdict REJECTED with measured evidence; deferrals documented with owning plans.