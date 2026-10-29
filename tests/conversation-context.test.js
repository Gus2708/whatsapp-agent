'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveConversation, searchDecision, searchGuard } = require('../lib/conversation-context');

const now = 1000000;
const first = () => resolveConversation('cable thwn #12 azul por metro', null, 'shop:a', now);
test('a gauge correction replaces the gauge and preserves cable attributes', () => {
  const next = resolveConversation('y el #8', first().state, 'shop:a', now + 1);
  assert.equal(next.query, 'cable thwn #8 azul por metro');
  assert.equal(next.state.gauge, '8');
  assert.equal(next.state.presentation, 'metro');
  assert.equal(next.state.confirmed, false);
  const roll = resolveConversation('pero por rollo', next.state, 'shop:a', now + 2);
  assert.equal(roll.query, 'cable thwn #8 azul por rollo');
});
test('session mismatch, expiry, restart and malformed state clarify without guessing', () => {
  for (const state of [null, {}, { ...first().state, session: 'shop:b' },
    { ...first().state, expires_at: now }, { ...first().state, version: 99 }]) {
    const next = resolveConversation('y el #8', state, 'shop:a', now + 1);
    assert.equal(next.action, 'clarify');
    assert.equal(next.state, null);
  }
});
test('topic changes, rejection, quotes and multi-product requests clear context', () => {
  for (const message of ['cemento gris', 'no es eso', 'presupuesto cable #8',
    'cable #8 y cemento', 'cable #8 y #12', '2 rollos de cable #8', 'hola']) {
    assert.equal(resolveConversation(message, first().state, 'shop:a', now + 1).state, null, message);
  }
  assert.equal(resolveConversation('el azul', first().state, 'shop:a', now + 1).action, 'clarify');
  assert.equal(resolveConversation('8', first().state, 'shop:a', now + 1).action, 'clarify', 'a bare number might be quantity');
  assert.equal(resolveConversation('el cemento', first().state, 'shop:a', now + 1).action, 'pass', 'an explicit new product is not a vague pronoun');
});
test('structured search decisions never label approximate results as confirmed', () => {
  for (const status of ['semantic', 'measure_mismatch', 'multiple_measures', 'approximate', 'relaxed', 'single_word']) {
    assert.deepEqual(searchDecision(status), {
      decision_version: 1, action: 'confirm', match_status: status, requires_confirmation: true,
    });
  }
  assert.equal(searchDecision('exact').action, 'show_results');
  assert.equal(searchDecision('weak').action, 'handoff');
});
const step = (status, tool = 'buscar_productos') => ({ action: { tool }, observation: JSON.stringify({
  ...searchDecision(status), productos: [{ nombre: 'Cable Azul', precio_divisas_texto: '10$' }],
}) });
test('guard forces confirmation without price, and preserves human escalation', () => {
  const output = searchGuard([step('approximate')]);
  assert.match(output, /Cable Azul/);
  assert.doesNotMatch(output, /10\$/);
  assert.equal(searchGuard([step('missing')]), '[PEDIR_AYUDA]');
  assert.equal(searchGuard([step('exact')]), null);
  assert.equal(searchGuard([step('missing', 'guardar_memoria_engram')]), null);
});
test('guard uses the last result per query but retains unresolved other searches', () => {
  const steps = [step('missing'), step('exact')];
  for (const s of steps) s.action.toolInput = { p_busqueda: 'cable' };
  assert.equal(searchGuard(steps), null);
  steps[1].action.toolInput.p_busqueda = 'cemento';
  assert.equal(searchGuard(steps), '[PEDIR_AYUDA]');
});
const searchStep = (query, status, encontrados = 1) => ({
  action: { tool: 'buscar_productos', toolInput: { p_busqueda: query } },
  observation: JSON.stringify({ ...searchDecision(status), encontrados,
    productos: encontrados ? [{ nombre: 'Cajetin 2x4 Plast Creole', precio_divisas_texto: '1$' }] : [] }),
});
test('guard does not hand off when a retry of the same product in the turn found it', () => {
  assert.equal(searchGuard([searchStep('tienen cajetines 2x4', 'missing', 0), searchStep('cajetin 2x4', 'exact')]), null);
  assert.equal(searchGuard([searchStep('cajetin 2x4', 'exact'), searchStep('cajetines 2x4', 'missing', 0)]), null,
    'order inside the turn does not matter');
  assert.equal(searchGuard([searchStep('cajetines', 'weak'), searchStep('cajetin plastico', 'exact')]), null);
  assert.match(searchGuard([searchStep('cajetines', 'missing', 0), searchStep('cajetin', 'approximate')]),
    /Cajetin 2x4/, 'an approximate retry still asks for confirmation instead of escalating');
});
test('guard keeps the handoff when nothing in the turn found that product', () => {
  assert.equal(searchGuard([searchStep('cajetines 2x4', 'missing', 0), searchStep('cajetin 2x4', 'missing', 0)]), '[PEDIR_AYUDA]');
  assert.equal(searchGuard([searchStep('cajetines', 'missing', 0), searchStep('cajetin', 'vague', 0)]), '[PEDIR_AYUDA]');
  assert.equal(searchGuard([searchStep('cajetines', 'missing', 0), searchStep('cajetin', 'not_sold', 0)]), '[PEDIR_AYUDA]');
  assert.equal(searchGuard([searchStep('tienen cemento', 'missing', 0), searchStep('tienen cable', 'exact')]), '[PEDIR_AYUDA]',
    'generic words such as "tienen" never make two products look like a retry');
  assert.equal(searchGuard([searchStep('cajetines', 'exact', 0), searchStep('cajetin', 'missing', 0)]), '[PEDIR_AYUDA]',
    'a non-handoff decision with zero products is not a find');
});
test('malformed, oversized and unknown search contracts fail closed', () => {
  assert.equal(searchGuard(undefined), null, 'tool-free turns omit intermediate steps in n8n runtime');
  assert.equal(searchGuard(null), null, 'null steps are treated as tool-free turns');
  assert.match(searchGuard('invalid-steps'), /producto/, 'non-array non-empty step shapes fail closed');
  assert.match(searchGuard([{ tool: 'buscar_productos', observation: '{}' }]), /producto/, 'unknown runtime step shapes fail closed');
  for (const observation of ['oops', 'x'.repeat(20001), JSON.stringify({ decision_version: 99 }),
    JSON.stringify({ ...searchDecision('exact'), action: 'invented' })]) {
    assert.match(searchGuard([{ action: { tool: 'buscar_productos' }, observation }]), /producto/);
  }
});
