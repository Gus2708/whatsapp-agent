# Specification: Resilient Guardrails and Self-Healing Recovery

## Capability: `resilient-guardrails-and-recovery`

### 1. Overview

Provides multi-tier fault tolerance, autonomous self-healing, resource bounding, and unattended message recovery across the WhatsApp AI agent stack.

---

### 2. Requirements

#### R1: Watchdog Execution Concurrency & Process Isolation
- The watchdog script (`waha_watchdog.ps1`) MUST NOT allow more than one active execution at any time.
- A lockfile (`waha_watchdog.lock`) MUST record the active process ID (`pid`) and ISO 8601 timestamp (`startedAt`).
- If an existing lockfile is detected:
  - If the recorded process is still running and started less than 5 minutes ago, the new execution MUST terminate immediately with exit code 0.
  - If the recorded process is running but exceeded 5 minutes, the stale process MUST be terminated (`Stop-Process -Force`) and the lock file refreshed.
  - If the recorded process is no longer running (zombie/dead PID), the lock file MUST be cleared and execution resumed.
- All Docker CLI calls MUST be wrapped in an isolated sub-process with an enforced timeout (10s for status/logs, 25s for start/restart). If a command times out, the process MUST be forcefully killed to prevent handle accumulation.

#### R2: Resilient State Persistence & Fault-Tolerant Parsing
- The state file (`waha_watchdog_state.json`) MUST be written atomically using a temporary file (`.tmp`) followed by a replace/rename operation.
- The state reader (`Get-State`) MUST safely handle:
  - Missing file
  - 0-byte or empty file
  - Truncated or invalid JSON syntax
- In all invalid or corrupt scenarios, `Get-State` MUST return a typed default object with:
  - `failedStreak = 0`
  - `n8nFailedStreak = 0`
  - `dockerFailedStreak = 0`
  - `lastSendFix = null`
  - `lastContainerRestart = null`
  - `lastN8nRestart = null`
  - `lastPeriodicCatchup = null`
  - `lastDockerHeal = null`
- Under no circumstances shall `$null` be returned, preventing PowerShell `$null -ne 0` falsy evaluation bugs.

#### R3: Autonomous Docker Engine Health & Revival
- The watchdog MUST verify Docker engine responsiveness using `docker info --format '{{.ServerVersion}}'` with a 10-second timeout.
- If `docker info` fails or times out:
  - Increment `dockerFailedStreak`.
  - If `dockerFailedStreak >= 3` and no revival occurred within the last 15 minutes:
    - Terminate all hanging `docker.exe` processes.
    - Revive Docker Desktop backend service (`com.docker.backend.exe` or `Docker Desktop.exe`).
    - Poll Docker engine readiness for up to 90 seconds.
    - Once ready, restart containers `waha_agent` and `n8n_agent`.

#### R4: Container Resource & Log Bounding
- Container stdout logs MUST be constrained via Docker logging options in `docker-compose.yml`:
  - `driver: "json-file"`
  - `options: { "max-size": "10m", "max-file": "3" }`
- Host log files (`waha_watchdog.log`, `boot_serrucho.log`, `catchup_serrucho.log`) MUST be checked before each write:
  - If size exceeds 5,242,880 bytes (5 MB), rotate current log to `.log.1` (overwriting any existing `.log.1`) and start a fresh `.log` file.

#### R5: Continuous Passive Catchup Sweeper
- In addition to post-crash recovery triggers, the watchdog MUST perform a periodic passive catchup audit every 20 minutes (`lastPeriodicCatchup`).
- When triggered, `scripts/catchup_engine.js` scans recent messages (within 48 hours) to verify whether any inbound customer query remained unaddressed due to dropped webhooks.
- Catchup MUST honor:
  - Human handoff status (`estado = 'manual'`) -> skip.
  - Cooldown period (15 minutes per customer) -> skip.
  - Inter-message pacing (8 seconds) to prevent WhatsApp anti-spam triggers.
  - Cross-alias resolution (`@c.us` and `@lid` mapped bidirectionally).

#### R6: Unified System Health Auditor (`tools/system_health.ps1`)
- A single diagnostic command MUST inspect:
  1. Host RAM (available physical memory)
  2. WSL2 VM memory & swap utilization
  3. Docker daemon status (`docker info`)
  4. Container states (`waha_agent`, `n8n_agent`)
  5. n8n healthz endpoint (`http://127.0.0.1:5678/healthz`)
  6. WAHA session status (`http://127.0.0.1:3000/api/sessions`)
  7. Engram memory service (port 7437)
  8. Unattended customer message count via catchup dry-run
- Returns exit code 0 when all critical components are green, exit code 1 if any service requires attention.

---

### 3. Scenarios & Acceptance Criteria

#### Scenario 1: State File Truncation Recovery
- **Given** an empty (0 bytes) or corrupted `waha_watchdog_state.json`.
- **When** `waha_watchdog.ps1` or `Get-State` executes.
- **Then** it cleanly falls back to default values with `failedStreak = 0` and does NOT falsely trigger crash recovery or infinite catchup loops.

#### Scenario 2: Docker CLI Hanging Prevention
- **Given** Docker daemon is frozen or WSL named pipe is non-responsive.
- **When** the watchdog issues a Docker command (e.g. `docker logs` or `docker start`).
- **Then** the process is killed after 10-25 seconds, a timeout warning is logged, and no orphaned `docker.exe` processes remain.

#### Scenario 3: Dropped Webhook Steady-State Recovery
- **Given** WAHA dropped an inbound webhook during normal operation without a service crash.
- **When** the 20-minute periodic catchup threshold expires.
- **Then** the watchdog triggers `catchup_engine.js`, identifying and responding to the unanswered customer query.

#### Scenario 4: Log File Bounding
- **Given** `waha_watchdog.log` reaches 5.1 MB.
- **When** a new log entry is written.
- **Then** the file is rotated to `waha_watchdog.log.1` and a fresh `waha_watchdog.log` is initialized.
