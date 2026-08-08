// READ-ONLY: instrumenta el camino de la capa vectorial para una consulta concreta.
// Responde las preguntas que los intentos de arreglo dieron por supuestas:
//   ¿se dispara el gatillo?  ¿cuánto tarda OpenAI?  ¿qué similitud da?
//   ¿pasa el umbral?  ¿la condición de adopción lo acepta o lo tira?
//
//   node scripts/_diag_vector.js "tendran tapa para el bano"
//   node scripts/_diag_vector.js            # el set de casos por defecto
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'lib', 'serrucho-search.js'));

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL'), ANON = pick('SUPABASE_ANON_KEY'), OAI = pick('OPENAI_API_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const UMBRAL = 0.45;      // el mismo que usa live_buscar.js
const TIMEOUT = 9000;

const CASOS = process.argv[2] ? [process.argv[2]] : [
  'tendran tapa para el bano',
  'disco de corte',
  'algo para cortar cabilla',
  'cemento gris',
];

// mismo cuerpo de busqueda lexica que usa el nodo, para saber que trae realmente
const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: (c && c.headers) || {}, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const run = b => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + b + '\n})();');
const fakeEnv = { OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'), OPENAI_API_KEY: OAI };

async function embed(texto) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: texto.slice(0, 500), dimensions: 1536 }),
    });
    const j = await r.json();
    clearTimeout(to);
    if (j.error) return { ms: Date.now() - t0, error: j.error.message };
    return { ms: Date.now() - t0, v: j.data[0].embedding };
  } catch (e) {
    clearTimeout(to);
    return { ms: Date.now() - t0, error: e.name === 'AbortError' ? `TIMEOUT a los ${TIMEOUT}ms` : e.message };
  }
}

(async () => {
  for (const q of CASOS) {
    console.log(`\n${'='.repeat(78)}\n"${q}"`);

    // 1. que trae lo lexico (corriendo el nodo real SIN la key de OpenAI: solo lexico)
    const lex = JSON.parse(await run(body)({ p_busqueda: q },
      n => (n === 'axios' ? axiosShim : require(n)),
      { OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' }));
    const top = (lex.productos || [])[0];
    console.log(`  LEXICO      : ${top ? top.nombre : '(nada)'}`);

    // 2. el gatillo: ¿le falta alguna palabra de la consulta al primer resultado?
    const qTok = L.expandir(q).split(' ').filter(w => w.length > 2 && !/\d/.test(w));
    const d0 = top ? L.norm(top.nombre) : '';
    const faltan = qTok.filter(t => !L.aliasDe(t).some(a => d0.includes(a)));
    console.log(`  GATILLO     : ${faltan.length ? 'SI dispara — faltan: ' + faltan.join(', ') : 'NO dispara (están todas)'}`);
    if (!faltan.length) continue;

    // 3. OpenAI: latencia y si respondio
    const e = await embed(q);
    if (e.error) { console.log(`  EMBEDDING   : ✗ ${e.error}  (${e.ms}ms)`); continue; }
    console.log(`  EMBEDDING   : ok en ${e.ms}ms`);

    // 4. que devuelve el vector y con que similitud (sin umbral, para ver TODO)
    const r = await fetch(SB + '/rest/v1/rpc/buscar_semantico', {
      method: 'POST', headers: H,
      body: JSON.stringify({ p_embedding: JSON.stringify(e.v), p_umbral: 0, p_limite: 5 }),
    });
    let filas = [];
    try { const d = JSON.parse(await r.text()); if (Array.isArray(d)) filas = d; } catch (err) {}
    if (!filas.length) { console.log('  VECTOR      : (la rpc no devolvio nada)'); continue; }

    console.log('  VECTOR      :');
    for (const f of filas) {
      const pasa = f.similitud >= UMBRAL ? '  ' : ' ✗';
      console.log(`     ${f.similitud.toFixed(3)}${pasa} ${f.descripcion.slice(0, 58)}`);
    }
    const sobreUmbral = filas.filter(f => f.similitud >= UMBRAL);
    console.log(`  UMBRAL ${UMBRAL}  : ${sobreUmbral.length} de ${filas.length} lo pasan`);
    if (!sobreUmbral.length) { console.log('  => el vector NO propone nada. La condicion de adopcion ni se evalua.'); continue; }

    // 5. la condicion de adopcion actual (categoria distinta) vs la alternativa (producto distinto)
    const vcat = L.norm(sobreUmbral[0].descripcion).split(' ')[0];
    const lcat = d0.split(' ')[0];
    console.log(`  ADOPCION    : cat vector="${vcat}" vs cat lexico="${lcat}"  ->  ${vcat !== lcat ? 'ADOPTA' : 'DESCARTA (misma categoria)'}`);
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
