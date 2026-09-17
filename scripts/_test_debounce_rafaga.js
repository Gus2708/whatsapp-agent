// _test_debounce_rafaga.js — ejecuta el codigo VIVO de "Debounce Ráfaga" con axios, reloj y
// setTimeout simulados (para no esperar 15s por caso).
//
// Lo que se verifica, en las dos direcciones:
//   - que la ejecucion SUPERADA se calle (esa era la causa de las respuestas duplicadas)
//   - que se calle aunque la superen DURANTE la espera, no solo antes: ese es el caso que
//     la version de siesta fija no veia y que producia la doble respuesta real
//   - que la ULTIMA sobreviva y se lleve los mensajes previos sin responder
//   - y sobre todo: que ante cualquier duda o error DEJE PASAR. Un debounce que se equivoca
//     hacia el silencio deja al cliente sin respuesta, que es peor que responder de mas.
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Debounce Ráfaga').parameters.jsCode;

const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);
const ts = (segs) => new Date(T0 + segs * 1000).toISOString();

// Reloj falso: setTimeout no espera, adelanta el reloj. Asi el bucle de sondeo progresa en
// tiempo simulado y podemos afirmar CUANTO habria esperado de verdad.
function hacerReloj(t0) {
  let t = t0;
  function FakeDate(...a) { return a.length ? new Date(...a) : new Date(t); }
  FakeDate.now = () => t;
  FakeDate.parse = Date.parse;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;
  return { FakeDate, avanzar: (ms) => { t += ms; }, transcurrido: () => t - t0 };
}

function correr({
  msgId = 'm3', chatId = '58412@c.us', filas, ultimoBot,
  errorSupabase = false, sinId = false, latenciaSupabaseMs = 0,
}) {
  const reloj = hacerReloj(T0 + 25000);
  let sondeos = 0;

  const axiosFake = {
    get: async (url) => {
      if (latenciaSupabaseMs) reloj.avanzar(latenciaSupabaseMs);
      if (errorSupabase) throw new Error('supabase caido');
      if (url.includes('mensajes_procesados')) {
        sondeos++;
        // `filas` puede ser una funcion del tiempo ya esperado: asi simulamos que un mensaje
        // nuevo del cliente aparece EN MEDIO de la espera.
        return { data: typeof filas === 'function' ? filas(reloj.transcurrido()) : filas };
      }
      if (url.includes('mensajes_bot')) return { data: ultimoBot ? [{ created_at: ultimoBot }] : [] };
      return { data: [] };
    },
  };

  const payload = sinId ? { from: chatId } : { from: chatId, id: msgId };
  const $input = { all: () => [{ json: { body: { payload } } }] };
  const fakeSetTimeout = (fn, ms) => { reloj.avanzar(ms); fn(); return 0; };
  const quiet = { log: () => {}, warn: () => {} };

  const fn = new Function('$input', 'require', 'setTimeout', 'console', 'Date',
    `return (async () => { ${code} })();`);
  return fn($input, (m) => { if (m === 'axios') return axiosFake; throw new Error(m); },
    fakeSetTimeout, quiet, reloj.FakeDate)
    .then(out => ({
      paso: out.length > 0,
      previa: out[0] ? out[0].json.body.payload._rafaga_previa : undefined,
      espero: reloj.transcurrido(),
      sondeos,
    }));
}

// Rafaga tipica: el cliente escribe tres veces seguidas tras la ultima respuesta del bot.
const RAFAGA = [
  { message_id: 'm3', procesado_at: ts(20), texto: 'gris' },
  { message_id: 'm2', procesado_at: ts(14), texto: 'necesito cemento' },
  { message_id: 'm1', procesado_at: ts(10), texto: 'hola buenas' },
];
// Yo soy m3 y estoy solo... hasta que a los 8 s aparece m4. Reproduce los huecos de 8,7 s y
// 13 s medidos en produccion: la siesta de 7 s despertaba ANTES de que ese mensaje existiera
// y respondia igual, asi que el cliente recibia dos respuestas.
const LLEGA_TARDE = (transcurrido) => (transcurrido >= 8000
  ? [{ message_id: 'm4', procesado_at: ts(28), texto: 'por favor' }, ...RAFAGA]
  : RAFAGA);

const CASOS = [
  { n: 'soy el ULTIMO -> responde y une los previos',
    a: { msgId: 'm3', filas: RAFAGA, ultimoBot: ts(5) },
    paso: true, previa: 'hola buenas\nnecesito cemento\n' },

  { n: 'me SUPERARON -> me callo',
    a: { msgId: 'm2', filas: RAFAGA, ultimoBot: ts(5) },
    paso: false },

  { n: 'el primero de la rafaga -> me callo',
    a: { msgId: 'm1', filas: RAFAGA, ultimoBot: ts(5) },
    paso: false },

  { n: 'mensaje suelto, sin rafaga -> responde limpio',
    a: { msgId: 'm3', filas: [RAFAGA[0]], ultimoBot: ts(5) },
    paso: true, previa: undefined },

  { n: 'los previos YA fueron respondidos -> no los repite',
    a: { msgId: 'm3', filas: RAFAGA, ultimoBot: ts(18) },
    paso: true, previa: undefined },

  // --- el caso que la siesta fija de 7s NO veia: me superan DURANTE la espera ---
  { n: 'me superan a los 8s (hueco real) -> me callo igual',
    a: { msgId: 'm3', filas: LLEGA_TARDE, ultimoBot: ts(5) },
    paso: false },

  // --- fail-safe: ante la duda, responder ---
  { n: 'no me veo en la lista -> responde igual',
    a: { msgId: 'desconocido', filas: RAFAGA, ultimoBot: ts(5) },
    paso: true, previa: undefined },
  { n: 'Supabase caido -> responde igual',
    a: { msgId: 'm3', filas: RAFAGA, ultimoBot: ts(5), errorSupabase: true },
    paso: true, previa: undefined },
  { n: 'payload sin id -> responde igual',
    a: { sinId: true, filas: RAFAGA, ultimoBot: ts(5) },
    paso: true, previa: undefined },
];

(async () => {
  let fallos = 0;
  const falla = (msg) => { fallos++; console.log('✗ ' + msg); };

  for (const c of CASOS) {
    const r = await correr(c.a);
    const errs = [];
    if (r.paso !== c.paso) errs.push(`paso=${r.paso} esperaba ${c.paso}`);
    if (c.paso && r.previa !== c.previa) errs.push(`previa=${JSON.stringify(r.previa)} esperaba ${JSON.stringify(c.previa)}`);
    if (errs.length) { fallos++; console.log(`✗ ${c.n}\n    ${errs.join('\n    ')}`); }
    else console.log(`✓ ${c.n}`.padEnd(54) + (r.paso ? `responde en ${r.espero}ms | previa=${JSON.stringify(r.previa)}` : `SILENCIO a los ${r.espero}ms`));
  }

  console.log('');

  // La ventana de silencio del mensaje unico: es la latencia que paga el ~85% que escribe
  // una sola vez, asi que se afirma explicitamente y no se descubre en produccion.
  const solo = await correr({ msgId: 'm3', filas: [RAFAGA[0]], ultimoBot: ts(5) });
  if (solo.espero < 14000 || solo.espero > 16000) falla(`mensaje unico espero ${solo.espero}ms, esperaba ~15000ms`);
  else console.log(`✓ mensaje unico: responde a los ${solo.espero}ms (ventana de silencio)`);

  // La perdedora tiene que liberar el worker RAPIDO, no ocupar la ventana entera. Esta es la
  // ganancia concreta del sondeo sobre subir la constante a secas.
  const perdedora = await correr({ msgId: 'm1', filas: RAFAGA, ultimoBot: ts(5) });
  if (perdedora.espero > 3000) falla(`la perdedora ocupo ${perdedora.espero}ms; deberia cortar en el primer ciclo (~2500ms)`);
  else console.log(`✓ perdedora: se calla a los ${perdedora.espero}ms (1 sondeo, no ocupa la ventana entera)`);

  // Y la que se entera tarde tambien: se calla al detectarlo, no al agotar la ventana.
  const tardia = await correr({ msgId: 'm3', filas: LLEGA_TARDE, ultimoBot: ts(5) });
  if (tardia.paso) falla('la superada a los 8s respondio igual');
  else if (tardia.espero >= 15000) falla(`la superada a los 8s espero ${tardia.espero}ms; deberia cortar al detectarlo (~10000ms)`);
  else console.log(`✓ superada a los 8s: se calla a los ${tardia.espero}ms, antes de agotar la ventana`);

  // Techo duro: si cada sondeo se arrastra, nadie espera indefinidamente.
  const lento = await correr({ msgId: 'm3', filas: [RAFAGA[0]], ultimoBot: ts(5), latenciaSupabaseMs: 9000 });
  if (!lento.paso) falla('con Supabase lento no respondio');
  else if (lento.espero > 60000) falla(`con Supabase lento espero ${lento.espero}ms; el techo deberia cortarlo`);
  else console.log(`✓ Supabase lento: responde a los ${lento.espero}ms (techo respetado)`);

  console.log('');
  console.log(fallos ? `${fallos} FALLO(S)` : `Todo OK (${CASOS.length} casos + 4 afirmaciones de tiempo)`);
  process.exit(fallos ? 1 : 0);
})();
