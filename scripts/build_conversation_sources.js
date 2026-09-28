// Generate standalone n8n functions from the tested domain module.
const fs = require('fs');
const path = require('path');
const domain = require('../lib/conversation-context');
const root = path.join(__dirname, '..');
for (const [file, names] of Object.entries({
  'live_conversation_context.js': ['resolveConversation'],
  'live_buscar.js': ['searchDecision'],
  'live_sanitize.js': ['searchDecision', 'searchGuard'],
})) {
  const target = path.join(root, 'scratch_live', file);
  const source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
  const block = '// BEGIN CONVERSATION FUNCTIONS\n' + names.map(name => domain[name].toString()).join('\n\n') +
    '\n// END CONVERSATION FUNCTIONS';
  if (!source.includes('// BEGIN CONVERSATION FUNCTIONS')) throw new Error('Missing generation marker: ' + file);
  fs.writeFileSync(target, source.replace(/\/\/ BEGIN CONVERSATION FUNCTIONS[\s\S]*?\/\/ END CONVERSATION FUNCTIONS/, () => block));
}
fs.copyFileSync(path.join(root, 'scratch_live/live_buscar.js'), path.join(root, 'scripts/new_buscar.js'));
