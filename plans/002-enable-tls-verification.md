# Plan 002: Re-enable TLS certificate verification for the n8n container

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat a5262a1..HEAD -- docker-compose.yml`
> If `docker-compose.yml` changed since this plan was written, compare the
> "Current state" excerpt against the live file before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW (file edit) / MED (applying it recreates the prod container — operator step, see below)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a5262a1`, 2026-06-12

## Why this matters

The n8n container runs with `NODE_TLS_REJECT_UNAUTHORIZED=0`, which disables TLS
certificate validation for **every** outbound HTTPS request the workflow makes —
including the calls to Supabase (`https://rgniqjfooifchyctnbzu.supabase.co`,
carrying the database key and all catalog/price data) and OpenRouter (carrying
the model API key). With verification off, anyone able to intercept the box's
network traffic can man-in-the-middle those connections and read or tamper with
the data and credentials. Nothing in this stack legitimately needs the flag:
Supabase and OpenRouter present valid public certificates; WAHA and Engram are
reached over plain HTTP on the internal Docker network / host, not HTTPS. So the
flag is pure downside. Removing it restores normal certificate checking.

## Current state

- `docker-compose.yml` — Compose file for the `waha` and `n8n` services. The
  `n8n` service's `environment:` block contains (line 62):
  ```yaml
        - NODE_ENV=production
        - N8N_HOST=localhost
        - N8N_PORT=5678
        - N8N_PROTOCOL=http
        - WEBHOOK_URL=http://localhost:5678/
        - NODE_TLS_REJECT_UNAUTHORIZED=0
        - N8N_LOG_LEVEL=debug
  ```
- The HTTPS callers that this flag currently weakens:
  - Supabase REST, used by every `toolCode`/`code` node, e.g.
    `n8n_workflow.json` `buscar_productos` node and `scratch_live/live_buscar.js:106,154,157`.
  - OpenRouter chat model node (`n8n_workflow.json` `openrouter_model_node`).
- The internal services that are **not** HTTPS (so they are unaffected by
  removing the flag): WAHA at `http://waha_serrucho:3000` and
  `http://host.docker.internal:5678`; Engram at `http://host.docker.internal:7437`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Drift check | `git diff --stat a5262a1..HEAD -- docker-compose.yml` | empty |
| Assert flag removed | `node -e "process.exit(require('fs').readFileSync('docker-compose.yml','utf8').includes('NODE_TLS_REJECT_UNAUTHORIZED')?1:0)"` | exit 0 |
| YAML still parses (no external deps; use node's built-in check via a here-doc) | see Step 2 | prints `ok` |
| Scope check | `git status --porcelain` | only `docker-compose.yml` (and `plans/README.md`) modified |

## Scope

**In scope** (the only files you should modify):
- `docker-compose.yml`
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch):
- `N8N_LOG_LEVEL=debug` on the next line — that is a separate finding (S6); leave it.
- `NODE_FUNCTION_ALLOW_EXTERNAL=*`, `NODE_FUNCTION_ALLOW_BUILTIN=*`, and the
  `/var/run/docker.sock` mount — separate finding (S3); leave them.
- Actually running `docker compose up` against production — that is an operator
  action documented in the Test plan, not an executor edit.

## Git workflow

- Branch: `advisor/002-enable-tls-verification`
- Commit message style: Conventional Commits, e.g.
  `security: re-enable TLS verification for n8n (drop NODE_TLS_REJECT_UNAUTHORIZED=0)`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the line that disables TLS verification

Delete the single line `      - NODE_TLS_REJECT_UNAUTHORIZED=0` from the `n8n`
service `environment:` list in `docker-compose.yml`. Do not change indentation
of the surrounding lines.

**Verify**: `node -e "process.exit(require('fs').readFileSync('docker-compose.yml','utf8').includes('NODE_TLS_REJECT_UNAUTHORIZED')?1:0)"` → exit 0

### Step 2: Confirm the YAML is still well-formed

This repo has no YAML linter installed. Validate structurally with Node's JSON
round-trip after a minimal hand-parse is not reliable; instead confirm the file
still has the two services and the n8n environment block intact:

**Verify**: `node -e "const s=require('fs').readFileSync('docker-compose.yml','utf8'); const ok = s.includes('services:') && /\n\s+n8n:/.test(s) && /\n\s+waha:/.test(s) && s.includes('N8N_PORT=5678'); console.log(ok?'ok':'BROKEN'); process.exit(ok?0:1)"` → prints `ok`

## Test plan

There is no automated test layer for infra config in this repo. Verification is:

1. Static: the gates in Steps 1–2 (flag gone, file structurally intact).
2. Runtime (operator action, performed on the box where Docker runs — **not**
   part of the executor's worktree edit):
   - Recreate the n8n container so the new env applies:
     `docker compose up -d n8n` (from the repo root).
   - Confirm the workflow can still reach Supabase over verified TLS from inside
     the container:
     `docker exec n8n_serrucho node -e "require('https').get('https://rgniqjfooifchyctnbzu.supabase.co/rest/v1/',{headers:{}},r=>{console.log('status',r.statusCode);process.exit(0)}).on('error',e=>{console.error('TLS/NET ERROR',e.message);process.exit(1)})"`
     Expected: prints a `status` line (e.g. 401/404 — any HTTP status means TLS
     handshake succeeded). A `TLS/NET ERROR` with a certificate message means a
     real cert problem — see STOP conditions.
   - Send one real WhatsApp test message to the bot and confirm it still replies
     with a price (end-to-end smoke).

## Done criteria

Machine-checkable (executor worktree):

- [ ] `node -e "process.exit(require('fs').readFileSync('docker-compose.yml','utf8').includes('NODE_TLS_REJECT_UNAUTHORIZED')?1:0)"` exits 0
- [ ] Step 2 structural check prints `ok`
- [ ] `git status --porcelain` shows only `docker-compose.yml` and `plans/README.md` changed
- [ ] `plans/README.md` status row for 002 updated

Operator-confirmed (recorded in the PR/commit, not blocking the executor):

- [ ] After `docker compose up -d n8n`, the Supabase HTTPS check prints a status line
- [ ] One end-to-end WhatsApp message still returns a price

## STOP conditions

Stop and report back (do not improvise) if:

- The "Current state" excerpt doesn't match the live file (drift).
- The runtime Supabase check fails specifically with a certificate error
  (`unable to verify`, `self-signed certificate`, `UNABLE_TO_GET_ISSUER_CERT…`).
  That means some endpoint genuinely relies on skipping verification — revert the
  change, keep the flag, and report which endpoint/cert is at fault so it can be
  fixed properly (pin the CA, not disable all verification).
- Removing the line appears to require touching any other file.

## Maintenance notes

- If a future integration needs to talk to a host with a private/self-signed
  certificate, do **not** reintroduce `NODE_TLS_REJECT_UNAUTHORIZED=0` (it is
  global and turns off verification everywhere). Instead add that CA to the
  container's trust store or set `NODE_EXTRA_CA_CERTS` for the specific cert.
- Reviewer should confirm only the one env line was removed and the adjacent
  `N8N_LOG_LEVEL=debug` / `NODE_FUNCTION_ALLOW_*` lines were left untouched (they
  are tracked as separate findings S6 and S3).
