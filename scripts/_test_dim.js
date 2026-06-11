// READ-ONLY: compara el codigo ACTUAL (live) vs DIMFIXED (applyFixes de _dimfix_lib)
// para buscar y presupuesto, contra Supabase real. Marca DIFERENCIAS (posibles regresiones)
// y los casos objetivo (40x100 / 100x40).
const fs = require('fs');
const path = require('path');
const { applyFixes } = require('./_dimfix_lib');

const liveBuscar = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
const livePresu  = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_presupuesto.js'), 'utf8');
const dimBuscar  = applyFixes(liveBuscar, 'buscar').code;
const dimPresu   = applyFixes(livePresu,  'presupuesto').code;
console.log('applyFixes buscar:', applyFixes(liveBuscar, 'buscar').log.join(' '));
console.log('applyFixes presu :', applyFixes(livePresu,  'presupuesto').log.join(' '));

const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const req = n => n === 'axios' ? axiosShim : require(n);
function runBuscar(body, q) { return new Function('query', 'require', '"use strict"; return (async()=>{\n' + body + '\n})();')({ p_busqueda: q }, req); }
function runPresu(body, q) { return new Function('query', 'require', '"use strict"; return (async()=>{\n' + body + '\n})();')({ productos: q }, req); }

const X = '×';
const buscarInputs = [
  'tubo estructural 40' + X + '100', 'tubo estructural 100x40',  // OBJETIVO order-independent
  'rieles 2x1', 'riel 3' + X + '1', 'rieles 3x1-1/2',            // regresion riel
  'cabilla 1/2', 'cabilla 3/8',                                  // regresion cabilla
  'tubo herreria 2x2', 'tubo herreria 1x1', 'tubo herreria 1x1/2',// regresion pares
  'angulo 1x1/8', 'lamina hp 2', 'cemento', 'disco corte 4 1/2', // varios
  'tubo agua 1/2', 'tubo 3',                                     // medidas sueltas (riesgo 2da dim)
];
const presuInputs = [
  '18 tubo de 40' + X + '100',                                   // OBJETIVO
  '3 rieles 3' + X + '1\n8 rieles 2' + X + '1\n15 laminas cuadradas\n2 cercha\n1 caja de gancho\n3 cabillas 3/8', // lista cliente
  'cemento:2, cabilla 3/8:3, tubo herreria 2x2:4',
];

function shortBuscar(r) { try { const o = JSON.parse(r); return (o.productos || []).slice(0, 3).map(p => p.nombre + ' [' + p.precio_divisas_texto + (p.disponible ? '' : ' AGOTADO') + ']'); } catch (e) { return ['(parse err)']; } }
function shortPresu(r) { try { const o = JSON.parse(r); if (!o.ok) return ['NO OK: ' + o.mensaje]; const items = (o.presupuesto_texto || '').split('\n').filter(l => /^\d+\.\s/.test(l)); const a = o.alternativas_texto ? ['ALT: ' + o.alternativas_texto.replace(/\n/g, ' / ')] : []; const nota = o.nota ? ['NOTA: ' + o.nota] : []; return items.concat(a).concat(nota); } catch (e) { return ['(parse err)']; } }

(async () => {
  for (const [label, inputs, runFn, actBody, dimBody, shortFn] of [
    ['BUSCAR', buscarInputs, runBuscar, liveBuscar, dimBuscar, shortBuscar],
    ['PRESUPUESTO', presuInputs, runPresu, livePresu, dimPresu, shortPresu],
  ]) {
    console.log('\n=================== ' + label + ' ===================');
    for (const q of inputs) {
      const a = shortFn(await runFn(actBody, q));
      const d = shortFn(await runFn(dimBody, q));
      const same = JSON.stringify(a) === JSON.stringify(d);
      console.log('\n• "' + q.replace(/\n/g, ' | ') + '"  ' + (same ? '(igual)' : '*** CAMBIO ***'));
      if (same) { a.forEach(l => console.log('    ' + l)); }
      else { console.log('  ACTUAL :'); a.forEach(l => console.log('    ' + l)); console.log('  DIMFIX :'); d.forEach(l => console.log('    ' + l)); }
    }
  }
})();
