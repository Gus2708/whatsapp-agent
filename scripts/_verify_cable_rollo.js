// READ-ONLY: corre el cuerpo EXACTO de buscar_productos desplegado contra Supabase real
// para el caso "rollo de cable #10" (bug: dio precio por metro en vez del rollo).
const fs = require('fs');
const path = require('path');
const buscarBody = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');

const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: { ...((cfg && cfg.headers) || {}) }, body: JSON.stringify(body) }); let data = null; try { data = await r.json(); } catch (e) {} return { data }; },
};
function fakeRequire(name) { return name === 'axios' ? axiosShim : require(name); }
function runner(body) { return new Function('query', 'require', '"use strict"; return (async () => {\n' + body + '\n})();'); }
async function buscar(p_busqueda) { const out = await runner(buscarBody)({ p_busqueda }, fakeRequire); try { return JSON.parse(out); } catch (e) { return { raw: out }; } }

(async () => {
  for (const inp of ['cable 10', 'rollo de cable 10', 'cable 10 rollo', 'rollo cable #10']) {
    console.log('\n=== BUSCAR INPUT: "' + inp + '"');
    const r = await buscar(inp);
    if (r.productos) r.productos.slice(0, 6).forEach((p, i) => console.log(`  ${i + 1}. ${p.nombre} | ${p.precio_divisas_texto} | disponible=${p.disponible}`));
    else console.log(JSON.stringify(r).slice(0, 200));
  }
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
