# Auto embeddings for new products

## Objective
New or renamed products in `productos` get a vector in `productos_embedding` within
about a minute, with no manual script and no logic inside the WhatsApp agent.

## Problem
Embeddings are produced only by `scripts/generar_embeddings.js`, run by hand. The n8n
"Monitor Embeddings" node only reports drift. New merchandise stays invisible to the
semantic search until someone remembers to run the script.

## Design (decided)
Queue + cron + Edge Function, instead of a raw Database Webhook per row:

- `sync.py` upserts in batches of 1000; a per-row webhook would fire on every stock or
  price UPDATE. The trigger only enqueues on INSERT or when `descripcion` changes.
- `pg_net` is fire-and-forget: a webhook that fails loses the event. A queue table keeps
  the work until it is done, with an attempt counter.
- A mass rename (resync) lands thousands of rows in the queue; the worker drains it in
  small batches, which also keeps writes under the HNSW `statement_timeout` limit.

Pieces:
1. `embedding_cola` table + trigger on `productos` (INSERT, UPDATE OF descripcion).
2. Edge Function `embed-productos`: takes up to N queued codes, ensures a Luna
   description (generates it when missing or stale), builds the SAME enriched text as
   `generar_embeddings.js` (same `norm`, same hash), embeds with
   `text-embedding-3-small` (OpenAI, fallback OpenRouter), upserts, dequeues.
3. `pg_cron` job every minute calling the function only when the queue is non-empty,
   authenticated with the `service_role_key` already stored in Vault.

## Constraints
- Hash parity with `scripts/generar_embeddings.js` (`textoDe` + md5) so the manual
  script does not see these rows as changed.
- Edge Function secrets `OPENAI_API_KEY` / `OPENROUTER_API_KEY` must be set in the
  Supabase dashboard (no Supabase CLI on this PC).
- Not touching the POS, `sync.py` or the n8n agent.

## Tasks
- [x] T1 Migration: queue table, trigger, backfill of products without vector (inline)
      Applied; backfill queued 1 product (MH10454).
- [x] T2 Edge Function `embed-productos` (inline) — deployed v2 (v1 was a mistaken
      placeholder deploy, replaced within a minute). Manual call: auth, queue, product,
      vocabulary reads OK; stops at embeddings with "no embeddings provider" (expected).
- [ ] T3 Cron job + end-to-end check with a real product (inline)
      BLOCKED: set OPENROUTER_API_KEY as Edge Function secret.
      2026-10-22: embeddings switched to OpenRouter only (single bill with Luna),
      model id `openai/text-embedding-3-small`; deployed v3, verified it answers
      "missing OPENROUTER_API_KEY secret".
      Cron SQL ready in supabase/migrations/20261022_embedding_cron.sql, not applied.
- [ ] T4 Docs: README/ARCHITECTURE note, monitor node message

## Acceptance
- Inserting a product (or changing its description) produces a row in
  `productos_embedding` with the same `hash_desc` the manual script would compute.
- Queue drains; failures stay queued with `intentos` and `ultimo_error`.

## Checks
- SQL readback of queue/trigger/cron.
- Manual invocation of the function and comparison of `hash_desc` against
  `node scripts/generar_embeddings.js --dry` (should report nothing to do).

## Progress
- Exploration done 2026-10-22: pg_cron, pg_net, vault present; 7935 products, 7934
  vectors (1 missing).
