// _test_registro_entrante.js — ejecuta el codigo VIVO del nodo "Filtro Anti-Duplicado"
// contra payloads sinteticos, con axios y Supabase simulados. Verifica que:
//   - se registre el texto del cliente (y el tipo correcto) en mensajes_procesados
//   - la compuerta de frescura siga descartando mensajes viejos SIN insertarlos
//     (si se insertaran, el catchup los veria como ya procesados y no se recuperarian)
// No toca produccion: no hay red, el POST se intercepta.
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Filtro Anti-Duplicado').parameters.jsCode;

const ahora = Math.floor(Date.now() / 1000);

function correr(payload, { catchup = false } = {}) {
  const posts = [];
  const axiosFake = {
    post: async (url, body) => { posts.push({ url, body }); return { data: [{ ok: true }] }; }
  };
  const $input = { all: () => [{ json: { body: { payload, catchup } } }] };
  const fn = new Function('$input', 'require', `return (async () => { ${code} })();`);
  return fn($input, (m) => { if (m === 'axios') return axiosFake; throw new Error('modulo ' + m); })
    .then(out => ({ out, posts }));
}

const base = { id: 'msg_1', from: '58412000@c.us', timestamp: ahora };

const CASOS = [
  { n: 'texto plano',
    p: { ...base, body: 'Buenas, tienen cabilla de 3/8?' },
    esperado: { insertado: true, texto: 'Buenas, tienen cabilla de 3/8?', tipo: 'texto', pasa: true } },

  { n: 'nota de voz (ptt)',
    p: { ...base, body: null, hasMedia: true, type: 'ptt', media: { mimetype: 'audio/ogg; codecs=opus' } },
    esperado: { insertado: true, texto: null, tipo: 'ptt', pasa: true } },

  { n: 'imagen',
    p: { ...base, body: null, hasMedia: true, media: { mimetype: 'image/jpeg' } },
    esperado: { insertado: true, texto: null, tipo: 'image', pasa: true } },

  { n: 'media en base64 (body data:)',
    p: { ...base, body: 'data:audio/ogg;base64,AAAA', hasMedia: true, media: { mimetype: 'audio/ogg' } },
    esperado: { insertado: true, texto: null, tipo: 'ptt', pasa: true } },

  { n: 'documento (otro)',
    p: { ...base, body: null, hasMedia: true, media: { mimetype: 'application/pdf' } },
    esperado: { insertado: true, texto: null, tipo: 'otro', pasa: true } },

  { n: 'VIEJO sin catchup -> compuerta',
    p: { ...base, body: 'hola', timestamp: ahora - 3600 },
    esperado: { insertado: false, pasa: false } },

  { n: 'viejo CON catchup -> si entra',
    p: { ...base, body: 'hola', timestamp: ahora - 3600 },
    opts: { catchup: true },
    esperado: { insertado: true, texto: 'hola', tipo: 'texto', pasa: true } },

  { n: 'texto larguisimo -> truncado a 4000',
    p: { ...base, body: 'x'.repeat(9000) },
    esperado: { insertado: true, largo: 4000, tipo: 'texto', pasa: true } },
];

(async () => {
  let fallos = 0;
  for (const c of CASOS) {
    const { out, posts } = await correr(c.p, c.opts || {});
    const e = c.esperado;
    const body = posts[0] ? posts[0].body : null;
    const errs = [];

    if (!!body !== e.insertado) errs.push(`insertado=${!!body} esperaba ${e.insertado}`);
    if (out.length > 0 !== e.pasa) errs.push(`pasa=${out.length > 0} esperaba ${e.pasa}`);
    if (body) {
      if ('texto' in e && body.texto !== e.texto) errs.push(`texto=${JSON.stringify(body.texto)} esperaba ${JSON.stringify(e.texto)}`);
      if ('largo' in e && (body.texto || '').length !== e.largo) errs.push(`largo=${(body.texto || '').length} esperaba ${e.largo}`);
      if ('tipo' in e && body.tipo !== e.tipo) errs.push(`tipo=${body.tipo} esperaba ${e.tipo}`);
    }

    if (errs.length) { fallos++; console.log(`✗ ${c.n}\n    ${errs.join('\n    ')}`); }
    else console.log(`✓ ${c.n}`.padEnd(42) + (body ? `tipo=${body.tipo} texto=${JSON.stringify(String(body.texto).slice(0, 40))}` : 'descartado, sin insert'));
  }
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
