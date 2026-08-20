// _test_debounce_rafaga.js — ejecuta el codigo VIVO de "Debounce Ráfaga" con axios y
// setTimeout simulados (para no esperar 7s por caso).
//
// Lo que se verifica, en las dos direcciones:
//   - que la ejecucion SUPERADA se calle (esa era la causa de las respuestas duplicadas)
//   - que la ULTIMA sobreviva y se lleve los mensajes previos sin responder
//   - y sobre todo: que ante cualquier duda o error DEJE PASAR. Un debounce que se equivoca
//     hacia el silencio deja al cliente sin respuesta, que es peor que responder de mas.
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Debounce Ráfaga').parameters.jsCode;

const T0 = Date.UTC(2026, 7, 20, 12, 0, 0);
const ts = (segs) => new Date(T0 + segs * 1000).toISOString();

function correr({ msgId = 'm3', chatId = '58412@c.us', filas, ultimoBot, errorSupabase = false, sinId = false }) {
  let durmio = 0;
  const axiosFake = {
    get: async (url) => {
      if (errorSupabase) throw new Error('supabase caido');
      if (url.includes('mensajes_procesados')) return { data: filas };
      if (url.includes('mensajes_bot')) return { data: ultimoBot ? [{ created_at: ultimoBot }] : [] };
      return { data: [] };
    },
  };
  const payload = sinId ? { from: chatId } : { from: chatId, id: msgId };
  const $input = { all: () => [{ json: { body: { payload } } }] };
  const fakeSetTimeout = (fn, ms) => { durmio = ms; fn(); return 0; };
  const quiet = { log: () => {}, warn: () => {} };
  const fn = new Function('$input', 'require', 'setTimeout', 'console', `return (async () => { ${code} })();`);
  return fn($input, (m) => { if (m === 'axios') return axiosFake; throw new Error(m); }, fakeSetTimeout, quiet)
    .then(out => ({ paso: out.length > 0, previa: out[0] ? out[0].json.body.payload._rafaga_previa : undefined, durmio }));
}

// Rafaga tipica: el cliente escribe tres veces seguidas tras la ultima respuesta del bot.
const RAFAGA = [
  { message_id: 'm3', procesado_at: ts(20), texto: 'gris' },
  { message_id: 'm2', procesado_at: ts(14), texto: 'necesito cemento' },
  { message_id: 'm1', procesado_at: ts(10), texto: 'hola buenas' },
];

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
  for (const c of CASOS) {
    const r = await correr(c.a);
    const errs = [];
    if (r.paso !== c.paso) errs.push(`paso=${r.paso} esperaba ${c.paso}`);
    if (c.paso && r.previa !== c.previa) errs.push(`previa=${JSON.stringify(r.previa)} esperaba ${JSON.stringify(c.previa)}`);
    if (errs.length) { fallos++; console.log(`✗ ${c.n}\n    ${errs.join('\n    ')}`); }
    else console.log(`✓ ${c.n}`.padEnd(52) + (r.paso ? `responde | previa=${JSON.stringify(r.previa)}` : 'SILENCIO'));
  }
  const espera = (await correr({ msgId: 'm3', filas: [RAFAGA[0]], ultimoBot: ts(5) })).durmio;
  console.log(`\nventana de espera: ${espera} ms`);
  console.log(fallos ? `${fallos} FALLO(S)` : `Todo OK (${CASOS.length} casos)`);
  process.exit(fallos ? 1 : 0);
})();
