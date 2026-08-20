// _test_no_atender.js — ejecuta el codigo VIVO de "Check Chat Session" con axios simulado.
// Verifica que un chat marcado no_atender salga silenciado, que un cliente normal no se
// vea afectado, y —lo mas importante— que el upsert NUNCA mande la columna no_atender
// (si la mandara, el propio nodo la pisaria y el proveedor volveria a ser atendido).
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Check Chat Session').parameters.jsCode;

function correr(row) {
  const posts = [];
  const axiosFake = {
    get: async () => ({ data: row ? [row] : [] }),
    post: async (url, body) => { posts.push(body); return { data: [] }; },
  };
  const $ = () => ({ first: () => ({ json: { body: { payload: { from: '183708787155089@lid' } } } }) });
  const fn = new Function('$input', '$', 'require', `return (async () => { ${code} })();`);
  return fn({}, $, (m) => { if (m === 'axios') return axiosFake; throw new Error(m); })
    .then(out => ({ json: out[0].json, upsert: posts[0] }));
}

const ahora = new Date().toISOString();
const CASOS = [
  { n: 'proveedor marcado',
    row: { estado: 'automatico', msg_count: 1, window_start: ahora, manual_since: null, no_atender: true },
    esperaSilencio: true },
  { n: 'cliente normal',
    row: { estado: 'automatico', msg_count: 1, window_start: ahora, manual_since: null, no_atender: false },
    esperaSilencio: false },
  { n: 'chat nuevo (sin fila)',
    row: null, esperaSilencio: false },
  { n: 'proveedor que ademas fue tomado por un empleado',
    row: { estado: 'manual', msg_count: 1, window_start: ahora, manual_since: '2020-01-01T00:00:00Z', no_atender: true },
    esperaSilencio: true },
];

(async () => {
  let fallos = 0;
  for (const c of CASOS) {
    const { json, upsert } = await correr(c.row);
    // El IF vivo enruta a silencio si estado==='manual' O no_atender===true
    const silenciado = json.estado === 'manual' || json.no_atender === true;
    const errs = [];
    if (silenciado !== c.esperaSilencio) errs.push(`silenciado=${silenciado} esperaba ${c.esperaSilencio}`);
    if (typeof json.no_atender !== 'boolean') errs.push(`no_atender=${json.no_atender} deberia ser boolean (el IF es strict)`);
    if (upsert && 'no_atender' in upsert) errs.push('EL UPSERT MANDA no_atender -> pisaria la marca');
    if (errs.length) { fallos++; console.log(`✗ ${c.n}\n    ${errs.join('\n    ')}`); }
    else console.log(`✓ ${c.n}`.padEnd(48) + `estado=${json.estado} no_atender=${json.no_atender} -> ${silenciado ? 'SILENCIO' : 'responde'}`);
  }
  // El caso 4 es el que importa: reactivar 'manual' a los 30 min no debe resucitar al proveedor.
  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
