const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Helper to simulate watchdog state reader logic
function parseWatchdogState(rawContent) {
  const defaultState = {
    failedStreak: 0,
    n8nFailedStreak: 0,
    dockerFailedStreak: 0,
    lastSendFix: null,
    lastContainerRestart: null,
    lastN8nRestart: null,
    lastPeriodicCatchup: null,
    lastDockerHeal: null
  };

  if (!rawContent || typeof rawContent !== 'string' || !rawContent.trim()) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(rawContent);
    if (!parsed || typeof parsed !== 'object') {
      return defaultState;
    }
    const result = { ...defaultState };
    for (const key of Object.keys(defaultState)) {
      if (parsed[key] !== undefined && parsed[key] !== null) {
        result[key] = parsed[key];
      }
    }
    return result;
  } catch (e) {
    return defaultState;
  }
}

// Helper to simulate log rotation logic
function checkAndRotateLog(filePath, maxBytes = 5 * 1024 * 1024) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  if (stats.size > maxBytes) {
    const backupPath = `${filePath}.1`;
    fs.renameSync(filePath, backupPath);
    return true;
  }
  return false;
}

// Helper to simulate lockfile decision logic
function evaluateLockfile(lockData, isPidRunningFn, nowMs = Date.now(), staleTimeoutMs = 5 * 60 * 1000) {
  if (!lockData || !lockData.pid) {
    return { shouldProceed: true, action: 'reap_corrupt' };
  }
  const pid = parseInt(lockData.pid, 10);
  const startedAt = lockData.startedAt ? new Date(lockData.startedAt).getTime() : 0;
  const ageMs = nowMs - startedAt;

  const isAlive = isPidRunningFn(pid);
  if (isAlive) {
    if (ageMs < staleTimeoutMs) {
      return { shouldProceed: false, action: 'skip_active_run' };
    } else {
      return { shouldProceed: true, action: 'kill_stale_pid', targetPid: pid };
    }
  } else {
    return { shouldProceed: true, action: 'reap_dead_pid' };
  }
}

test('Watchdog State Resilience: handles 0-byte or empty content without returning null', () => {
  const emptyState = parseWatchdogState('');
  assert.equal(emptyState.failedStreak, 0);
  assert.equal(emptyState.n8nFailedStreak, 0);
  assert.equal(emptyState.dockerFailedStreak, 0);
  assert.equal(emptyState.lastSendFix, null);
  assert.equal(typeof emptyState, 'object');
  assert.notEqual(emptyState, null);
});

test('Watchdog State Resilience: handles corrupted/truncated JSON gracefully', () => {
  const corruptState = parseWatchdogState('{"failedStreak": 3, "lastSendFix":');
  assert.equal(corruptState.failedStreak, 0);
  assert.equal(corruptState.n8nFailedStreak, 0);
  assert.equal(corruptState.dockerFailedStreak, 0);
});

test('Watchdog State Resilience: correctly preserves valid fields and types', () => {
  const validJson = JSON.stringify({
    failedStreak: 2,
    n8nFailedStreak: 1,
    dockerFailedStreak: 0,
    lastSendFix: '2026-10-07T14:00:00.000Z',
    extraGarbageField: 'ignore_me'
  });
  const state = parseWatchdogState(validJson);
  assert.equal(state.failedStreak, 2);
  assert.equal(state.n8nFailedStreak, 1);
  assert.equal(state.lastSendFix, '2026-10-07T14:00:00.000Z');
  assert.equal(state.extraGarbageField, undefined);
});

test('Lockfile Concurrency: aborts when existing process is alive and within timeout', () => {
  const now = Date.now();
  const lock = { pid: 1234, startedAt: new Date(now - 60 * 1000).toISOString() }; // 1 min ago
  const res = evaluateLockfile(lock, (pid) => pid === 1234, now);
  assert.equal(res.shouldProceed, false);
  assert.equal(res.action, 'skip_active_run');
});

test('Lockfile Concurrency: kills stale process when alive but exceeds timeout', () => {
  const now = Date.now();
  const lock = { pid: 1234, startedAt: new Date(now - 10 * 60 * 1000).toISOString() }; // 10 min ago
  const res = evaluateLockfile(lock, (pid) => pid === 1234, now);
  assert.equal(res.shouldProceed, true);
  assert.equal(res.action, 'kill_stale_pid');
  assert.equal(res.targetPid, 1234);
});

test('Lockfile Concurrency: reaps lock when process is dead', () => {
  const now = Date.now();
  const lock = { pid: 9999, startedAt: new Date(now - 30 * 1000).toISOString() };
  const res = evaluateLockfile(lock, () => false, now);
  assert.equal(res.shouldProceed, true);
  assert.equal(res.action, 'reap_dead_pid');
});

test('Log Rotation: rotates file exceeding 5MB to .1', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-rot-test-'));
  const testLog = path.join(tempDir, 'test.log');
  const backupLog = `${testLog}.1`;

  // Create file just below limit
  fs.writeFileSync(testLog, Buffer.alloc(1024));
  const rotatedSmall = checkAndRotateLog(testLog, 2048);
  assert.equal(rotatedSmall, false);
  assert.equal(fs.existsSync(testLog), true);
  assert.equal(fs.existsSync(backupLog), false);

  // Exceed limit
  fs.writeFileSync(testLog, Buffer.alloc(3000));
  const rotatedLarge = checkAndRotateLog(testLog, 2048);
  assert.equal(rotatedLarge, true);
  assert.equal(fs.existsSync(testLog), false);
  assert.equal(fs.existsSync(backupLog), true);

  // Clean up
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Helper simulating watchdog webhook health decision
function evaluateWebhookHealth(healthzStatus, webhookHttpStatus) {
  if (healthzStatus !== 'ok') {
    return { healthy: false, action: 'wait_or_restart_n8n' };
  }
  if (webhookHttpStatus === 404) {
    return { healthy: false, action: 'reactivate_workflow' };
  }
  if (webhookHttpStatus === 200) {
    return { healthy: true, action: 'none' };
  }
  return { healthy: false, action: 'investigate_http_error' };
}

// Helper simulating WAHA payload safety guard
function validateWahaOutboundPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Payload must be an object' };
  }
  if (!payload.chatId || typeof payload.chatId !== 'string' || !payload.chatId.trim()) {
    return { valid: false, error: 'chatId is required and cannot be empty' };
  }
  if (!payload.chatId.includes('@')) {
    return { valid: false, error: 'chatId must be a valid JID containing @' };
  }
  if (!payload.text || typeof payload.text !== 'string' || !payload.text.trim()) {
    return { valid: false, error: 'text is required and cannot be empty' };
  }
  return { valid: true };
}

test('Webhook Resilience: detects 404 unhooked webhook despite healthy healthz and triggers reactivation', () => {
  const result = evaluateWebhookHealth('ok', 404);
  assert.equal(result.healthy, false);
  assert.equal(result.action, 'reactivate_workflow');
});

test('Webhook Resilience: reports healthy when healthz is ok and webhook is 200', () => {
  const result = evaluateWebhookHealth('ok', 200);
  assert.equal(result.healthy, true);
  assert.equal(result.action, 'none');
});

test('WAHA Payload Safety: rejects missing or undefined chatId to prevent WAHA crash', () => {
  const missingChatId = validateWahaOutboundPayload({ text: 'Hola' });
  assert.equal(missingChatId.valid, false);
  assert.match(missingChatId.error, /chatId is required/);

  const undefinedChatId = validateWahaOutboundPayload({ chatId: undefined, text: 'Hola' });
  assert.equal(undefinedChatId.valid, false);

  const invalidJid = validateWahaOutboundPayload({ chatId: '584141234567', text: 'Hola' });
  assert.equal(invalidJid.valid, false);
  assert.match(invalidJid.error, /must be a valid JID/);
});

test('WAHA Payload Safety: accepts well-formed outbound payloads', () => {
  const valid = validateWahaOutboundPayload({ chatId: '584141234567@c.us', text: 'Hola' });
  assert.equal(valid.valid, true);
});
