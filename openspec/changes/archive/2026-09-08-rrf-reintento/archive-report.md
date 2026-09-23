# Archive Report — rrf-reintento

- **Change**: `rrf-reintento`
- **Store**: openspec (repo-local) — `C:\Proyect\whatsapp-agent\openspec`
- **Date**: 2026-09-08
- **Phase**: archive (sub-agent `sdd-archive`)
- **Archived to**: `openspec/changes/archive/2026-09-08-rrf-reintento/`
- **Rama**: `perucho`

## 1. Archive Readiness

Dispatcher native status (pre-launch): `verify: all_done`, `archive: ready`, `nextRecommended: archive`, `blockedReasons: []`.

- Task Completion Gate: **PASSED** — `tasks.md` shows 14/14 tasks `- [x]`, 0 unchecked implementation tasks. Tasks 4.3 and 7.1 were conditionals closed in **FALSE** (deliberate, per task text and apply-progress: Phase C fold-in not applied because no suspect was guilty; deploy not executed because gate REJECTED).
- Verify gate: `verify-report.md` verdict `pass` (`gentle-ai.verify-result/v1`), `valid: true`, `critical_findings: 0`, `blockers: 0`, requirements **8/8** (7 base hybrid + 1 delta R4), scenarios **20/20**. Evidence revision `sha256:a740ce12e05a1a37d0b46f719643242edb5baad6a325c1c29ebdb41de2b6bd09`.
- Action context: no `workspace-planning` mode; archive confined to repo-local `openspec/`.

## 2. Final State at Close

> Per the Final-State Authority hierarchy — tasks artifact, then orchestrator final-state facts, then verify-report/apply-progress (intermediate snapshots).

- **Verdicto**: gate A/B **REJECTED** — `--ab vec-new sinvec-new` → **gap 4,1 pts < 5** → NO deploy. `vec-new 244/320 (76,3%)` vs `sinvec-new 231/320 (72,2%)`; buckets vec-new 133/171 · 15/26 · 96/123; sinvec-new 124/171 · 14/26 · 93/123. The live vector contributes **+13 real cases** (244 vs 231) but does not cross the adoption bar. This is the **first genuine measurement** of the vector layer; the 07-09 gap-0 attribution was corrected (empty key + OpenAI egress geo-block, not `0c31b52` nullifying the vector).
- **Implementation shipped in the repo (not deployed)**: A3 hybrid adoption rule on `scratch_live/live_buscar.js` + `scripts/new_buscar.js` (byte-identical, hash `74fb22d5…`); `UMBRAL_LEXICO_FIABLE` recalibrated **0.52 → 0.55** (live datapoint simLex 0.5246); local `OPENAI_API_BASE` override (OpenRouter) confined to `.env` and never propagated to production; hermetic suite 18/18; live probes disco/tapa OK.
- **Phase C**: suspects `b439c4a` and `c33e0b0` both **innocent** — 4 hot A/B runs all 243/320, `after == before`. The 244→231 drop does not reproduce hot; attributed to external debt (nightly regeneration of popularity/vocabulary), not to change code.
- **Regression**: **2 pre-existing FN** (#11 `sinz`, #28 `lamina de zinc`), identical to baseline `b1e8823`, **delta 0** → not a regression of this change; documented follow-ups.
- **Commits** (rama perucho, conventional, no AI attribution): `6f9778e`, `1a7ce70`, `c3b7484`, `b4213ef` (Fase 1-3), `72ca9a0` (probes), `f7a6506` (docs search), `244bd51` (openspec). Ranking vivo NOT deployed (deploy conditional did not open).
- **Deferrals recorded** (RAG.md §7 + docs): real RRF requires family dedupe and gate ≥ 5; 2 lexical FN; external drop; weighted sampling; `check_workflow_sync` RED pre-existing (`n8n_workflow.json` drift unrelated to this change).

### Task Completion Gate

Full `tasks.md` review confirms 14/14 `- [x]`, 0 `- [ ]`. Tasks 4.3 ("IF confirmed … fold-in") and 7.1 ("Only if gate ≥ 5 … deploy") are conditionals that were evaluated and **deliberately closed in FALSE** with evidence (Phase C inconclusive → no fold-in; gate 4,1 < 5 → no deploy). These are legitimate conditional closures, backed by apply-progress and verify-report evidence, not stale checkboxes for incomplete work.

### Contradiction resolution

No unrankable contradictions. The verify-report and apply-progress are consistent with the tasks artifact and the orchestrator's final-state facts. The only ambiguity — historically whether "gap 0" meant the vector was dormant — was resolved by the measured re-scope: the change re-measured hot and recorded a real +13 gap, superseding the earlier contaminated 07-09 reference.

## 3. Spec Sync (Step 2)

Two delta specs in `openspec/changes/rrf-reintento/specs/`:

| Domain | Action | Details |
|--------|--------|---------|
| hybrid-vector-adoption | **Created** (new full spec) | `openspec/specs/hybrid-vector-adoption/spec.md` copied mechanically (no prior main spec) — 7 requirements (R-A3, R-SYNC, R-PROBES, R-FASEC, R-GATE, R-REGRESION, R-NO-TOUCH), 16 scenarios |
| search-accuracy-benchmark | **Modified** | Existing main spec: R4 "Cached A/B baseline and gate" replaced with the delta's MODIFIED R4 (measured rule now rrf-reintento R-A3, added scenario "Subject is the deployed hybrid rule"). R1–R3, R5–R7 preserved unchanged. |

**Merge detail (search-accuracy-benchmark R4)**: The delta spec only carries a `MODIFIED Requirements` block for R4; there is no existing main spec for `hybrid-vector-adoption`. The search-accuracy-benchmark main spec R4 was replaced in-place via the editor (this is a genuine merge edit, not an artifact-content copy — the mechanical-copy restriction governs full-file copies, which apply to the new hybrid-vector-adoption spec). All other requirements in the main spec were preserved.

**Mechanical copy readback (hybrid-vector-adoption)**: copied via shell (`Copy-Item` to temp + `Move-Item`, verified SHA-256), MANDATORY `git diff --no-index` readback source-vs-destination → **exit 0, empty (no differences)**.

## 4. Archive Move (Step 3) — Mechanical Copy Contract

- Source: `openspec/changes/rrf-reintento`
- Destination: `openspec/changes/archive/2026-09-08-rrf-reintento`
- Mechanism: per the orchestrator's explicit instruction ("snapshot diff -r + mv plano, no git mv"), a plain `mv` with a pre-move recursive snapshot and mandatory byte-hash readback. The move was performed as one shell transaction; the `verify-report.md` was untracked/new and the remaining artifacts were already committed, so a plain `mv` (not `git mv`) is the correct mechanism here.
- Pre-move snapshot verified byte-equal to source (**SNAPSHOT_VERIFY: OK**).
- Post-move: source absent, destination present.
- MANDATORY readback `diff -r` (snapshot vs destination): **EMPTY — no differences (PASS)**, exit 0 — the only passing evidence.

Verbatim readback output:

```text
SNAPSHOT_VERIFY: OK
MOVED: True | SOURCE_GONE: True
READBACK (diff -r snapshot vs destination): EMPTY - no differences (PASS)
```

(The `archive-report.md` written in Step 5 is additive and excluded from the comparison — it did not exist in the source snapshot.)

## 5. Archive Verification (Step 4)

| Check | Result |
|-------|--------|
| Main specs updated correctly | ✅ `openspec/specs/search-accuracy-benchmark/spec.md` R4 merged (R1–R3, R5–R7 preserved); `openspec/specs/hybrid-vector-adoption/spec.md` created byte-identical |
| Change folder moved to archive | ✅ `openspec/changes/archive/2026-09-08-rrf-reintento/` |
| Archive contains all artifacts | ✅ proposal.md, specs/ (both domains), design.md, tasks.md, apply-progress.md, verify-report.md |
| Archived `tasks.md` no unchecked tasks | ✅ 14/14 `- [x]`, 0 `- [ ]` (4.3 and 7.1 closed in FALSE with evidence) |
| Active changes dir no longer has change | ✅ `openspec/changes/rrf-reintento` absent |
| `diff -r` readback empty | ✅ empty output, exit 0 (both spec copy and archive move) |

## 6. Risk Register (at close)

- **Verdicto REJECTED (gate 4,1 < 5)**: the A3 hybrid rule and the 0.55 recalibration remain **committed but NOT deployed**. Measuring real RRF (which requires family dedupe) is the path to crossing the bar; retry the gate only after resolving the deployment-vector question.
- **2 pre-existing FN** (#11, #28, delta 0): documented follow-ups, not change blockers.
- **External drop 244→231**: Phase C proved both suspects innocent; root cause remains external (nightly popularity/vocabulary regeneration). Open investigation debt.
- **OpenRouter override local-only**: `OPENAI_API_BASE` override is confined to `.env` and was never deployed; production is unaffected. Future hot measurement depends on a working egress/embedding provider from this machine.
- **`check_workflow_sync` RED**: pre-existing `n8n_workflow.json` drift unrelated to this change; guarded/out of scope.
- **Unrelated local/untracked state**: `boot_serrucho.ps1`, `n8n_workflow.json` (pre-existing modification), `scripts/apply_workflow_hardening.js`, `scripts/patch_container_runtime.js`, `scripts/_test_probes.js` (part of this change) remain.

## 7. Traceability

Artifacts read (openspec paths): `proposal.md`, `specs/hybrid-vector-adoption/spec.md`, `specs/search-accuracy-benchmark/spec.md`, `design.md`, `tasks.md`, `apply-progress.md`, `verify-report.md`. Store is openspec (repo-local); no Engram observation IDs apply. Engram mirror of this report persisted under topic `sdd/rrf-reintento/archive-report` per the persistence contract.

## 8. Verdict

**SDD cycle COMPLETE.** Change planned, implemented (14/14 tasks, 4.3/7.1 closed in FALSE with evidence), verified (PASS, 8/8 requirements, 20/20 scenarios, delta 0), and archived with a byte-identical mechanical copy (empty `diff -r` readback). The measured verdict REJECTED (gate 4,1 < 5 → no deploy) is the terminal spec-defined outcome; the live vector contribution (+13 real cases) is demonstrated, and all deferrals are documented with owning plans.
