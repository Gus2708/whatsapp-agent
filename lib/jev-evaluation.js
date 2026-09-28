'use strict';
const { jevQuestions, productAttributes } = require('./jev-shadow');
const { resolveConversation } = require('./conversation-context');

function validateCorpus(corpus) {
  const questions = jevQuestions();
  if (!Array.isArray(corpus) || !corpus.length || corpus.length > 30) throw Error('Invalid corpus size');
  const ids = new Set();
  for (const row of corpus) {
    if (!/^[a-z0-9-]{1,40}$/.test(row.id) || ids.has(row.id) || typeof row.message !== 'string' ||
      !row.message || row.message.length > 500 || ['intent', 'continuation'].some(name =>
        !Object.hasOwn(questions[name].criteria, row.expected?.[name]))) throw Error('Invalid corpus row');
    ids.add(row.id);
  }
}

async function evaluateCorpus(corpus, classify) {
  validateCorpus(corpus);
  const rows = [];
  for (const row of corpus) {
    const previous = row.previous ? { variant: '', gauge: '', color: '', presentation: '',
      ...productAttributes(row.previous), version: 1, session: 'synthetic', confirmed: false, expires_at: 1000 } : null;
    const rule = resolveConversation(row.message, previous, 'synthetic', 1);
    // Only the narrow deterministic cable resolver is comparable; pass has no intent semantics.
    const ruleRelation = rule.action === 'clarify' ? 'unclear' : rule.action === 'search'
      ? rule.query !== row.message ? 'continue' : 'new' : null;
    const jev = classify ? await classify(row) : null;
    rows.push({ id: row.id, expected: row.expected, rule_action: rule.action, rule_continuation: ruleRelation,
      rule_intent_agreement: null, rule_continuation_agreement: ruleRelation && jev?.continuation
        ? ruleRelation === jev.continuation : null, jev });
  }
  const valid = rows.filter(row => ['ok', 'low_confidence'].includes(row.jev?.status));
  const latencies = rows.map(row => row.jev?.elapsed_ms).filter(Number.isFinite).sort((a, b) => a - b);
  const accuracy = name => valid.length ? valid.filter(row => row.jev[name] === row.expected[name]).length / valid.length : null;
  return { mode: classify ? 'provider' : 'offline', corpus: 'jev-synthetic-v2', contract: 'jev-shadow-v1', total: rows.length,
    provider_calls: rows.filter(row => row.jev?.request_attempted === true).length, valid_responses: valid.length,
    accepted_responses: rows.filter(row => row.jev?.status === 'ok').length,
    intent_accuracy: accuracy('intent'), continuation_accuracy: accuracy('continuation'),
    accuracy_denominator: valid.length, rule_comparable_rows: rows.filter(row => row.rule_continuation !== null).length,
    latency_p95_ms: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
    input_tokens: valid.length ? valid.reduce((sum, row) => sum + row.jev.input_tokens, 0) : null,
    output_tokens: valid.length ? valid.reduce((sum, row) => sum + row.jev.output_tokens, 0) : null,
    estimated_cost_usd: valid.length && valid.every(row => row.jev.estimated_cost_usd !== null)
      ? valid.reduce((sum, row) => sum + row.jev.estimated_cost_usd, 0) : null, rows };
}

async function fetchTransport(request, fetchImpl = fetch) {
  const response = await fetchImpl(request.url, { method: 'POST', headers: request.headers,
    body: JSON.stringify(request.body), signal: request.signal, redirect: 'error' });
  if (response.status !== 200) {
    await response.body?.cancel();
    return { status: response.status, body: null };
  }
  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, body: null };
  let length = 0;
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16000) { await reader.cancel(); throw Error('Response exceeds bound'); }
    chunks.push(Buffer.from(value));
  }
  return { status: response.status, body: Buffer.concat(chunks).toString('utf8') };
}

module.exports = { validateCorpus, evaluateCorpus, fetchTransport };
