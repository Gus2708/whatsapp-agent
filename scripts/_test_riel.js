// READ-ONLY test: corre el cuerpo EXACTO de hacer_presupuesto (live) contra Supabase real,
// probando variantes de codigo (actual / +sinonimo riel / +sinonimo+norm x) ante los inputs del cliente.
const fs = require('fs');
const path = require('path');
const LIVE = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_presupuesto.js'), 'utf8');

// --- transformaciones candidatas (mismas que desplegaremos) ---
function addSinonimoRiel(code) {
  const anchor = "const SIN = {\n";
  if (code.includes("'riel':'tubo herreria'")) return code;
  return code.replace(anchor, anchor + "  'rieles':'tubo herreria','riel':'tubo herreria',\n");
}
function addNormX(code) {
  const A = ".toLowerCase().normalize('NFD')";
  const B = ".toLowerCase().replace(/[\\u00d7\\u2715\\u2716]/g,'x').normalize('NFD')";
  if (code.includes('\\u00d7')) return code;
  return code.split(A).join(B); // norm() es la unica que usa este patron
}

const variants = {
  'ACTUAL (live)': LIVE,
  '+sinonimo riel': addSinonimoRiel(LIVE),
  '+sinonimo +norm x': addNormX(addSinonimoRiel(LIVE)),
};

// shim axios sobre fetch
const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: { ...((cfg && cfg.headers) || {}) }, body: JSON.stringify(body) }); let data = null; try { data = await r.json(); } catch (e) {} return { data }; },
};
function fakeRequire(name) { return name === 'axios' ? axiosShim : require(name); }
function makeRunner(body) { return new Function('query', 'require', '"use strict"; return (async () => {\n' + body + '\n})();'); }
async function runTool(body, productos) { const out = await makeRunner(body)({ productos }, fakeRequire); try { return JSON.parse(out); } catch (e) { return { raw: out }; } }

const X = '×'; // signo multiplicacion (lo que escribe el cliente en el telefono)
const inputs = [
  '3 rieles 3' + X + '1',
  '8 rieles 2' + X + '1',
  '3 rieles 3x1',          // con letra x
  '8 rieles 2x1',          // con letra x
  // lista completa del cliente (tal como llego)
  '3 rieles 3' + X + '1\n8 rieles 2' + X + '1\n15 laminas cuadradas\n2 cercha\n1 caja de gancho\n3 cabillas 3/8',
];

(async () => {
  for (const [vname, body] of Object.entries(variants)) {
    process.stdout.write('\n############## VARIANTE: ' + vname + '\n');
    for (const inp of inputs) {
      process.stdout.write('\n=== INPUT: "' + inp.replace(/\n/g, ' | ') + '"\n');
      try {
        const r = await runTool(body, inp);
        if (r.presupuesto_texto) {
          // imprime solo las lineas de items (las que empiezan con numero.) y la nota
          const lines = r.presupuesto_texto.split('\n').filter(l => /^\d+\.\s/.test(l) || /x .*=/.test(l));
          process.stdout.write(lines.join('\n') + '\n');
          if (r.nota) process.stdout.write('NOTA: ' + r.nota + '\n');
        } else {
          process.stdout.write(JSON.stringify(r) + '\n');
        }
      } catch (e) { process.stdout.write('ERROR: ' + e.message + '\n'); }
    }
  }
})();
