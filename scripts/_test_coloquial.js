// Mide RECALL real: se toma un producto del catálogo, se le pide a un "cliente
// simulado" que lo pida como lo pediría un venezolano de pueblo (sin usar las
// palabras técnicas), y se comprueba si buscar_productos devuelve ESE producto.
//
// Las consultas se generan UNA vez y se cachean en scratch_live/_coloquial_set.json,
// para que el antes/después del diccionario se mida sobre EXACTAMENTE las mismas
// preguntas. Sin eso la comparación no vale nada.
//
//   node scripts/_test_coloquial.js --generar 80   # crea el set (una sola vez)
//   node scripts/_test_coloquial.js                # corre el set contra la búsqueda
//   node scripts/_test_coloquial.js --etiqueta antes|despues
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SET = path.join(ROOT, 'scratch_live', '_coloquial_set.json');
const norm = require(path.join(ROOT, 'lib', 'serrucho-search.js')).norm;

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1].trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const OR_KEY = pick('OPENROUTER_API_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const fakeRequire = n => (n === 'axios' ? axiosShim : require(n));
// $env: el nodo Code de n8n lo expone; sin él el rescate semántico no se ejecuta.
// --sin-vector omite la key de OpenAI para medir el aporte REAL de la capa vectorial
// sobre el MISMO set de consultas; sin eso la comparación antes/después no vale nada.
const SIN_VECTOR = process.argv.includes('--sin-vector');
const fakeEnv = {
  OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'),
  OPENAI_API_KEY: SIN_VECTOR ? '' : pick('OPENAI_API_KEY'),
};
const run = b => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + b + '\n})();');
const buscar = async q => { try { return JSON.parse(await run(body)({ p_busqueda: q }, fakeRequire, fakeEnv)); } catch (e) { return { error: e.message }; } };

const SIM = `Eres un cliente venezolano común de un pueblo de Falcón: albañil, herrero, ama de casa o gente mayor. Escribes por WhatsApp a la ferretería.

Te doy un producto REAL del catálogo. Escribe el mensaje que mandarías para pedirlo.

REGLAS:
- Escribe como habla la gente, no como el catálogo. Usa el nombre popular, no el técnico.
- EVITA copiar las palabras exactas de la descripción si existe una forma coloquial.
- Puedes tener faltas de ortografía leves, como escribe la gente de verdad.
- Un solo mensaje corto, natural. Sin comillas.
- Si el producto lleva medida, puedes mencionarla como la diría un cliente.`;

async function generar(n) {
  const r = await fetch(`${SB}/rest/v1/productos?select=codigo_interno,descripcion&existencia=gt.0&limit=4000`, { headers: H });
  const todos = await r.json();
  // muestreo determinista y repartido por todo el catálogo (sin Math.random: reproducible)
  const paso = Math.floor(todos.length / n);
  const muestra = Array.from({ length: n }, (_, i) => todos[i * paso]).filter(Boolean);

  const casos = [];
  for (let i = 0; i < muestra.length; i += 8) {
    const grupo = muestra.slice(i, i + 8);
    const res = await Promise.all(grupo.map(async p => {
      const rr = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-5.6-luna', temperature: 0.8,
          messages: [{ role: 'system', content: SIM }, { role: 'user', content: `Producto: ${p.descripcion}` }],
        }),
      });
      const j = await rr.json();
      if (j.error) return null;
      return { codigo: p.codigo_interno, descripcion: p.descripcion, consulta: (j.choices[0].message.content || '').trim().replace(/^["']|["']$/g, '') };
    }));
    casos.push(...res.filter(Boolean));
    process.stdout.write(`\r  generadas ${casos.length}/${muestra.length}`);
  }
  fs.writeFileSync(SET, JSON.stringify(casos, null, 2));
  console.log(`\nset guardado: ${SET} (${casos.length} casos)`);
}

(async () => {
  if (process.argv.includes('--generar')) {
    const n = Number(process.argv[process.argv.indexOf('--generar') + 1]) || 80;
    return generar(n);
  }
  if (!fs.existsSync(SET)) throw new Error('no existe el set; corre primero: node scripts/_test_coloquial.js --generar 80');
  const todos = JSON.parse(fs.readFileSync(SET, 'utf8'));
  const etiqueta = process.argv.includes('--etiqueta') ? process.argv[process.argv.indexOf('--etiqueta') + 1] : '';
  // --limit N: corre solo los primeros N casos. El set completo tarda ~16 min porque cada
  // consulta que llega a la capa vectorial cuesta 4-7 s (las demás resuelven en ~650 ms).
  // Es para verificación rápida: el número oficial se mide SIEMPRE sobre el set completo.
  const limite = process.argv.includes('--limit') ? Number(process.argv[process.argv.indexOf('--limit') + 1]) : 0;
  const casos = limite > 0 ? todos.slice(0, limite) : todos;
  if (limite > 0) console.log(`PARCIAL: ${casos.length} de ${todos.length} casos (--limit) — no es el número oficial\n`);

  let exacto = 0, categoria = 0, nada = 0, hechos = 0;
  const fallos = [];
  const t0 = Date.now();
  for (const c of casos) {
    const res = await buscar(c.consulta);
    const prods = res.productos || [];
    // El resultado NO trae código, solo `nombre` (la descripción en Title Case),
    // así que el acierto exacto se mide por descripción normalizada.
    const objetivo = norm(c.descripcion);
    const hit = prods.some(p => norm(p.nombre || '') === objetivo);
    // "misma categoría" = comparten la primera palabra de la descripción
    const cat1 = norm(c.descripcion).split(' ')[0];
    const catHit = prods.some(p => norm(p.nombre || '').split(' ')[0] === cat1);
    if (hit) exacto++;
    else if (catHit) categoria++;
    else { nada++; fallos.push(c); }
    // Progreso en UNA línea que se sobreescribe (mismo idioma que generar()): sin esto la
    // terminal queda muda ~16 min y parece colgada. El reporte final no cambia.
    hechos++;
    const seg = (Date.now() - t0) / 1000;
    const falta = Math.round((seg / hechos) * (casos.length - hechos));
    process.stdout.write(`\r  ${hechos}/${casos.length}  ·  exacto ${exacto}  ·  ${seg.toFixed(0)}s transcurridos, ~${falta}s restantes    `);
  }
  process.stdout.write('\r' + ' '.repeat(76) + '\r');
  const pct = n => ((n / casos.length) * 100).toFixed(1) + '%';
  console.log(`\n========= RECALL COLOQUIAL ${etiqueta ? '[' + etiqueta + ']' : ''} =========`);
  console.log(`casos: ${casos.length}`);
  console.log(`  producto exacto en resultados : ${exacto}  (${pct(exacto)})`);
  console.log(`  al menos la categoría correcta: ${categoria}  (${pct(categoria)})`);
  console.log(`  fallo total                   : ${nada}  (${pct(nada)})`);
  console.log(`\nFallos:`);
  for (const f of fallos.slice(0, 30)) console.log(`  · "${f.consulta.slice(0, 70)}"\n      esperaba: ${f.descripcion}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
