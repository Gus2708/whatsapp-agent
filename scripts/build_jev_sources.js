'use strict';
const fs = require('node:fs');
const path = require('node:path');
const domain = require('../lib/jev-shadow');
const target = path.join(__dirname, '../scratch_live/live_jev_shadow.js');
const source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
const block = '// BEGIN JEV FUNCTIONS\n' + Object.values(domain).map(fn => fn.toString()).join('\n\n') + '\n// END JEV FUNCTIONS';
if (!source.includes('// BEGIN JEV FUNCTIONS')) throw Error('Missing Jev generation marker');
fs.writeFileSync(target, source.replace(/\/\/ BEGIN JEV FUNCTIONS[\s\S]*?\/\/ END JEV FUNCTIONS/, () => block));
