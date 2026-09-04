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
const progreso = require('./_progreso.js');
const norm = require(require('path').join(__dirname, '..', 'lib', 'serrucho-search.js')).norm;

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();

const SB = pick('SUPABASE_URL') || pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
// .env manda, pero se acepta la variable de entorno para probar sin tocar el archivo
const OAI = pick('OPENAI_API_KEY') || (process.env.OPENAI_API_KEY || '').trim();
const OR = pick('OPENROUTER_API_KEY') || (process.env.OPENROUTER_API_KEY || '').trim();
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
const REHASH = process.argv.includes('--rehash');

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
// v3: se añade la descripción en lenguaje natural generada por Luna
// (producto_descripcion, solo para lo vendido en 365 días). Es lo que dice QUÉ ES y PARA
// QUÉ SIRVE, que es justo lo que una cadena de SKU no dice y lo que el cliente describe
// cuando no sabe el nombre técnico.
let VOCAB_POR_CAT = new Map();
let DESC_IA = new Map();
function textoDe(p) {
  const desc = p.descripcion.trim();
  const cat = norm(desc).split(' ')[0];
  const sinon = (VOCAB_POR_CAT.get(cat) || []).slice(0, 12);
  const ia = DESC_IA.get(p.codigo_interno);
  let t = desc;
  if (ia) t += ' | ' + ia;
  if (cat) t += ' | categoria: ' + cat;
  if (sinon.length) t += ' | como lo pide el cliente: ' + sinon.join(', ');
  return t;
}
const hashDe = t => crypto.createHash('md5').update(t).digest('hex');

let proveedorActivo = OAI ? 'OpenAI' : 'OpenRouter';
async function embeber(textos) {
  if (OAI && proveedorActivo === 'OpenAI') {
    try {
      const r = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OAI}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: MODELO, input: textos, dimensions: DIMS }),
      });
      const j = await r.json();
      if (r.ok && !j.error) {
        return { vectores: j.data.map(d => d.embedding), tokens: j.usage.total_tokens };
      }
      const esGeo = r.status === 403 && /country|region|territory/i.test(JSON.stringify(j));
      if (OR && (esGeo || r.status >= 400)) {
        console.log(`\n  \x1b[38;2;224;175;104m▲\x1b[0m OpenAI no disponible (${esGeo ? 'bloqueo geográfico' : `HTTP ${r.status}`}). Conmutando automáticamente a OpenRouter...`);
        proveedorActivo = 'OpenRouter';
      } else {
        throw new Error(`OpenAI ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
      }
    } catch (err) {
      if (OR) {
        console.log(`\n  \x1b[38;2;224;175;104m▲\x1b[0m OpenAI error: ${err.message}. Conmutando automáticamente a OpenRouter...`);
        proveedorActivo = 'OpenRouter';
      } else {
        throw err;
      }
    }
  }

  if (OR && proveedorActivo === 'OpenRouter') {
    const r = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OR}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELO, input: textos, dimensions: DIMS }),
    });
    const j = await r.json();
    if (!r.ok || j.error) throw new Error(`OpenRouter ${r.status}: ${JSON.stringify(j.error || j).slice(0, 300)}`);
    return { vectores: j.data.map(d => d.embedding), tokens: (j.usage && j.usage.total_tokens) || (textos.length * 25) };
  }

  throw new Error('No hay proveedor de embeddings funcional (falta OPENAI_API_KEY u OPENROUTER_API_KEY)');
}

(async () => {
  if (!OAI && !OR) throw new Error('falta OPENAI_API_KEY u OPENROUTER_API_KEY en .env');
  if (!ANON) throw new Error('falta SUPABASE_ANON_KEY en .env');

  const c = {
    dim: s => `\x1b[2m${s}\x1b[0m`,
    bold: s => `\x1b[1m${s}\x1b[0m`,
    claude: s => `\x1b[38;2;205;105;74m${s}\x1b[0m`,
    cyan: s => `\x1b[38;2;125;207;255m${s}\x1b[0m`,
    ok: s => `\x1b[38;2;78;169;111m${s}\x1b[0m`,
    err: s => `\x1b[38;2;247;118;142m${s}\x1b[0m`,
    warn: s => `\x1b[38;2;224;175;104m${s}\x1b[0m`,
    gray: s => `\x1b[38;2;139;143;163m${s}\x1b[0m`,
    darkGray: s => `\x1b[38;2;86;95;137m${s}\x1b[0m`,
    num: s => `\x1b[38;2;192;202;245m${s}\x1b[0m`,
  };

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('GENERADOR DE EMBEDDINGS')) + c.darkGray(' · ') + c.gray('text-embedding-3-small'));
  console.log(' ' + c.darkGray('─'.repeat(60)));
  process.stdout.write('  ' + c.darkGray('▸ ') + c.gray('Leyendo catálogo…\r'));
  const productos = (await traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'))
    .filter(p => p.descripcion && p.descripcion.trim());
  console.log('  ' + c.ok('⏺') + ' ' + c.bold(c.num(productos.length.toLocaleString('es-VE'))) + c.gray(' productos en catálogo'));

  // diccionario coloquial agrupado por categoría, para enriquecer el texto a embeber
  const vocab = await traerTodo('catalogo_vocabulario', 'termino,categoria&activo=eq.true', 'categoria.asc');
  for (const v of vocab) {
    if (!v.categoria) continue;
    if (!VOCAB_POR_CAT.has(v.categoria)) VOCAB_POR_CAT.set(v.categoria, []);
    VOCAB_POR_CAT.get(v.categoria).push(v.termino);
  }
  console.log('  ' + c.ok('⏺') + ' ' + c.bold(c.num(vocab.length.toLocaleString('es-VE'))) + c.gray(` términos coloquiales en ${VOCAB_POR_CAT.size} categorías`));

  // descripciones generadas por Luna (paginado: PostgREST corta a 1000)
  for (let off = 0; ; off += 1000) {
    const d = await sbGet(`producto_descripcion?select=codigo_interno,descripcion_ia&offset=${off}&limit=1000`);
    for (const x of d) DESC_IA.set(x.codigo_interno, x.descripcion_ia);
    if (d.length < 1000) break;
  }
  console.log('  ' + c.ok('⏺') + ' ' + c.bold(c.num(DESC_IA.size.toLocaleString('es-VE'))) + c.gray(' descripciones en lenguaje natural'));

  const previos = new Map(
    (await traerTodo('productos_embedding', 'codigo_interno,hash_desc', 'codigo_interno.asc'))
      .map(r => [r.codigo_interno, r.hash_desc])
  );
  console.log('  ' + c.ok('⏺') + ' ' + c.bold(c.num(previos.size.toLocaleString('es-VE'))) + c.gray(' ya embebidos'));

  const sinVector = productos.filter(p => !previos.has(p.codigo_interno));
  const descCambiada = productos.filter(p => {
    const prevHash = previos.get(p.codigo_interno);
    return prevHash && prevHash !== hashDe(textoDe(p));
  });

  let pendientes;
  if (FULL) {
    pendientes = productos;
    console.log('  ' + c.claude('❯') + ' ' + c.bold(c.cyan(`${pendientes.length.toLocaleString('es-VE')}`)) + c.gray(' a embeber (--full: catálogo completo)'));
  } else if (REHASH) {
    pendientes = productos.filter(p => previos.get(p.codigo_interno) !== hashDe(textoDe(p)));
    console.log('  ' + c.claude('❯') + ' ' + c.bold(c.cyan(`${pendientes.length.toLocaleString('es-VE')}`)) + c.gray(' a embeber (--rehash: enriquecimiento modificado)'));
  } else {
    // Modo automático e incremental para ejecuciones nocturnas:
    // Prioriza productos sin vector y descripciones modificadas en catálogo.
    if (sinVector.length > 0) {
      pendientes = sinVector;
      console.log('  ' + c.claude('❯') + ' ' + c.bold(c.cyan(`${pendientes.length.toLocaleString('es-VE')}`)) + c.gray(` productos nuevos SIN vector a embeber`));
    } else if (descCambiada.length > 0 && descCambiada.length <= 500) {
      pendientes = descCambiada;
      console.log('  ' + c.claude('❯') + ' ' + c.bold(c.cyan(`${pendientes.length.toLocaleString('es-VE')}`)) + c.gray(` productos con descripción modificada a embeber`));
    } else {
      pendientes = [];
    }
  }

  if (!pendientes.length) { console.log('\n ' + c.ok('▎') + ' ' + c.bold(c.ok('Nada que hacer: el catálogo no cambió.')) + '\n'); return; }

  const tokensEst = Math.ceil(pendientes.reduce((a, p) => a + textoDe(p).length, 0) / 4);
  console.log('    ' + c.darkGray('⎿') + ' ' + c.darkGray(`~${tokensEst.toLocaleString('es-VE')} tokens ≈ $${(tokensEst / 1e6 * PRECIO_M).toFixed(4)} USD`));

  if (pendientes.length > 500) {
    console.log('\n  ' + c.warn('▲') + ' ' + c.bold(c.warn(`${pendientes.length.toLocaleString('es-VE')} filas es una carga grande.`)) + c.gray(' Si existe el índice HNSW'));
    console.log('    ' + c.darkGray('esto va a fallar con "statement timeout" (57014) a mitad. Antes de seguir:'));
    console.log('      ' + c.cyan('drop index if exists idx_productos_embedding_hnsw;'));
    console.log('    ' + c.darkGray('y al terminar recrearlo:'));
    console.log('      ' + c.cyan('create index idx_productos_embedding_hnsw on productos_embedding'));
    console.log('      ' + c.cyan('  using hnsw (embedding extensions.vector_cosine_ops);\n'));
  }
  if (DRY) { console.log('\n ' + c.darkGray('--dry: no se llamó a OpenAI ni se escribió nada.') + '\n'); return; }

  let tokens = 0, escritos = 0;
  const P = progreso(pendientes.length, { etiqueta: `embebiendo` });
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
      if (!ok) { P.fin(); throw new Error(`UPSERT (tras 4 intentos) -> ${ultimo}`); }
      escritos += trozo.length;
      P.avance(escritos, { extra: `$${(tokens / 1e6 * PRECIO_M).toFixed(4)}` });
    }
  }

  P.fin(`${escritos.toLocaleString('es-VE')} productos embebidos · $${(tokens / 1e6 * PRECIO_M).toFixed(4)}`);
})().catch(e => { console.error('\nERROR', e.message); process.exit(1); });
