const test = require('node:test');
const assert = require('node:assert/strict');
const { getStoreInfo, formatStoreInfoReply } = require('../lib/store-info');
const { fastRouter } = require('../lib/conversation-context');
const trustedJev = intent => ({ contract: 'jev-shadow-v1', status: 'ok', intent,
  intent_confidence: 0.97, intent_probability: 0.97, continuation: 'new',
  continuation_confidence: 0.97, continuation_probability: 0.97 });

test('Phase 1 - getStoreInfo returns authoritative store info', async (t) => {
  await t.test('returns hours info correctly', () => {
    const hours = getStoreInfo('horario');
    assert.ok(hours, 'Should return hours information');
    assert.match(hours, /8:00\s*AM/i, 'Should include opening time 8:00 AM');
    assert.match(hours, /6:00\s*PM/i, 'Should include closing time 6:00 PM');
    assert.match(hours, /1:00.*2:00\s*PM/i, 'Should include lunch break');
  });

  await t.test('returns location info correctly', () => {
    const location = getStoreInfo('ubicacion');
    assert.ok(location, 'Should return location information');
    assert.match(location, /Mene Mauroa/i, 'Should include Mene Mauroa');
    assert.match(location, /Falcón/i, 'Should include Estado Falcón');
  });

  await t.test('returns payment methods correctly', () => {
    const payments = getStoreInfo('pagos');
    assert.ok(payments, 'Should return payment methods information');
    assert.match(payments, /BCV/i, 'Should reference official BCV exchange rate');
    assert.match(payments, /Pago M[oó]vil/i, 'Should include Pago Móvil');
    assert.match(payments, /Zelle/i, 'Should include Zelle');
  });

  await t.test('formats complete store card for general store info query', () => {
    const card = formatStoreInfoReply('general');
    assert.ok(card, 'Should return formatted store card');
    assert.match(card, /El Serrucho/i, 'Should mention Ferretería El Serrucho');
    assert.match(card, /Horario/i, 'Should include horario');
    assert.match(card, /Ubicaci[oó]n/i, 'Should include ubicacion');
    assert.match(card, /Pagos/i, 'Should include pagos');
  });

  await t.test('handles unknown topic with general fallback', () => {
    const fallback = getStoreInfo('unknown_topic');
    assert.ok(fallback, 'Should return fallback store info');
    assert.match(fallback, /El Serrucho/i);
  });
});

test('Phase 2 - Guarded Fast Router intercepts high confidence non-product intents', async (t) => {
  await t.test('intercepts high-confidence store_info with authoritative reply', () => {
    const jev = trustedJev('store_info');
    const result = fastRouter({ message: '¿A qué hora abren hoy?', jev });
    assert.equal(result.fast_path, true);
    assert.equal(result.action, 'respond');
    assert.ok(result.reply);
    assert.match(result.reply, /8:00\s*AM/i);
  });

  await t.test('intercepts high-confidence general greeting with polite instant response', () => {
    const jev = trustedJev('general');
    const result = fastRouter({ message: 'Hola buenas tardes', jev });
    assert.equal(result.fast_path, true);
    assert.equal(result.action, 'respond');
    assert.ok(result.reply);
    assert.match(result.reply, /Perucho|El Serrucho/i);
  });

  await t.test('quote intent passes to Agent so the quote tool remains available', () => {
    const jev = {
      contract: 'jev-shadow-v1',
      status: 'ok',
      intent: 'quote',
      intent_confidence: 0.88
    };
    const result = fastRouter({ message: 'presupuesto de 20 metros de cable #12 y 4 bombillos led', jev });
    assert.equal(result.fast_path, false);
    assert.equal(result.action, 'pass');
    assert.equal(result.query, 'presupuesto de 20 metros de cable #12 y 4 bombillos led');
  });

  await t.test('intercepts human request intent and dispatches handoff', () => {
    const jev = trustedJev('human_request');
    const result = fastRouter({ message: 'quiero comunicarme con un asesor humano', jev });
    assert.equal(result.fast_path, true);
    assert.equal(result.action, 'handoff');
  });

  await t.test('fails closed to AI Agent when confidence is below 0.85', () => {
    const jev = {
      contract: 'jev-shadow-v1',
      status: 'low_confidence',
      intent: 'store_info',
      intent_confidence: 0.72
    };
    const result = fastRouter({ message: 'donde tienen tornillos', jev });
    assert.equal(result.fast_path, false);
    assert.equal(result.action, 'pass');
  });

  await t.test('fails closed to AI Agent on transport error or timeout', () => {
    const jev = {
      contract: 'jev-shadow-v1',
      status: 'timeout',
      intent: null,
      intent_confidence: null
    };
    const result = fastRouter({ message: 'tienen pintura de caucho', jev });
    assert.equal(result.fast_path, false);
    assert.equal(result.action, 'pass');
  });

  await t.test('passes product inquiries directly to AI Agent', () => {
    const jev = {
      contract: 'jev-shadow-v1',
      status: 'ok',
      intent: 'product_inquiry',
      intent_confidence: 0.97
    };
    const result = fastRouter({ message: 'precio del cuñete de pintura clase b blanca', jev });
    assert.equal(result.fast_path, false);
    assert.equal(result.action, 'pass');
  });

  await t.test('disabled or missing Jev never triggers a direct response', () => {
    const result = fastRouter({ message: '¿cuál es el horario de atención?', jev: null });
    assert.equal(result.fast_path, false);
    assert.equal(result.action, 'pass');
  });

  await t.test('requires both Jev confidence and deterministic standalone evidence', () => {
    const cases = [
      ['Hola, ¿tienen cemento?', 'general'],
      ['gracias por el presupuesto de cemento', 'general'],
      ['¿A qué hora abren y tienen cable #12?', 'store_info'],
      ['donde tienen tornillos', 'store_info'],
      ['quiero hablar con un asesor sobre la cotización de cemento', 'human_request'],
      ['necesito 20 metros de cable', 'store_info']
    ];
    for (const [message, intent] of cases) {
      const result = fastRouter({ message, jev: trustedJev(intent) });
      assert.equal(result.fast_path, false, message);
      assert.equal(result.action, 'pass', message);
    }
  });

  await t.test('does not override conversation clarification, handoff, or prior product context', () => {
    for (const context of [
      { action: 'clarify', query: 'y el #8' },
      { action: 'handoff', query: 'asesor' },
      { action: 'search', query: 'cable #12' },
      { action: 'pass', state: { gauge: '12' } },
      { action: 'pass', previous_product: { gauge: '12' } }
    ]) {
      const result = fastRouter({ message: 'Hola', jev: trustedJev('general'), context });
      assert.equal(result.fast_path, false, JSON.stringify(context));
    }
  });

  await t.test('can route a standalone greeting when independent conversation state is disabled', () => {
    const result = fastRouter({ message: 'Hola', jev: trustedJev('general'),
      context: { action: 'disabled', query: 'Hola', state: null } });
    assert.equal(result.fast_path, true);
    assert.equal(result.action, 'respond');
  });

  await t.test('retains the first-message name request only when customer memory permits it', () => {
    const allow = fastRouter({ message: 'Hola', jev: trustedJev('general'), options: { askName: true } });
    const deny = fastRouter({ message: 'Hola', jev: trustedJev('general'), options: { askName: false } });
    assert.match(allow.reply, /Con qui[eé]n tengo el gusto/i);
    assert.doesNotMatch(deny.reply, /Con qui[eé]n tengo el gusto/i);
  });

  await t.test('requires a fresh, corroborated Jev classification', () => {
    const variations = [
      { status: 'timeout' },
      { intent: 'quote' },
      { continuation: 'continue' },
      { continuation: 'unclear' },
      { intent_confidence: 0.89 },
      { intent_probability: 0.89 },
      { continuation_confidence: 0.89 }
    ];
    for (const variation of variations) {
      const result = fastRouter({ message: 'Hola', jev: { ...trustedJev('general'), ...variation } });
      assert.equal(result.fast_path, false, JSON.stringify(variation));
    }
  });

  await t.test('responds only with audited store topics; no payment or delivery card', () => {
    for (const message of ['¿A qué hora abren?', '¿Dónde están ubicados?']) {
      const result = fastRouter({ message, jev: trustedJev('store_info') });
      assert.equal(result.fast_path, true, message);
      assert.equal(result.action, 'respond', message);
      assert.doesNotMatch(result.reply, /Zelle|\$10|devoluci[oó]n/i);
    }
    for (const message of ['¿Aceptan Zelle?', '¿Hacen envíos?', 'información de la tienda']) {
      const result = fastRouter({ message, jev: trustedJev('store_info') });
      assert.equal(result.fast_path, false, message);
    }
  });
});

test('Phase 3 - Multi-turn conversational sequence and fast-path integration', async (t) => {
  const { resolveConversation } = require('../lib/conversation-context');
  const now = Date.now();
  const session = JSON.stringify(['test-session', '584121234567']);

  await t.test('executes greeting and product search while preserving follow-up context', () => {
    // Turn 1: Greeting (Fast Router intercepts)
    const turn1Jev = trustedJev('general');
    const turn1 = fastRouter({ message: 'Hola buenas tardes', jev: turn1Jev });
    assert.equal(turn1.fast_path, true);
    assert.equal(turn1.action, 'respond');
    assert.match(turn1.reply, /Perucho/i);

    // Turn 2: Initial Product Search (Passes to AI Agent / conversation resolver)
    const turn2Jev = { contract: 'jev-shadow-v1', status: 'ok', intent: 'product_inquiry', intent_confidence: 0.96 };
    const turn2Fast = fastRouter({ message: 'cable thwn #12 azul por metro', jev: turn2Jev });
    assert.equal(turn2Fast.fast_path, false);
    assert.equal(turn2Fast.action, 'pass');

    const turn2Context = resolveConversation('cable thwn #12 azul por metro', null, session, now);
    assert.equal(turn2Context.action, 'search');
    assert.ok(turn2Context.state);
    assert.equal(turn2Context.state.variant, 'thwn');
    assert.equal(turn2Context.state.gauge, '12');

    // Turn 3: Follow-up inquiry (cable context resolution)
    const turn3Context = resolveConversation('y el #8', turn2Context.state, session, now + 5000);
    assert.equal(turn3Context.action, 'search');
    assert.equal(turn3Context.query, 'cable thwn #8 azul por metro');
    assert.equal(turn3Context.state.gauge, '8');

    // Turn 4: An active product state keeps this request on the Agent branch.
    const turn4Jev = trustedJev('store_info');
    const turn4 = fastRouter({ message: '¿hasta qué hora trabajan hoy?', jev: turn4Jev, context: turn3Context.state });
    assert.equal(turn4.fast_path, false);
    assert.equal(turn4.action, 'pass');
  });

  await t.test('fastRouter executes sub-millisecond in-memory dispatch', () => {
    const start = process.hrtime.bigint();
    for (let i = 0; i < 1000; i++) {
      fastRouter({
        message: '¿dónde están ubicados?',
        jev: trustedJev('store_info')
      });
    }
    const durationNs = process.hrtime.bigint() - start;
    const avgMs = Number(durationNs) / (1000 * 1e6);
    assert.ok(avgMs < 0.1, `Average fastRouter dispatch (${avgMs.toFixed(4)}ms) should be < 0.1ms`);
  });
});

