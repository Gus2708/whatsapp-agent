# Tasks: Resilient Guardrails and Self-Healing Recovery

## Phase 1: Test Harness & Diagnostic Tooling

- [x] 1.1 Create automated unit test suite `tests/watchdog_guardrails.test.js` validating:
  - State file parser handling corrupt/empty files and defaulting safely
  - Lockfile concurrency rules (active PID, dead PID, stale PID)
  - Log rotation mechanism (>5 MB rotation to `.log.1`)
- [x] 1.2 Implement unified health check script `tools/system_health.ps1`:
  - Inspect Host memory, WSL2 swap, Docker daemon, container states, endpoints (`/healthz`, `/api/sessions`), Engram port 7437, and pending message count
  - Return exit code 0 on healthy, 1 on degraded/failed

## Phase 2: Docker Container Resource & Log Bounding

- [x] 2.1 Update `docker-compose.yml` to specify explicit logging driver limits:
  - Add `logging: driver: "json-file", options: { max-size: "10m", max-file: "3" }` to `waha` and `n8n` services
- [x] 2.2 Verify container memory limits (`waha`: 1200m, `n8n`: 2048m) and `NODE_OPTIONS`

## Phase 3: Watchdog Engine Healing & Self-Recovery

- [x] 3.1 Enhance `waha_watchdog.ps1` with Docker daemon probing:
  - Run `docker info` with 10s timeout via `Invoke-DockerCommand`
  - Track `dockerFailedStreak`; if >= 3 and no heal in last 15m, restart Docker Desktop backend and revive containers
- [x] 3.2 Add automatic log rotation to `waha_watchdog.ps1` before appending log entries (cap at 5 MB)
- [x] 3.3 Add automatic log rotation to `scripts/catchup_engine.js` before appending log entries (cap at 5 MB)

## Phase 4: Continuous Passive Catchup Sweeper

- [x] 4.1 Update `waha_watchdog.ps1` steady-state path:
  - Check `lastPeriodicCatchup` timestamp in state
  - If elapsed time >= 20 minutes, trigger `Trigger-Catchup "Passive periodic sweep"`
  - Update `lastPeriodicCatchup` timestamp and save state atomically
- [x] 4.2 Verify `catchup_engine.js` execution with `--dry-run` to ensure steady-state zero drops

## Phase 5: Verification & End-to-End Validation

- [x] 5.1 Run test suite: `node --test tests/watchdog_guardrails.test.js` and `node --test tests/recovery_flow.test.js`
- [x] 5.2 Execute `tools/system_health.ps1` and verify full green status across all subsystems
- [x] 5.3 Test live watchdog run: execute `waha_watchdog.ps1` and check `waha_watchdog.log` for clean execution
- [x] 5.4 Register Plan 011 in `plans/README.md` and create `plans/011-resilient-guardrails-and-recovery.md`
