// Embebe el catálogo con OpenAI (text-embedding-3-small) hacia productos_embedding.
// Incremental por hash: solo re-embebe lo nuevo o lo que cambió de descripción.
//
//   node scripts/generar_embeddings.js          # incremental
//   node scripts/generar_embeddings.js --full   # re-embebe TODO
//   node scripts/generar_embeddings.js --dry    # solo dice qué haría y cuánto costaría
//
// Requiere OPENAI_API_KEY en .env. Costo real: los 7.565 productos son ~76k tokens
// = $0.0015 a $0.02/M. Cada corrida incremental posterior cuesta céntimos.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const norm = require(require('path').join(__dirname, '..', 'lib', 'serrucho-search.js')).norm;

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();

const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
// .env manda, pero se acepta la variable de entorno para probar sin tocar el archivo
const OAI = pick('OPENAI_API_KEY') || (process.env.OPENAI_API_KEY || '').trim();
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const MODELO = 'text-embedding-3-small';
const DIMS = 1536;
const LOTE = 256;          // inputs por llamada a OpenAI (su limite es mayor, vamos conservadores)
// El lote de ESCRITURA es mucho mas chico y va aparte a proposito: un vector de 1536
// dimensiones pesa ~20KB en JSON, y 256 de golpe se pasan del statement_timeout de
// Supabase (error 57014). 40 filas por POST entra de sobra.
const LOTE_ESCRITURA = 40;
const PRECIO_M = 0.02;     // USD por millon de tokens

const FULL = process.argv.includes('--full');
const DRY = process.argv.includes('--dry');

async function sbGet(q) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${q} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function traerTodo(tabla, select, orden) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const p = await sbGet(`${tabla}?select=${select}&order=${orden}&offset=${off}&limit=1000`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out;
}

// TEXTO ENRIQUECIDO (v2). Antes se embebía la descripción cruda y el resultado fue nulo:
// una cadena de SKU de 36 caracteres ("TAPA DE INODORO CIERRE SUAVE 17X14 BEIGE AQUAFINA")
// no es prosa, así que el vector acababa midiendo solapamiento léxico —lo que pg_trgm ya
// hacía— y su suelo de ruido quedaba altísimo ("asdfgh qwerty" puntuaba 0.467).
//
// Ahora se le añade la CATEGORÍA y los términos coloquiales que ya tenemos en
// catalogo_vocabulario para esa categoría. Eso le da al vector el contexto en lenguaje
// natural que le faltaba y mete el vocabulario venezolano DENTRO del espacio semántico:
//   "TAPA DE INODORO ... | sanitario tapa | como lo pide el cliente: tapa de poceta,
//    asiento para wc, tapa del baño"
let VOCAB_POR_CAT = new Map();
function textoDe(p) {
  const desc = p.descripcion.trim();
  const cat = norm(desc).split(' ')[0];
  const sinon = (VOCAB_POR_CAT.get(cat) || []).slice(0, 12);
  let t = desc;
  if (cat) t += ' | categoria: ' + cat;
  if (sinon.length) t += ' | como lo pide el cliente: ' + sinon.join(', ');
  return t;
}
const hashDe = t => crypto.createHash('md5').update(t).digest('hex');

async function embeber(textos) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OAI}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODELO, input: textos, dimensions: DIMS }),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`OpenAI ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
  return { vectores: j.data.map(d => d.embedding), tokens: j.usage.total_tokens };
}

(async () => {
  if (!OAI) throw new Error('falta OPENAI_API_KEY en .env — créala en platform.openai.com/api-keys');
  if (!ANON) throw new Error('falta SUPABASE_ANON_KEY en .env');

  console.log('Leyendo catálogo…');
  const productos = (await traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'))
    .filter(p => p.descripcion && p.descripcion.trim());
  console.log(`  ${productos.length} productos`);

  // diccionario coloquial agrupado por categoría, para enriquecer el texto a embeber
  const vocab = await traerTodo('catalogo_vocabulario', 'termino,categoria&activo=eq.true', 'categoria.asc');
  for (const v of vocab) {
    if (!v.categoria) continue;
    if (!VOCAB_POR_CAT.has(v.categoria)) VOCAB_POR_CAT.set(v.categoria, []);
    VOCAB_POR_CAT.get(v.categoria).push(v.termino);
  }
  console.log(`  ${vocab.length} términos coloquiales en ${VOCAB_POR_CAT.size} categorías`);

  const previos = new Map(
    (await traerTodo('productos_embedding', 'codigo_interno,hash_desc', 'codigo_interno.asc'))
      .map(r => [r.codigo_interno, r.hash_desc])
  );
  console.log(`  ${previos.size} ya embebidos`);

  const pendientes = productos.filter(p => FULL || previos.get(p.codigo_interno) !== hashDe(textoDe(p)));
  console.log(`  a embeber: ${pendientes.length}${FULL ? ' (--full)' : ' (nuevos o con descripción cambiada)'}`);
  if (!pendientes.length) { console.log('Nada que hacer: el catálogo no cambió.'); return; }

  const tokensEst = Math.ceil(pendientes.reduce((a, p) => a + textoDe(p).length, 0) / 4);
  console.log(`  ~${tokensEst} tokens ≈ $${(tokensEst / 1e6 * PRECIO_M).toFixed(4)}`);

  // El índice HNSW reconstruye el grafo en CADA insert. Con pocas filas da igual, pero en
  // una carga grande revienta el statement_timeout de Supabase (error 57014) a mitad de
  // camino, después de haberle pagado los embeddings a OpenAI. La anon key no puede hacer
  // DDL, así que no se puede automatizar: se avisa para no perder la corrida.
  if (pendientes.length > 500) {
    console.log(`\n  ⚠  ${pendientes.length} filas es una carga grande. Si existe el índice HNSW`);
    console.log('     esto va a fallar con "statement timeout" (57014) a mitad. Antes de seguir:');
    console.log('       drop index if exists idx_productos_embedding_hnsw;');
    console.log('     y al terminar recrearlo:');
    console.log('       create index idx_productos_embedding_hnsw on productos_embedding');
    console.log('         using hnsw (embedding extensions.vector_cosine_ops);\n');
  }
  if (DRY) { console.log('\n--dry: no se llamó a OpenAI ni se escribió nada.'); return; }

  let tokens = 0, escritos = 0;
  for (let i = 0; i < pendientes.length; i += LOTE) {
    const lote = pendientes.slice(i, i + LOTE);
    const { vectores, tokens: tk } = await embeber(lote.map(textoDe));
    tokens += tk;

    const filas = lote.map((p, k) => ({
      codigo_interno: p.codigo_interno,
      descripcion: p.descripcion,
      hash_desc: hashDe(textoDe(p)),
      embedding: JSON.stringify(vectores[k]),   // pgvector acepta el literal '[1,2,3]'
      modelo: MODELO,
      actualizado_en: new Date().toISOString(),
    }));

    for (let j = 0; j < filas.length; j += LOTE_ESCRITURA) {
      const trozo = filas.slice(j, j + LOTE_ESCRITURA);
      let ok = false, ultimo = '';
      // Reintento con espera creciente: el timeout de Supabase es transitorio, no
      // tiene sentido perder los embeddings ya pagados a OpenAI por un pico de carga.
      for (let intento = 1; intento <= 4 && !ok; intento++) {
        const r = await fetch(`${SB}/rest/v1/productos_embedding?on_conflict=codigo_interno`, {
          method: 'POST',
          headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(trozo),
        });
        if (r.ok) { ok = true; break; }
        ultimo = `${r.status} ${(await r.text()).slice(0, 200)}`;
        await new Promise(res => setTimeout(res, 500 * intento));
      }
      if (!ok) throw new Error(`UPSERT (tras 4 intentos) -> ${ultimo}`);
      escritos += trozo.length;
      process.stdout.write(`\r  embebidos ${escritos}/${pendientes.length}`);
    }
  }

  console.log(`\n\nOK — ${escritos} productos embebidos.`);
  console.log(`tokens: ${tokens} | costo real: $${(tokens / 1e6 * PRECIO_M).toFixed(4)}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
