const fs = require('fs');
const path = require('path');
const buscarBody = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: (cfg && cfg.headers) || {}, body: JSON.stringify(body) }); let data = null; try { data = await r.json(); } catch(e){} return { data }; }
};
function fakeRequire(name) { return name === 'axios' ? axiosShim : require(name); }
function runner(body) { return new Function('query', 'require', '"use strict"; return (async () => {\n' + body + '\n})();'); }
async function buscar(p_busqueda) { const out = await runner(buscarBody)({ p_busqueda }, fakeRequire); try { return JSON.parse(out); } catch (e) { return { raw: out }; } }

(async () => {
  const queries = [
    'Q vale la lámina prepintada canal redonda',
    'lamina prepintada canal redonda',
    'de las prepintadas 12 pies',
    '12 pies canal ondulado prepintada',
    'lamina prepintada',
    'lamina canal redonda'
  ];
  for (const q of queries) {
    console.log('====================================');
    console.log('QUERY:', q);
    const res = await buscar(q);
    console.log('encontrados:', res.encontrados, 'capa / rescate:', res._rescate || res.origen || 'normal');
    if (res.productos) {
      res.productos.forEach(p => console.log('  -', p.codigo_interno, '|', p.nombre, '|', p.precio_divisas_texto, '| disp:', p.disponible));
    }
    if (res.instruccion) console.log('  INSTRUCCION:', res.instruccion);
  }
})();
