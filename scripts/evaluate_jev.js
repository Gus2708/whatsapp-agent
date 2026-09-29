'use strict';
const { classifyShadow } = require('../lib/jev-shadow');
const { evaluateCorpus, fetchTransport } = require('../lib/jev-evaluation');
const baselineCorpus = require('../tests/fixtures/jev-synthetic.json');
const slotCorpus = require('../tests/fixtures/jev-slots-synthetic.json');

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--live', '--slots'].includes(arg)) || new Set(args).size !== args.length) {
    throw Error('Use --live and/or --slots');
  }
  const live = args.includes('--live');
  const corpus = args.includes('--slots') ? slotCorpus : baselineCorpus;
  const provider = process.env.JEV_PROVIDER || 'typesafe';
  if (!['typesafe', 'vercel'].includes(provider)) throw Error('Invalid provider');
  const keyName = provider === 'vercel' ? 'AI_GATEWAY_API_KEY' : 'TYPESAFE_API_KEY';
  if (live && !process.env[keyName]?.trim()) {
    console.error(`${keyName} is required for --live. No requests sent.`);
    process.exitCode = 1;
    return;
  }
  // Fixed synthetic corpus only. Never load .env, WhatsApp, customer memory or catalog data.
  const report = await evaluateCorpus(corpus, live ? row => classifyShadow({ message: row.message,
    previous: row.previous, env: { ...process.env, JEV_MODE: 'shadow' }, transport: fetchTransport }) : undefined,
  { minConfidence: process.env.JEV_MIN_CONFIDENCE || 0.7 });
  console.log(JSON.stringify(report, null, 2));
  if (live && report.valid_responses !== report.total) process.exitCode = 1;
}
main().catch(() => { console.error('Evaluation failed; no provider payload or credentials logged.'); process.exitCode = 1; });
