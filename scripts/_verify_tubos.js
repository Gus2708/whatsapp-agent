// READ-ONLY: corre el cuerpo EXACTO de hacer_presupuesto y buscar_productos
// desplegados (volcados en scratch_live/) contra Supabase real, para el caso tubos 2x1/3x1.
const fs = require('fs');
const path = require('path');
const presuBody = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_presupuesto.js'), 'utf8');
const buscarBody = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');

const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: { ...((cfg && cfg.headers) || {}) }, body: JSON.stringify(body) }); let data = null; try { data = await r.json(); } catch (e) {} return { data }; },
};
function fakeRequire(name) { return name === 'axios' ? axiosShim : require(name); }
function runner(body) { return new Function('query', 'require', '"use strict"; return (async () => {\n' + body + '\n})();'); }
async function presu(productos) { const out = await runner(presuBody)({ productos }, fakeRequire); try { return JSON.parse(out); } catch (e) { return { raw: out }; } }
async function buscar(p_busqueda) { const out = await runner(buscarBody)({ p_busqueda }, fakeRequire); try { return JSON.parse(out); } catch (e) { return { raw: out }; } }

(async () => {
  console.log('################ hacer_presupuesto ################');
  const lista = '15 lamina de zinc pintada, 4 tubos de 2x1, 3 tubos de 3x1, 1 caja de ganchos, 1 alambre dulce, 5 sacos cemento';
  for (const inp of [lista, 'tubo 2x1', 'tubo 3x1']) {
    console.log('\n=== PRESUPUESTO INPUT: "' + inp + '"');
    const r = await presu(inp);
    if (r.presupuesto_texto) {
      console.log(r.presupuesto_texto.split('\n').filter(Boolean).join('\n'));
      if (r.nota) console.log('NOTA: ' + r.nota);
      if (r.alternativas_texto) console.log('ALTS:\n' + r.alternativas_texto);
    } else console.log(JSON.stringify(r));
  }
  console.log('\n\n################ buscar_productos ################');
  for (const inp of ['tubo 2x1', 'tubo 3x1']) {
    console.log('\n=== BUSCAR INPUT: "' + inp + '"');
    const r = await buscar(inp);
    if (r.productos) r.productos.forEach((p, i) => console.log(`  ${i + 1}. ${p.nombre} | ${p.precio_divisas_texto} | disponible=${p.disponible}`));
    else console.log(JSON.stringify(r));
    if (r.instruccion) console.log('  INSTRUCCION:', r.instruccion.slice(0, 60));
  }
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
