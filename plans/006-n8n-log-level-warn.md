# Plan 006: Set N8N_LOG_LEVEL to `warn` in production

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat a3f5b0d..HEAD -- docker-compose.yml`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live file before proceeding; on a mismatch treat it as
> a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / dx
- **Planned at**: commit `a3f5b0d`, 2026-06-17

## Why this matters

`N8N_LOG_LEVEL=debug` causes n8n to write the full JSON payload of every
workflow execution — including the incoming WhatsApp message body and the
client's phone number — to container stdout. Anyone who can run
`docker logs n8n_serrucho` on the local network or reads the Docker logging
driver output has access to every conversation the bot has had. Setting the
log level to `warn` keeps error and warning visibility while suppressing
routine execution data.

## Current state

- `docker-compose.yml` — Docker Compose file for WAHA + n8n. The n8n service
  block currently contains (line 57 and 62):

```yaml
      - NODE_ENV=production
      ...
      - N8N_LOG_LEVEL=debug
```

The `NODE_ENV=production` on line 57 makes the debug level especially
surprising — production mode with debug verbosity contradicts each other.

Repo convention: environment variables in the `environment:` block of
`docker-compose.yml` use the `- KEY=value` format. Match it.

## Commands you will need

| Purpose       | Command                                               | Expected on success                          |
|---------------|-------------------------------------------------------|----------------------------------------------|
| Verify change | `grep "N8N_LOG_LEVEL" docker-compose.yml`             | prints `- N8N_LOG_LEVEL=warn`                |
| Tests         | `node --test`                                         | 10/10 pass, exit 0                           |
| Sources sync  | `node scripts/check_sources_sync.js`                  | `sources in sync: OK`                        |

## Scope

**In scope** (the only file you should modify):
- `docker-compose.yml`

**Out of scope** (do NOT touch):
- Any `*.env` file, `docker-compose.override.yml`, other YAML files.
- The n8n workflow JSON, scratch_live, lib/ — unrelated to this change.

## Git workflow

- Branch: `advisor/006-log-level-warn` (create it fresh)
- Commit message style (match repo): `security: set N8N_LOG_LEVEL=warn in production`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create branch and make the one-line change

```
git checkout -b advisor/006-log-level-warn
```

Open `docker-compose.yml` and change line 62:

```yaml
      - N8N_LOG_LEVEL=debug
```

to:

```yaml
      - N8N_LOG_LEVEL=warn
```

No other line in the file changes.

**Verify**: `grep "N8N_LOG_LEVEL" docker-compose.yml` → `      - N8N_LOG_LEVEL=warn`

### Step 2: Run the test suite and source-sync guard

**Verify**: `node --test` → `pass 10`, exit 0

**Verify**: `node scripts/check_sources_sync.js` → `sources in sync: OK`

### Step 3: Commit

```
git add docker-compose.yml
git commit -m "security: set N8N_LOG_LEVEL=warn in production"
```

**Verify**: `git show --stat HEAD` shows only `docker-compose.yml` changed.

## Test plan

No new tests required — this is a config change. The existing `node --test`
suite (10 unit tests) verifies no unintended side-effects on the search logic.

## Done criteria

ALL must hold:

- [ ] `grep "N8N_LOG_LEVEL" docker-compose.yml` prints exactly `      - N8N_LOG_LEVEL=warn`
- [ ] `grep "N8N_LOG_LEVEL=debug" docker-compose.yml` returns no matches (exit 1)
- [ ] `node --test` exits 0, 10 tests pass
- [ ] `node scripts/check_sources_sync.js` exits 0
- [ ] `git diff --stat HEAD~1 HEAD` shows only `docker-compose.yml` (1 insertion, 1 deletion)

## STOP conditions

Stop and report back if:

- The file at `docker-compose.yml:62` doesn't match the excerpt above (drift
  since the plan was written).
- `N8N_LOG_LEVEL` already says `warn` (finding resolved independently).
- Any test fails after the change.

## Maintenance notes

- Applying this change requires `docker compose restart n8n` (or a full
  `docker compose up -d`) to take effect. The plan does NOT restart Docker —
  that is the operator's action after reviewing and merging the branch.
- If n8n logging needs to be temporarily raised for debugging, change this
  value back to `debug` for the debugging session and then revert.
- `N8N_LOG_LEVEL=error` would be even quieter but would suppress legitimate
  warnings about node connection failures; `warn` is the right default.
