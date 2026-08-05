// Genera el DICCIONARIO DEL CATÁLOGO: como el cliente nombra las cosas -> como las
// nombra el catálogo. Luna lee los 7.5k productos agrupados por categoría y produce
// coloquialismos venezolanos, errores de escritura, marcas usadas como genérico, etc.
// El resultado vive en Supabase (catalogo_vocabulario) y lo consume buscar_productos.
//
//   node scripts/generar_vocabulario.js            # incremental: solo categorías nuevas/cambiadas
//   node scripts/generar_vocabulario.js --full     # regenera TODO el catálogo
//   node scripts/generar_vocabulario.js --dry      # no escribe nada, muestra qué haría
//   node scripts/generar_vocabulario.js --cat cemento,lamina   # solo esas categorías
//
// GUARDA CRÍTICA: un diccionario mal generado ROMPE búsquedas que hoy funcionan.
// Por eso todo par (termino -> canonico) se valida contra el catálogo real antes de
// escribirse, y se rechaza si el término ya es encontrable por sí mismo.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'lib', 'serrucho-search.js'));
const norm = L.norm;
const SIN_HARDCODE = L.SIN;

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1].trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const OR_KEY = pick('OPENROUTER_API_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const args = process.argv.slice(2);
const FULL = args.includes('--full');
const DRY = args.includes('--dry');
const SOLO = (args.includes('--cat') ? (args[args.indexOf('--cat') + 1] || '') : '').split(',').filter(Boolean).map(norm);

const MODELO = 'openai/gpt-5.6-luna';
const CATS_POR_LOTE = 8;      // categorías por llamada al LLM
const MUESTRAS_POR_CAT = 14;  // descripciones de ejemplo por categoría
const CONCURRENCIA = 4;

// ---------------------------------------------------------------- Supabase
async function sbGet(pathq) {
  const r = await fetch(`${SB}/rest/v1/${pathq}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${pathq} -> ${r.status} ${await r.text()}`);
  return r.json();
}
async function sbUpsert(tabla, filas, onConflict) {
  if (!filas.length) return;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const r = await fetch(`${SB}/rest/v1/${tabla}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`UPSERT ${tabla} -> ${r.status} ${await r.text()}`);
  }
}

async function traerProductos() {
  const out = [];
  for (let desde = 0; ; desde += 1000) {
    const p = await sbGet(`productos?select=codigo_interno,descripcion&order=codigo_interno.asc&offset=${desde}&limit=1000`);
    out.push(...p);
    if (p.length < 1000) break;
  }
  return out.filter(p => p.descripcion);
}

// ---------------------------------------------------------------- LLM
const ESQUEMA = {
  type: 'object',
  properties: {
    categorias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          categoria: { type: 'string' },
          terminos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                termino: { type: 'string', description: 'Como lo dice el cliente' },
                canonico: { type: 'string', description: 'Palabra(s) que SÍ aparecen en las descripciones dadas' },
                confianza: { type: 'integer', description: '1 a 5' },
              },
              required: ['termino', 'canonico', 'confianza'],
              additionalProperties: false,
            },
          },
        },
        required: ['categoria', 'terminos'],
        additionalProperties: false,
      },
    },
  },
  required: ['categorias'],
  additionalProperties: false,
};

const INSTRUCCIONES = `Eres un ferretero veterano de Falcón/Zulia, Venezuela. Conoces cómo habla la gente del pueblo: albañiles, herreros, plomeros, amas de casa, gente mayor que escribe con faltas.

Te doy CATEGORÍAS del catálogo real de una ferretería con ejemplos de descripciones tal como están escritas en el sistema.

Tu trabajo: por cada categoría, listar TODAS las formas en que un cliente venezolano podría pedir ese producto por WhatsApp y que NO coincidan literalmente con la descripción del catálogo.

Incluye:
- Coloquialismos y regionalismos ("lavaplatos" por fregadero, "riel" por tubo de herrería, "pipote" por tanque, "tela pollera" por malla de gallinero).
- Errores de escritura y fonéticos frecuentes ("sinz"/"zing" por zinc, "simento" por cemento, "cielo razo" por cielo raso).
- Marcas o modelos usados como genérico.
- Nombres del oficio vs nombres del catálogo ("hoyadora" por el motor de hacer huecos).
- Perífrasis: cómo lo describe quien no sabe el nombre ("lo que se le echa a la pared para tapar huecos").
- Singular/plural y diminutivos cuando cambien la raíz.

REGLAS DURAS:
1. "canonico" debe estar formado ÚNICAMENTE por palabras que aparecen LITERALMENTE en las descripciones que te doy. Si no puedes, no inventes: omite el término.
2. NO generes un "termino" que ya aparezca literal en las descripciones dadas: eso ya se encuentra solo y mapearlo rompería la búsqueda.
3. "termino" en minúsculas, sin acentos, sin signos.
4. Nada de medidas, calibres ni números: de eso se encarga otra parte del motor.
5. Prefiere calidad sobre cantidad. confianza 5 = segurísimo; 3 = plausible; no bajes de 3.`;

async function pedirLote(lote) {
  const texto = lote.map(c =>
    `### Categoría: ${c.categoria} (${c.total} productos)\n` +
    c.muestras.map(d => '- ' + d).join('\n')
  ).join('\n\n');

  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.4,
      messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: texto }],
      response_format: { type: 'json_schema', json_schema: { name: 'vocabulario', strict: true, schema: ESQUEMA } },
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 250));
  return { datos: JSON.parse(j.choices[0].message.content), uso: j.usage };
}

// ---------------------------------------------------------------- main
(async () => {
  if (!ANON || !OR_KEY) throw new Error('faltan SUPABASE_ANON_KEY u OPENROUTER_API_KEY en .env');

  console.log('Leyendo catálogo…');
  const productos = await traerProductos();
  console.log(`  ${productos.length} productos`);

  // Vocabulario del catálogo: TODA palabra que aparece en alguna descripción.
  // Es la vara con la que validamos: canonico debe existir aquí, termino NO.
  const palabrasCatalogo = new Set();
  for (const p of productos) for (const w of norm(p.descripcion).split(' ')) if (w.length > 2) palabrasCatalogo.add(w);
  console.log(`  ${palabrasCatalogo.size} palabras distintas en descripciones`);

  // Agrupar por categoría = primera palabra de la descripción
  const porCat = new Map();
  for (const p of productos) {
    const c = norm(p.descripcion).split(' ')[0];
    if (!c || c.length < 3) continue;
    if (!porCat.has(c)) porCat.set(c, []);
    porCat.get(c).push(p);
  }

  const hashDe = ps => crypto.createHash('md5')
    .update(ps.map(p => p.codigo_interno + '|' + p.descripcion).sort().join('\n')).digest('hex');

  const previos = new Map((await sbGet('catalogo_vocab_categorias?select=categoria,hash_categoria'))
    .map(r => [r.categoria, r.hash_categoria]));

  let categorias = [...porCat.entries()].map(([categoria, ps]) => ({
    categoria,
    total: ps.length,
    hash: hashDe(ps),
    muestras: ps.slice(0, MUESTRAS_POR_CAT).map(p => p.descripcion),
  }));
  categorias.sort((a, b) => b.total - a.total);

  const todas = categorias.length;
  if (SOLO.length) categorias = categorias.filter(c => SOLO.includes(c.categoria));
  else if (!FULL) categorias = categorias.filter(c => previos.get(c.categoria) !== c.hash);

  console.log(`  ${todas} categorías | a procesar: ${categorias.length}${FULL ? ' (--full)' : ' (nuevas o cambiadas)'}`);
  if (!categorias.length) { console.log('Nada que hacer: el catálogo no cambió.'); return; }

  // ------------------------------------------------ lotes con concurrencia
  const lotes = [];
  for (let i = 0; i < categorias.length; i += CATS_POR_LOTE) lotes.push(categorias.slice(i, i + CATS_POR_LOTE));

  const aceptados = [], rechazos = { yaEncontrable: 0, canonicoInexistente: 0, identidad: 0, chocaSIN: 0, dup: 0 };
  const vistos = new Set();
  // Solo se marca como procesada la categoría cuyo lote respondió bien: si un lote
  // falla, sus categorías quedan sin hash y la próxima corrida las reintenta.
  const okCategorias = new Set();
  let tIn = 0, tOut = 0, hechos = 0, lotesFallidos = 0;

  async function procesar(lote) {
    let datos;
    try { const r = await pedirLote(lote); datos = r.datos; tIn += r.uso.prompt_tokens; tOut += r.uso.completion_tokens; }
    catch (e) { lotesFallidos++; console.log(`\n  ✗ lote [${lote.map(c => c.categoria).join(',')}]: ${e.message}`); return; }
    for (const c of lote) okCategorias.add(c.categoria);

    for (const cat of datos.categorias || []) {
      // Palabras de ESTA categoría: canonico debe salir de aquí, no de todo el catálogo.
      const propia = lote.find(c => norm(c.categoria) === norm(cat.categoria));
      const palabrasCat = new Set();
      if (propia) for (const d of propia.muestras) for (const w of norm(d).split(' ')) if (w.length > 2) palabrasCat.add(w);

      for (const t of cat.terminos || []) {
        const termino = norm(t.termino || ''), canonico = norm(t.canonico || '');
        if (!termino || !canonico) continue;
        if (termino === canonico) { rechazos.identidad++; continue; }
        if (vistos.has(termino)) { rechazos.dup++; continue; }
        // no pisar el mapa SIN afinado a mano
        if (SIN_HARDCODE[termino] !== undefined) { rechazos.chocaSIN++; continue; }
        // el término NO debe ser ya encontrable por sí solo
        if (termino.split(' ').every(w => palabrasCatalogo.has(w))) { rechazos.yaEncontrable++; continue; }
        // el canónico SÍ debe existir en el catálogo, y en esta categoría
        const okCanon = canonico.split(' ').every(w => palabrasCatalogo.has(w)) &&
          canonico.split(' ').some(w => palabrasCat.has(w));
        if (!okCanon) { rechazos.canonicoInexistente++; continue; }

        vistos.add(termino);
        aceptados.push({
          termino, canonico,
          categoria: propia ? propia.categoria : norm(cat.categoria),
          origen: 'llm_catalogo',
          confianza: Math.min(5, Math.max(3, t.confianza || 3)),
        });
      }
    }
    hechos++;
    process.stdout.write(`\r  lotes ${hechos}/${lotes.length} | términos aceptados: ${aceptados.length}   `);
  }

  for (let i = 0; i < lotes.length; i += CONCURRENCIA) {
    await Promise.all(lotes.slice(i, i + CONCURRENCIA).map(procesar));
  }
  console.log('');

  console.log(`\nACEPTADOS: ${aceptados.length}`);
  console.log(`RECHAZADOS -> ya encontrable: ${rechazos.yaEncontrable} | canónico inexistente: ${rechazos.canonicoInexistente} | choca con SIN: ${rechazos.chocaSIN} | duplicado: ${rechazos.dup} | identidad: ${rechazos.identidad}`);
  const costo = tIn / 1e6 * 0.10 + tOut / 1e6 * 0.60;
  console.log(`LLM: in ${tIn} / out ${tOut} | costo ${costo.toFixed(4)} USD`);

  console.log('\nMuestra de lo aceptado:');
  for (const a of aceptados.slice(0, 25)) console.log(`  "${a.termino}" -> "${a.canonico}"  [${a.categoria}, conf ${a.confianza}]`);

  if (DRY) { console.log('\n--dry: no se escribió nada.'); return; }

  if (lotesFallidos) console.log(`\nAVISO: ${lotesFallidos} lote(s) fallaron; esas categorías quedan sin marcar y se reintentan en la próxima corrida.`);

  await sbUpsert('catalogo_vocabulario', aceptados, 'termino');
  await sbUpsert('catalogo_vocab_categorias', categorias.filter(c => okCategorias.has(c.categoria)).map(c => ({
    categoria: c.categoria, hash_categoria: c.hash, productos: c.total,
    terminos: aceptados.filter(a => a.categoria === c.categoria).length,
    procesado_en: new Date().toISOString(),
  })), 'categoria');

  await fetch(`${SB}/rest/v1/catalogo_vocab_estado?id=eq.1`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      productos_contados: productos.length,
      terminos_generados: aceptados.length,
      ultima_corrida: new Date().toISOString(),
      ultimo_error: null,
    }),
  });

  console.log(`\nOK — ${aceptados.length} términos escritos en catalogo_vocabulario.`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
