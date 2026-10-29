# Search plural fix and synchronous Sonnet guardrail

## Objective
Stop the bot from escalating to a human ("Dame un momentico...") when the product exists in the catalog,
e.g. "tienen cajetines 2x4" while CAJETIN 2X4 PLAST CREOLE is in stock.

## Problem (verified 2026-10-29)
1. `singular()` in `buscar_productos_tool` tests `/[aeiou]s$/` before `/[^aeiou]es$/`, so
   `cajetines -> cajetine`. `ilike *cajetine*` matches nothing; drop-one is skipped (single token);
   RPC/trigram receive the whole sentence and miss.
2. `searchGuard` (node "Sanitize Agent Output") forces `[PEDIR_AYUDA]` if ANY `buscar_productos`
   call in the turn returned `action:'handoff'`, even when a later retry found products.
3. The Sonnet "guardrail" (`workflow_automejora.json`) is fire-and-forget and runs after the handoff
   is decided, so it can never prevent an escalation. It also receives raw words as candidates.

## Scope
- Source chain: `lib` -> `scratch_live` -> n8n (`scripts/deploy_nodos.js`). Keep `scripts/new_buscar.js`
  and `n8n_workflow.json` / `workflows/production-baseline.json` consistent per `check_sources_sync.js`
  and `check_workflow_sync.js`.
- Deployment to live n8n requires explicit user approval.

## Tasks
- [x] T1 Fix plural stemming so `cajetines`, `papeles`, `tapones` reach the right stem without breaking
      `llaves`, `cables`, `tubos`; tests first (RED -> GREEN).
      Done: buscar-local `singularToken()` in `tokensDe` (shared `singular()` untouched, presupuesto unaffected).
      RED: 4/10 failing in `tests/plural_search.test.js` (cajetines 2x4, cajetines, papeles, niveles). GREEN: 10/10;
      full `node --test` 314/314 (incl. the 10 new); sources/workflow sync OK. Commit: 1d8fcfc.
- [x] T2 `searchGuard`: only hand off when no `buscar_productos` call in the turn found products; tests.
      Done: a handoff is superseded only by a find (show_results/confirm with products) for the SAME product
      (shared content word, 4-letter prefix, generic verbs ignored); different products still escalate, so the
      existing multi-product test keeps passing. Sanitize added to `deploy_nodos.js` MAPA, sourced from
      `n8n_workflow.json` (the live node equals HEAD's overlay build: --dry reported "ya está al día (7665)";
      `scratch_live/live_sanitize.js` is NOT the live code). RED 1 failing -> GREEN; full suite 316/316; sync OK. Commit: cae66fe.
- [x] T3 Synchronous Sonnet review inside the search tool before returning `missing`: bounded timeout,
      normalized/singular candidates, fail-open to the existing handoff on error.
      Done: `revisionGuardrail()` in `scratch_live/live_buscar.js` runs on `missing` and on `weak` (after the
      not-sold check). Candidates: up to 10 previous rows + per-token 70% prefix ilike + `buscar_fuzzy`, max 40.
      OpenRouter via axios (same key/style as `rescateSemantico`), model `SEARCH_GUARDRAIL_MODEL` or
      `anthropic/claude-sonnet-5`, temperature 0.1, JSON; whole step raced against `SEARCH_GUARDRAIL_TIMEOUT_MS`
      (default 9000). Accepts only candidate codes with confianza >= 4; returns `approximate` (confirm) with
      `_guardrail:true`; anything else falls back to the unchanged handoff. `SEARCH_GUARDRAIL_MODE=off` disables.
      Automejora webhook now gets `query_normalizada` = normalized tokens plus `query_tokens`.
      RED 8/9 failing in `tests/search_guardrail.test.js` -> GREEN 9/9; full suite 325/325; sync OK. Commit: 7d3d54a.
- [x] T4 Verify: `npm test` subset, `debug_buscar.js "cajetines 2x4"`, deploy `--dry`.
      Live node after deploy: "buen dia tienen cajetines 2x4 y precio" -> exact, 4 CAJETIN 4X2 rows;
      "papeles de lija" -> semantic confirm (Lija). OpenRouter `anthropic/claude-sonnet-5` answered 200.
      Guardrail not reached live: semantic layer always returns candidates (even "zxqw..." -> rows named ".").
- [x] T5 Deploy to n8n (user approved 2026-10-29): buscar_productos_tool 139625->145776, Sanitize 7665->9129, PUT 200; --dry afterwards: no changes.

## Route
- T1-T3: delegated direct (writer trigger: 2+ non-trivial files).

## Progress
- T4 evidence so far: `node --test` 325/325, `check_sources_sync` OK, `check_workflow_sync` OK,
  `deploy_nodos.js --dry`: buscar_productos_tool 139625 -> 145776, Sanitize Agent Output 7665 -> 9129,
  presupuesto and AI Agent up to date. `debug_buscar.js` only runs the LIVE node with fixed terms: skipped.
- Pre-existing deployed paint changes committed separately: c33785b.
- Follow-up: semantic layer adopted HybridLite rows named "."/".." (near-empty embeddings above 0.45).
  `buscarVectorial` now drops rows with <3 letters (a0b4dab), deployed 2026-10-29 (PUT 200). Live check:
  nonsense query no longer returns "." rows; "cajetines 2x4" still exact. Extractor-side filter lives in backend serrucho.
