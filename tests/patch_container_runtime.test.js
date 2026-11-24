'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'patch_container_runtime.js');

const TARGET_CHAT_MODELS =
  'async function invoke(promptValue, options) {\n\treturn (await this.generatePrompt([promptValue], options, options?.callbacks)).generations[0][0].message;\n}\n';
const TARGET_EXEC_BATCH =
  'try {} catch (e) {\n            const error = result.reason;\n            if (ctx.continueOnFail()) {\n                returnData.push({\n                    json: { error: error.message },\n                });\n            }\n        }\n';
const TARGET_AXIOS =
  "function AxiosError() {\n  Error.call(this);\n  this.name = 'AxiosError';\n}\nAxiosError.from = function(error) {\n  const axiosError = Object.create(AxiosError.prototype);\n  axiosError.name = error.name;\n  return axiosError;\n};\n";
const OLD_AXIOS_PATCH =
  "function AxiosError() {\n  Error.call(this);\n  try { this.name = 'AxiosError'; } catch (_) { try { Object.defineProperty(this, 'name', { value: 'AxiosError', configurable: true }); } catch (_) {} }\n}\nAxiosError.from = function(error) {\n  const axiosError = Object.create(AxiosError.prototype);\n  try { axiosError.name = error.name; } catch (_) {}\n  return axiosError;\n};\n";

function setupTempPnpm({ axiosBodies = [TARGET_AXIOS, TARGET_AXIOS], includeCore = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-runtime-'));
  const files = [];
  const write = (rel, body) => {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body, 'utf8');
    files.push(full);
    return full;
  };
  if (includeCore) {
    write('@langchain+core@1.2.8/node_modules/@langchain/core/dist/language_models/chat_models.js', TARGET_CHAT_MODELS);
    write('@n8n+n8n-nodes-langchain@1.0.0/node_modules/@n8n/n8n-nodes-langchain/dist/nodes/agents/Agent/agents/ToolsAgent/V3/helpers/executeBatch.js', TARGET_EXEC_BATCH);
  }
  axiosBodies.forEach((body, idx) => {
    write(`axios@1.20.0_v${idx}/node_modules/axios/dist/node/axios.cjs`, body);
  });
  return { dir, files };
}

function runPatch(pnpmRoot) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATCH_PNPM_ROOT: pnpmRoot },
  });
}

test('first run patches all targets cleanly, checks syntax, and exits 10', () => {
  const { dir, files } = setupTempPnpm();
  try {
    const res = runPatch(dir);
    assert.equal(res.status, 10, res.stderr || res.stdout);
    assert.match(res.stdout, /6\/6 archivo\(s\) parcheado\(s\)/);
    for (const file of files) {
      execFileSync(process.execPath, ['--check', file]);
    }
    const axiosFiles = files.filter(f => f.endsWith('axios.cjs'));
    assert.equal(axiosFiles.length, 2);
    for (const f of axiosFiles) {
      const content = fs.readFileSync(f, 'utf8');
      assert.match(content, /writable:\s*true,\s*configurable:\s*true/);
      assert.doesNotMatch(content, /try\s*\{\s*try\s*\{/);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('second run is strictly idempotent: exits 0, leaves files byte-identical, and never double-wraps axios', () => {
  const { dir, files } = setupTempPnpm();
  try {
    const first = runPatch(dir);
    assert.equal(first.status, 10);
    const snapshot = files.map(f => fs.readFileSync(f, 'utf8'));

    const second = runPatch(dir);
    assert.equal(second.status, 0, second.stderr || second.stdout);
    assert.match(second.stdout, /ya estaban parcheados\. Sin reinicio/);
    files.forEach((f, idx) => {
      const after = fs.readFileSync(f, 'utf8');
      assert.equal(after, snapshot[idx], `file mutated on idempotent run: ${f}`);
      assert.doesNotMatch(after, /try\s*\{\s*try\s*\{/);
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('upgrades legacy non-writable AxiosError patch and stays idempotent afterward', () => {
  const { dir, files } = setupTempPnpm({ includeCore: false, axiosBodies: [OLD_AXIOS_PATCH] });
  try {
    const first = runPatch(dir);
    assert.equal(first.status, 10);
    assert.match(first.stdout, /axios\.cjs \(upgrade writable\)/);
    const upgraded = fs.readFileSync(files[0], 'utf8');
    assert.match(upgraded, /writable:\s*true/);
    assert.doesNotMatch(upgraded, /try\s*\{\s*try\s*\{/);

    const second = runPatch(dir);
    assert.equal(second.status, 0);
    assert.equal(fs.readFileSync(files[0], 'utf8'), upgraded);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing or empty pnpm root fails loudly with exit code 1', () => {
  const missingDir = path.join(os.tmpdir(), 'patch-runtime-nonexistent-' + Date.now());
  const res = runPatch(missingDir);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /\[FALLO\]/);
});
