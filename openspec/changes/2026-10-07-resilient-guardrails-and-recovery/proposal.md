# Proposal: Resilient Guardrails and Self-Healing Recovery System

## Intent

The WhatsApp sales agent ("Perucho" for Ferretería El Serrucho) relies on a distributed multi-component architecture:
1. WAHA (WhatsApp HTTP API in Docker) maintaining the live WhatsApp Web/NOWEB connection.
2. n8n (Workflow execution engine in Docker) running the sales agent LangChain logic, Supabase catalog retrieval, and conversation state machine.
3. Supabase (Remote PostgreSQL with pgvector) managing catalog data, customer sessions, and bot transcripts.
4. Host-level daemons: Windows Task Scheduler executing `waha_watchdog.ps1` every 3 minutes, `catchup_engine.js` recovering unattended messages, and Engram memory server on port 7437.

Recent operational incidents revealed severe cascading failure modes:
1. **WSL2 OOM & Memory Throttling**: Memory starvation under default container settings and unbounded `NODE_OPTIONS` caused silent lockups.
2. **Watchdog Concurrency Cascades & Dogpiling**: A crashed watchdog left a 0-byte state file (`waha_watchdog_state.json`), causing PowerShell to evaluate `$null -ne 0` as `$true`. Successive 3-minute runs piled up 30 PowerShell processes and 76 hung `docker.exe` processes without execution timeouts, exhausting named pipe handles and locking Docker Desktop.
3. **Passive Webhook Dropping**: WAHA drops webhook deliveries after retries if n8n restarts under load. Because the catchup engine only ran after detected service crashes, dropped messages during steady-state remained unanswered until manual intervention.
4. **Unbounded Log Bloat**: Watchdog logs (`waha_watchdog.log`), catchup logs, and Docker container JSON logs grow indefinitely without rotation or size capping, risking WSL2 disk exhaustion.
5. **Docker Daemon Unresponsiveness**: If Docker Desktop backend (`com.docker.backend.exe`) freezes or WSL2 networking disconnects, the watchdog had no self-healing mechanism to revive the Docker engine.

This change designs and implements a bulletproof, multi-tier guardrails and recovery architecture ensuring the sales agent never remains down, self-heals from runtime and host glitches, bounds system resources, and automatically recovers orphaned customer inquiries.

---

## Scope

### In Scope

1. **Docker Engine Self-Healing & Process Guard**:
   - Detect Docker daemon unresponsiveness via strict 10-second `docker info` probing.
   - Kill orphaned/hung `docker.exe` CLI processes before initiating operations.
   - Automatically revive Docker Desktop backend (`com.docker.backend.exe`) and wait up to 90s for engine readiness if the daemon is dead.
   - Configure container logging driver limits (`max-size: 10m`, `max-file: 3`) in `docker-compose.yml`.

2. **Watchdog Concurrency & Resilient State Management**:
   - Strict PID-based mutex lockfile (`waha_watchdog.lock`) with active process verification and stale lock reaping (>10 min).
   - Atomic state writes (`waha_watchdog_state.json.tmp` -> atomic rename) preventing file corruption.
   - Schema-safe state parser returning typed fallback defaults on empty or corrupt JSON.
   - Command timeouts (10s/20s) wrapping all external CLI operations.

3. **Autonomous Log Rotation Guard**:
   - Enforce 5 MB maximum file size cap on `waha_watchdog.log`, `boot_serrucho.log`, and `catchup_serrucho.log`.
   - Automatic rotation to `.log.1` (retaining max 2 archives) before log appending.

4. **Periodic Passive Catchup Sweeper**:
   - Trigger a passive, non-intrusive catchup sweep every 20-30 minutes during steady-state operation.
   - Guarantee that webhook drops occurring without service crashes are rescued automatically within 30 minutes.
   - Maintain cross-alias deduplication (`@c.us` and `@lid`) and 15-minute cooldown per customer chat.

5. **Unified System Health Diagnostic Tool**:
   - Provide `tools/system_health.ps1` single-command auditor verifying Host RAM, WSL2 Swap, Docker Engine, Container statuses, Endpoint responsiveness (`/healthz`, `/api/sessions`), Engram port, and pending customer chats.

6. **Automated Guardrail Test Suite**:
   - Create `tests/watchdog_guardrails.test.js` validating state corruption handling, lockfile concurrency, log rotation, and timeout recovery.

### Out of Scope

- Modifying WAHA NOWEB session persistence or internal WhatsApp protocol handshake.
- Changing catalog RAG search queries or Supabase schema definitions.
- Modifying the LangChain LLM prompts or OpenAI/OpenRouter credentials.

---

## Capabilities

### New Capabilities

- `resilient-guardrails-and-recovery`: Comprehensive self-healing, resource bounding, and watchdog protection system ensuring continuous 24/7 uptime for WhatsApp agent infrastructure.

### Modified Capabilities

- None.

---

## Approach

1. **Phase 1: Diagnostic & Verification Harness**:
   - Implement `tests/watchdog_guardrails.test.js` testing lockfile acquisition, state JSON validation, and log rotation.
   - Implement `tools/system_health.ps1` for immediate unified stack observability.

2. **Phase 2: Docker Engine & Container Resource Guardrails**:
   - Update `docker-compose.yml` to enforce log rotation policies (`json-file` with `max-size: 10m`, `max-file: 3`) for all containers.
   - Add engine health probing and Docker Desktop backend revival logic to `waha_watchdog.ps1`.

3. **Phase 3: Hardened Watchdog & Periodic Passive Catchup**:
   - Integrate automatic log rotation into `waha_watchdog.ps1` and `catchup_engine.js`.
   - Add periodic passive catchup trigger in `waha_watchdog.ps1` (every 20 minutes) to sweep dropped webhooks.
   - Ensure atomic state persistence and typed schema validation across all runs.

4. **Phase 4: Full-Stack Verification & Rollout**:
   - Execute unit and integration test suites.
   - Perform end-to-end simulation of container kill and daemon unresponsiveness.
   - Verify zero pending messages and clean log rotation.

---

## Affected Areas

| Area | Impact | Change |
|------|--------|--------|
| `docker-compose.yml` | Modified | Add container log driver limits (`max-size: 10m`, `max-file: 3`) |
| `waha_watchdog.ps1` | Modified | Add Docker engine healing, log rotation, and periodic passive catchup |
| `scripts/catchup_engine.js` | Modified | Add log rotation guard for `catchup_serrucho.log` |
| `tools/system_health.ps1` | New | Unified stack health and diagnostics auditor |
| `tests/watchdog_guardrails.test.js` | New | Automated test harness for guardrails and state resilience |
| `plans/011-resilient-guardrails-and-recovery.md` | New | Detailed implementation plan |
| `plans/README.md` | Modified | Register plan 011 |

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Catchup flooding customer chats | Low | Strict 15-minute cooldown, 8-second pacing between chats, and human handoff checks |
| Docker daemon restart during active customer inquiry | Low | Probing only triggers backend restart after 3 consecutive failures of `docker info` with 10s timeouts |
| Log rotation locking files during write | Low | Atomic rotation check before write with try/catch exception swallowing |

---

## Rollback Plan

All modified PowerShell and JavaScript scripts are tracked in Git. Revert changes via `git checkout` if any unexpected behavior is detected. Container compose settings can be reloaded via `docker compose up -d`.
