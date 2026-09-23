// Runtime hardening applied INSIDE the n8n container (piped through `docker exec node`).
//
// Two upstream crashes leave the agent with no output at all:
//   1) @langchain/core chat_models.js dereferences generations[0][0].message without a
//      guard: an empty generation throws instead of yielding an empty message.
//   2) @n8n/nodes-langchain executeBatch.js reads `result.reason.message` on a rejection
//      whose reason can be undefined, masking the real failure with a TypeError.
//
// Contract with boot script (exit codes):
//   0  -> nothing to do (already patched). n8n does NOT need a restart.
//   10 -> files were modified. Node already loaded the old modules, so the caller MUST
//         restart n8n for the patch to take effect.
//   1  -> no target file found at all (n8n layout changed / dependency bumped). Loud,
//         never silent: a hardcoded pnpm hash going stale used to make this a no-op.
const fs = require('fs');
const path = require('path');

const PNPM_ROOT = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';

// Resolve dependency paths by globbing the pnpm store instead of pinning hashed
// directory names: those hashes change on every dependency bump and turned this
// script into a silent no-op.
function findUnder(prefix, tail) {
  let entries;
  try {
    entries = fs.readdirSync(PNPM_ROOT);
  } catch (e) {
    return [];
  }
  return entries
    .filter((d) => d.startsWith(prefix))
    .map((d) => path.join(PNPM_ROOT, d, tail))
    .filter((f) => fs.existsSync(f));
}

let found = 0;
let changed = 0;

function patchFile(file, target, replacement, label) {
  found += 1;
  const content = fs.readFileSync(file, 'utf8');
  if (!content.includes(target)) {
    console.log(`[skip] ${label}: already patched or target absent -> ${file}`);
    return;
  }
  fs.writeFileSync(file, content.replace(target, replacement), 'utf8');
  changed += 1;
  console.log(`[patched] ${label} -> ${file}`);
}

// 1) @langchain/core — guard the empty-generation dereference.
const chatModelFiles = findUnder(
  '@langchain+core@',
  'node_modules/@langchain/core/dist/language_models/chat_models.js'
);
const targetInvoke =
  'return (await this.generatePrompt([promptValue], options, options?.callbacks)).generations[0][0].message;';
const safeInvoke = `const genResult = await this.generatePrompt([promptValue], options, options?.callbacks);
\t\tconst msg = genResult?.generations?.[0]?.[0]?.message;
\t\tif (msg) return msg;
\t\treturn new AIMessage('');`;
for (const f of chatModelFiles) patchFile(f, targetInvoke, safeInvoke, 'chat_models.js');

// 2) @n8n/nodes-langchain — tolerate a rejection with an undefined reason.
const execBatchFiles = findUnder(
  '@n8n+n8n-nodes-langchain@',
  'node_modules/@n8n/n8n-nodes-langchain/dist/nodes/agents/Agent/agents/ToolsAgent/V3/helpers/executeBatch.js'
);
const targetErr =
  "const error = result.reason;\n            if (ctx.continueOnFail()) {\n                returnData.push({\n                    json: { error: error.message },";
const safeErr =
  "const error = result.reason || new Error('Unknown error');\n            if (ctx.continueOnFail()) {\n                returnData.push({\n                    json: { error: error?.message || String(error) },";
for (const f of execBatchFiles) patchFile(f, targetErr, safeErr, 'executeBatch.js');

if (found === 0) {
  console.error(
    `[FALLO] no se encontro ningun archivo objetivo bajo ${PNPM_ROOT}. ` +
      'El layout de n8n o sus dependencias cambiaron: revisar los prefijos de este script.'
  );
  process.exitCode = 1;
} else if (changed > 0) {
  console.log(`[OK] ${changed}/${found} archivo(s) parcheado(s). n8n necesita reiniciarse.`);
  process.exitCode = 10;
} else {
  console.log(`[OK] ${found} archivo(s) ya estaban parcheados. Sin reinicio.`);
  process.exitCode = 0;
}
