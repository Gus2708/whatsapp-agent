// Ejecuta el cuerpo real de live_buscar.js con UNA consulta y muestra la salida completa.
// Uso: node scripts/_run_one_buscar.js "lamina de zinc roja o azul"
const fs = require('fs');
const path = require('path');
const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json().catch(() => null) }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: (cfg && cfg.headers) || {}, body: JSON.stringify(body) }); return { data: await r.json().catch(() => null) }; },
};
const { construirEnv } = require('./_lib_credenciales');
const body = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('require', 'query', '$env', body);
run(n => (n === 'axios' ? axiosShim : require(n)), { p_busqueda: process.argv[2] }, construirEnv())
  .then(out => { const p = JSON.parse(out); delete p.kit_sugerido; console.log(JSON.stringify(p, null, 1)); });
