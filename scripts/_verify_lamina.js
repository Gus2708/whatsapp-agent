// READ-ONLY: corre el cuerpo EXACTO de buscar_productos desplegado contra Supabase real
// para la lámina arquitectónica que el bot no encontró.
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

const inputs = [
  'laminas arquitectonica calibre 0.30 de 6 metros de largo x 1.10 de ancho',
  'lamina arquitectonica 0.30 6mts 1.10',
  'lamina arquitectonica',
  'lamina arquitectonica calibre 0.30',
  'lamina techo 0.30 6 metros 1.10',
];
(async () => {
  for (const inp of inputs) {
    console.log('\n=== BUSCAR: "' + inp + '"');
    const r = await buscar(inp);
    if (r.productos && r.productos.length) r.productos.forEach((p, i) => console.log(`  ${i + 1}. ${p.nombre} | ${p.precio_divisas_texto} | disp=${p.disponible}`));
    else console.log('  encontrados:', r.encontrados);
    if (r.instruccion) console.log('  INSTRUCCION:', r.instruccion.slice(0, 70));
  }
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
