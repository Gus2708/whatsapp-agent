# Plan 011: Resilient Guardrails and Self-Healing Recovery System

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: reliability / self-healing / architecture
- **Planned at**: 2026-10-07

## Why this matters

The WhatsApp sales agent ("Perucho") is the primary revenue-facing entry point for Ferretería El Serrucho. Cascading failures (WSL2 OOM, watchdog process dogpiling, Docker Desktop engine lockups, unbounded log growth, and dropped webhooks during steady-state) have previously caused the agent to fall silent without alert or automatic recovery.

This plan establishes a hardened, self-healing architecture:
1. Docker daemon liveness probing with automatic engine revival.
2. Watchdog process isolation via PID-verified mutex and timeouts on all CLI commands.
3. Resilient state persistence preventing corruption and `$null` boolean evaluation bugs.
4. Container and host log rotation capping disk consumption.
5. Periodic passive catchup sweeper (every 20 min) ensuring zero dropped customer messages.
6. Unified health diagnostics tool (`tools/system_health.ps1`) for instant full-stack visibility.

## Current state

- `waha_watchdog.ps1`: Currently has lockfile and basic timeouts, but lacks Docker engine revival, log rotation, and steady-state passive catchup.
- `docker-compose.yml`: Contains memory limits, but lacks container logging driver limits (`json-file` max-size/max-file).
- `scripts/catchup_engine.js`: Functional and tested, but logs directly to `catchup_serrucho.log` without size bounding.
- `tools/`: Lacks a single-command unified stack diagnostic script.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run Guardrail Tests | `node --test tests/watchdog_guardrails.test.js` | All tests pass, exit 0 |
| Run Recovery Tests | `node --test tests/recovery_flow.test.js` | 24 tests pass, exit 0 |
| Run Catchup Dry-Run | `node scripts/catchup_engine.js --dry-run` | Exit 0, 0 pending messages |
| Unified Health Check | `powershell -File tools/system_health.ps1` | Full green, exit 0 |

## Scope

**In scope**:
- `docker-compose.yml` (add logging limits)
- `waha_watchdog.ps1` (engine revival, log rotation, passive catchup trigger)
- `scripts/catchup_engine.js` (log rotation)
- `tools/system_health.ps1` (new unified health checker)
- `tests/watchdog_guardrails.test.js` (new automated test harness)

**Out of scope**:
- WAHA session store SQLite migrations
- n8n workflow core prompt logic
- Supabase SQL schema migrations

## Steps

### Step 1: Create Test Harness `tests/watchdog_guardrails.test.js`
Verify:
1. Safe state parser defaults under null, empty string, or corrupt JSON.
2. Lockfile concurrency rules (active PID blocks, dead/stale PID cleared).
3. Log rotation when file exceeds 5 MB.

### Step 2: Implement Unified Health Check `tools/system_health.ps1`
Inspects:
- Host memory available
- WSL2 swap utilization
- Docker engine liveness (`docker info`)
- Container statuses (`waha_agent`, `n8n_agent`)
- HTTP endpoints: n8n `/healthz` and WAHA `/api/sessions`
- Engram port 7437
- Pending messages count

### Step 3: Configure Container Log Bounding in `docker-compose.yml`
Add to `waha` and `n8n` services:
```yaml
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### Step 4: Harden `waha_watchdog.ps1`
1. Add `Rotate-LogFile` (5 MB threshold -> `.log.1`).
2. Add Docker daemon health check (`docker info`). If failed 3x, kill hanging processes, revive `com.docker.backend.exe`, and wait for readiness.
3. Add steady-state periodic catchup: if elapsed time since `lastPeriodicCatchup` >= 20 minutes, trigger passive catchup.

### Step 5: Harden `scripts/catchup_engine.js`
Add file size check to `log(msg)`: rotate `catchup_serrucho.log` if > 5 MB.

### Step 6: Full Verification
Run test suites and `tools/system_health.ps1`.

## Done criteria

- [ ] `node --test tests/watchdog_guardrails.test.js` passes 100%.
- [ ] `node --test tests/recovery_flow.test.js` passes 100%.
- [ ] `tools/system_health.ps1` executes cleanly and returns green.
- [ ] `docker-compose.yml` contains logging bounds for both containers.
- [ ] `waha_watchdog.ps1` successfully executes with engine probing, log rotation, and periodic catchup.
