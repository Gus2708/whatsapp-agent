// READ-ONLY: ejecuta el cuerpo EXACTO del tool hacer_presupuesto desplegado,
// contra Supabase real, para ver qué devuelve ante distintas formas de "40x100".
const fs = require('fs');
const path = require('path');
const body = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_presupuesto.js'), 'utf8');

// Shim de axios sobre fetch nativo (n8n trae axios; aquí no está instalado).
const axiosShim = {
  async get(url, cfg) {
    const r = await fetch(url, { headers: (cfg && cfg.headers) || {} });
    return { data: await r.json() };
  },
  async post(url, body, cfg) {
    const r = await fetch(url, { method: 'POST', headers: { ...((cfg && cfg.headers) || {}) }, body: JSON.stringify(body) });
    let data = null; try { data = await r.json(); } catch (e) {}
    return { data };
  },
};
function fakeRequire(name) { return name === 'axios' ? axiosShim : require(name); }

// n8n envuelve el código en un async; replicamos eso. Inyectamos `require`.
function makeRunner() {
  return new Function('query', 'require', '"use strict"; return (async () => {\n' + body + '\n})();');
}

async function runTool(productos) {
  const run = makeRunner();
  const out = await run({ productos }, fakeRequire);
  try { return JSON.parse(out); } catch (e) { return { raw: out }; }
}

const inputs = [
  '18 tubo de 40×100',      // signo × (multiplicación) tal como lo escribió el cliente
  '18 tubo de 40x100',      // letra x
  '18 tubo 40 x 100',       // con espacios
  'tubo estructural 40x100',
  'tubo estructural 100x40',
  '18 tubo 2x1',            // lo que devolvió mal
];

(async () => {
  for (const inp of inputs) {
    process.stdout.write('\n=== INPUT: "' + inp + '"\n');
    try {
      const r = await runTool(inp);
      if (r.presupuesto_texto) {
        process.stdout.write(r.presupuesto_texto.split('\n').slice(0, 3).join('\n') + '\n');
        if (r.nota) process.stdout.write('NOTA: ' + r.nota + '\n');
        if (r.alternativas_texto) process.stdout.write('ALTS: ' + r.alternativas_texto + '\n');
      } else {
        process.stdout.write(JSON.stringify(r) + '\n');
      }
    } catch (e) {
      process.stdout.write('ERROR: ' + e.message + '\n');
    }
  }
})();
