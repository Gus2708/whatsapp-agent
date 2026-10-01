// Generate standalone n8n functions from the tested domain module.
const fs = require('fs');
const path = require('path');
const domain = require('../lib/conversation-context');
const { qualifyProductCandidates } = require('../lib/jev-product-qualifier');
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
const buscarFile = path.join(root, 'scratch_live/live_buscar.js');
const buscarSource = fs.readFileSync(buscarFile, 'utf8').replace(/\r\n/g, '\n');
const qualifierBlock = '// BEGIN PRODUCT QUALIFIER\n' + qualifyProductCandidates.toString() +
  '\n// END PRODUCT QUALIFIER';
if (!buscarSource.includes('// BEGIN PRODUCT QUALIFIER')) throw new Error('Missing product qualifier marker');
fs.writeFileSync(buscarFile, buscarSource.replace(/\/\/ BEGIN PRODUCT QUALIFIER[\s\S]*?\/\/ END PRODUCT QUALIFIER/, () => qualifierBlock));
fs.copyFileSync(path.join(root, 'scratch_live/live_buscar.js'), path.join(root, 'scripts/new_buscar.js'));
