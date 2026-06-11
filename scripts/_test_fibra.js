// READ-ONLY: compara buscar ACTUAL (live) vs +regla "fibra de piso -> macrofibra" contra Supabase real.
const fs = require('fs');
const path = require('path');
const LIVE = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');

// regla: si la consulta trae "fibra" + contexto de piso/concreto, fibra -> macrofibra (la fibra estructural)
const ANCHOR = "'cal preparada'); ";
const FIBRA_RULE = "if(/\\bfibra\\b/.test(s)&&/\\b(pisos?|concreto|vaciado|losa|estructural)\\b/.test(s)) s=s.replace(/\\bfibra\\b/g,'macrofibra'); ";
function addFibraRule(code) {
  if (code.includes('macrofibra')) return code;
  if (!code.includes(ANCHOR)) throw new Error('anchor cal no encontrado');
  return code.replace(ANCHOR, ANCHOR + FIBRA_RULE);
}
const FIXED = addFibraRule(LIVE);

const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const req = n => n === 'axios' ? axiosShim : require(n);
const run = (body, q) => new Function('query', 'require', '"use strict"; return (async()=>{\n' + body + '\n})();')({ p_busqueda: q }, req);
function short(r) { try { const o = JSON.parse(r); if (!o.productos) return ['(0) ' + (o.mensaje || '')]; return o.productos.slice(0, 4).map(p => p.nombre + ' [' + p.precio_divisas_texto + (p.disponible ? '' : ' AGOTADO') + ']'); } catch (e) { return ['(parse err)']; } }

const objetivo = [
  'fibra de la que se usa para pisos',   // mensaje real de la clienta
  'fibra para pisos', 'fibra de piso', 'fibra para concreto', 'macrofibra',
];
const regresion = [
  'fibra de vidrio', 'malla mosquitero fibra', 'cinta fibra de vidrio drywall',
];

(async () => {
  for (const [grupo, inputs] of [['OBJETIVO (debe dar MACROFIBRA)', objetivo], ['REGRESION (NO debe cambiar)', regresion]]) {
    console.log('\n=================== ' + grupo + ' ===================');
    for (const q of inputs) {
      const a = short(await run(LIVE, q));
      const f = short(await run(FIXED, q));
      const same = JSON.stringify(a) === JSON.stringify(f);
      console.log('\n• "' + q + '"  ' + (same ? '(igual)' : '*** CAMBIO ***'));
      if (same) a.forEach(l => console.log('    ' + l));
      else { console.log('  ACTUAL:'); a.forEach(l => console.log('    ' + l)); console.log('  FIXED :'); f.forEach(l => console.log('    ' + l)); }
    }
  }
})();
