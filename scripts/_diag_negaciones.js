// DIAGNÓSTICO (read-only): corre el cuerpo EXACTO de buscar_productos contra las consultas
// que ESCALARON A UN EMPLEADO (atenciones_pendientes), no solo contra solicitudes_ayuda.
// Ese canal es el que el harness actual no mira, y es donde están los fallos "fáciles".
//
//   node scripts/_diag_negaciones.js            # motivos reales de atenciones_pendientes
//   node scripts/_diag_negaciones.js --manual   # lista fija de casos conocidos
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1].trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');

const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const fakeRequire = n => (n === 'axios' ? axiosShim : require(n));
const fakeEnv = { OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'), OPENAI_API_KEY: pick('OPENAI_API_KEY') };
const run = b => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + b + '\n})();');
const buscar = async q => { try { return JSON.parse(await run(body)({ p_busqueda: q }, fakeRequire, fakeEnv)); } catch (e) { return { error: e.message }; } };

// Casos confirmados a mano contra el catálogo: el producto EXISTE y con stock.
// El bloque ÁNGULO son negaciones REALES que el bot le dijo a clientes (mensajes_bot),
// teniendo 5 ángulos en stock (SID 20x20, 30x30, 40x40, 50x50 + ANGULO 30X30).
const MANUALES = [
  ['angulo',                                       'ANGULO SID (5 en stock)'],
  ['tienen angulos',                               'ANGULO SID (5 en stock)'],
  ['ángulo L',                                     'ANGULO SID — dijo "no manejamos ángulos"'],
  ['angulo de 2x1 de 1 milimetro',                 'ANGULO SID — dijo "no manejamos ángulos"'],
  ['precio del angulo',                            'ANGULO SID'],
  ['angulo 30x30',                                 'ANGULO SID 30X30X3MMX6MTRS'],
  ['Tienen bloquen de 10',                         'BLOQUE #10 (5915 en existencia)'],
  ['bloque de 10',                                 'BLOQUE #10'],
  ['Hola tiene pintura blanca de cuñete',          'PINTURA PINCO CAUCHO CUÑETE 4G BLANCO (9)'],
  ['Tiene disponible tubo de 1/2 de hierro para agua', 'tubo hierro/herrería 1/2'],
  ['Me avisas que precio tiene la cerradura',      'alguna cerradura'],
  ['tubo 4x4 pesado',                              'tubo estructural 100x100'],
];

(async () => {
  const manual = process.argv.includes('--manual');
  let casos;
  if (manual) {
    casos = MANUALES.map(([q, esperado]) => ({ q, esperado }));
  } else {
    const r = await fetch(`${SB}/rest/v1/atenciones_pendientes?select=motivo,creado_en&order=creado_en.desc&limit=60`,
      { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
    casos = (await r.json())
      .filter(f => f.motivo && f.motivo.trim().length > 3 && !/^🛒 RESERVA/.test(f.motivo))
      .map(f => ({ q: f.motivo.trim(), esperado: '' }));
  }

  console.log(`Evaluando ${casos.length} consultas que ESCALARON a un empleado\n`);
  let ok = 0, vacio = 0;
  const fallan = [];
  for (const { q, esperado } of casos) {
    const res = await buscar(q);
    const n = res.encontrados || 0;
    const etiqueta = res.error ? 'ERROR' : res.aclarar ? 'aclarar' : res.no_vendido ? 'no_vendido' : n > 0 ? 'OK' : 'vacío';
    if (n > 0) ok++; else { vacio++; fallan.push(q); }
    console.log(`[${etiqueta.padEnd(10)}] "${q.slice(0, 70)}"`);
    if (esperado) console.log(`             esperado: ${esperado}`);
    const top = (res.productos || []).slice(0, 3).map(p => `${p.nombre} (${p.existencia ?? '?'})`).join(' | ');
    if (top) console.log(`             => ${top}`);
    if (res.error) console.log(`             ERROR: ${res.error}`);
  }
  console.log(`\n================ RESUMEN ================`);
  console.log(`evaluadas: ${casos.length} | con resultados: ${ok} | sin nada: ${vacio}`);
  if (fallan.length) { console.log(`\nSin resultados:`); for (const q of fallan) console.log(`  · ${q.slice(0, 80)}`); }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
