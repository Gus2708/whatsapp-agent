// _test_captura_nombre.js — ejecuta el codigo VIVO de "Cliente Memoria" con axios simulado.
// Cubre las dos direcciones: que ahora SI capture la respuesta corta ("Pedro"), y que NO
// se trague un producto, un saludo ni un pushName basura como si fuera el nombre del cliente.
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Cliente Memoria').parameters.jsCode;

// Terminos que existen en catalogo_vocabulario (3.573 reales; aqui una muestra que basta).
const CATALOGO = ['cemento', 'gris', 'tubo', 'clavo', 'pintura', 'cabilla', 'zinc', 'lamina'];

function correr({ mensaje, pushName = null, guardado = null, ultimosBot = [] }) {
  const posts = [];
  const preg = 'con quién tengo el gusto';
  const axiosFake = {
    get: async (url) => {
      if (url.includes('clientes_chat')) return { data: guardado ? [{ nombre: guardado, notas: null }] : [] };
      if (url.includes('mensajes_bot')) return { data: ultimosBot.map(t => ({ texto_norm: t })) };
      if (url.includes('catalogo_vocabulario')) {
        const m = decodeURIComponent(url.split('termino=in.(')[1] || '').replace(')', '').split(',');
        return { data: m.some(w => CATALOGO.includes(w)) ? [{ termino: m[0] }] : [] };
      }
      return { data: [] };
    },
    post: async (url, body) => { posts.push(body); return { data: [] }; },
  };
  const $ = () => ({ first: () => ({ json: { body: { payload: { from: '58412@c.us', body: mensaje, _data: { pushName } } } } }) });
  const fn = new Function('$input', '$', 'require', `return (async () => { ${code} })();`);
  return fn({}, $, (m) => { if (m === 'axios') return axiosFake; throw new Error(m); })
    .then(out => ({ json: out[0].json, guardo: posts.find(p => p && p.nombre) || null }));
}

const PREG = '¿con quién tengo el gusto? 😊';
const OTRO = 'cemento gris disponibilidad: ✅ precio divisas: 5$';

const CASOS = [
  // --- lo que ANTES fallaba: la respuesta natural a nuestra propia pregunta ---
  { n: 'acabamos de preguntar -> "Pedro"', a: { mensaje: 'Pedro', ultimosBot: [PREG] }, nombre: 'Pedro' },
  { n: 'acabamos de preguntar -> "pedro perez"', a: { mensaje: 'pedro perez', ultimosBot: [PREG] }, nombre: 'Pedro Perez' },
  { n: 'acabamos de preguntar -> "Yulibeth"', a: { mensaje: 'Yulibeth', ultimosBot: [PREG] }, nombre: 'Yulibeth' },

  // --- falsos positivos que NO debe tragarse ---
  { n: 'responde un producto -> "cemento gris"', a: { mensaje: 'cemento gris', ultimosBot: [PREG] }, nombre: null },
  { n: 'responde "si"', a: { mensaje: 'si', ultimosBot: [PREG] }, nombre: null },
  { n: 'responde "buenas tardes"', a: { mensaje: 'buenas tardes', ultimosBot: [PREG] }, nombre: null },
  { n: 'responde un telefono', a: { mensaje: '04121234567', ultimosBot: [PREG] }, nombre: null },
  { n: 'no preguntamos -> "necesito cemento"', a: { mensaje: 'necesito cemento', ultimosBot: [OTRO] }, nombre: null },
  { n: 'no preguntamos -> "Pedro" suelto', a: { mensaje: 'Pedro', ultimosBot: [OTRO] }, nombre: null },

  // --- el camino viejo (preambulo) debe seguir funcionando ---
  { n: 'preambulo: "me llamo Ana Rojas"', a: { mensaje: 'me llamo Ana Rojas', ultimosBot: [OTRO] }, nombre: 'Ana Rojas' },

  // --- pushName como ultimo recurso ---
  { n: 'pushName "Diego Bracho"', a: { mensaje: 'hola', pushName: 'Diego Bracho', ultimosBot: [] }, nombre: 'Diego Bracho' },
  { n: 'pushName "🐄" (emoji)', a: { mensaje: 'hola', pushName: '🐄', ultimosBot: [] }, nombre: null },
  { n: 'pushName "Dios"', a: { mensaje: 'hola', pushName: 'Dios', ultimosBot: [] }, nombre: null },
  { n: 'pushName handle largo', a: { mensaje: 'hola', pushName: 'fernandezmedinasergiojose', ultimosBot: [] }, nombre: null },

  // --- tope de insistencia ---
  { n: 'ya preguntamos 2 veces, sin nombre', a: { mensaje: 'y el saco?', ultimosBot: [OTRO, PREG, PREG] }, nombre: null, pedir: 'no' },
  { n: 'preguntamos 1 vez, sin nombre', a: { mensaje: 'y el saco?', ultimosBot: [OTRO, PREG] }, nombre: null, pedir: 'si' },
  { n: 'ya tenemos el nombre guardado', a: { mensaje: 'hola', guardado: 'Marta', ultimosBot: [] }, nombre: 'Marta', pedir: 'no' },
];

(async () => {
  let fallos = 0;
  for (const c of CASOS) {
    const { json, guardo } = await correr(c.a);
    const errs = [];
    if ((json.cliente_nombre || null) !== c.nombre) errs.push(`nombre=${JSON.stringify(json.cliente_nombre)} esperaba ${JSON.stringify(c.nombre)}`);
    if (c.pedir && json.pedir_nombre !== c.pedir) errs.push(`pedir_nombre=${json.pedir_nombre} esperaba ${c.pedir}`);
    // si captura un nombre nuevo, tiene que persistirlo
    if (c.nombre && !c.a.guardado && !guardo) errs.push('capturo el nombre pero NO lo guardo en clientes_chat');
    if (!c.nombre && guardo) errs.push(`guardo "${guardo.nombre}" sin deberlo`);
    if (errs.length) { fallos++; console.log(`✗ ${c.n}\n    ${errs.join('\n    ')}`); }
    else console.log(`✓ ${c.n}`.padEnd(46) + `-> ${JSON.stringify(json.cliente_nombre)} | pedir_nombre=${json.pedir_nombre}`);
  }
  console.log(fallos ? `\n${fallos} FALLO(S)` : `\nTodo OK (${CASOS.length} casos)`);
  process.exit(fallos ? 1 : 0);
})();
