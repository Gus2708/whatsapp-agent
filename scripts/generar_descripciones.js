// Genera con Luna (OpenRouter) una descripción en lenguaje natural de QUÉ ES y PARA QUÉ
// SIRVE cada producto, y la guarda en producto_descripcion. Luego generar_embeddings.js la
// incorpora al texto que se embebe.
//
// Solo para productos CON VENTA RECIENTE: no tiene sentido pagar por inventario olvidado.
// Con --dias 365 son ~3.7k productos de los 7.5k del catálogo.
//
//   node scripts/generar_descripciones.js --piloto 40   # prueba de calidad y costo
//   node scripts/generar_descripciones.js               # todos los vendidos en 365 días
//   node scripts/generar_descripciones.js --dias 90     # solo los de venta muy reciente
//
// Incremental: si la descripción original no cambió, no se regenera.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const progreso = require('./_progreso.js');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const OR_KEY = pick('OPENROUTER_API_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const MODELO = 'openai/gpt-5.6-luna';
const POR_LOTE = 20;      // productos por llamada
const CONCURRENCIA = 4;
const arg = f => { const i = process.argv.indexOf(f); return i === -1 ? null : process.argv[i + 1]; };
const PILOTO = Number(arg('--piloto')) || 0;
const DIAS = Number(arg('--dias')) || 365;

const ESQUEMA = {
  type: 'object',
  properties: {
    productos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: { type: 'string' },
          descripcion: { type: 'string', description: 'Qué es y para qué sirve, 1-2 frases' },
        },
        required: ['codigo', 'descripcion'],
        additionalProperties: false,
      },
    },
  },
  required: ['productos'],
  additionalProperties: false,
};

const SISTEMA = `Eres un ferretero veterano venezolano. Te doy productos del catálogo con su código y su nombre tal como está escrito en el sistema (cadenas cortas, con abreviaturas).

Por cada uno escribe UNA O DOS FRASES diciendo QUÉ ES y PARA QUÉ SIRVE, en español natural de Venezuela.

REGLAS:
- Empieza por el tipo de producto. Ej: "Disco de corte fino para amoladora, se usa para cortar metal y cabilla."
- Menciona el OFICIO o la tarea en que se usa (albañilería, herrería, plomería, electricidad, carpintería).
- Si el nombre trae una abreviatura, desarróllala ("C/METAL" = para metal, "P/EMP" = de empotrar).
- NO inventes marcas, medidas ni materiales que no estén en el nombre.
- NO repitas el nombre tal cual: aporta el significado que el nombre NO dice.
- Sin precios, sin disponibilidad, sin adornos comerciales.
- Devuelve el MISMO código que te doy, sin cambiarlo.`;

async function sbGet(q) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${q} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function pedir(lote) {
  const texto = lote.map(p => `${p.codigo_interno} | ${p.descripcion}`).join('\n');
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELO, temperature: 0.3,
      messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: texto }],
      response_format: { type: 'json_schema', json_schema: { name: 'descripciones', strict: true, schema: ESQUEMA } },
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
  return { datos: JSON.parse(j.choices[0].message.content), uso: j.usage };
}

(async () => {
  if (!OR_KEY) throw new Error('falta OPENROUTER_API_KEY en .env');

  // productos con venta reciente, los más vendidos primero (si el piloto corta, corta por lo importante)
  // Paginado: PostgREST corta a 1000 filas por petición. Sin esto el script veía solo los
  // 1000 mejores y recortaba en silencio los otros ~2.700 con venta reciente.
  const pop = [];
  for (let off = 0; ; off += 1000) {
    const p = await sbGet(`producto_popularidad?select=codigo_interno,score&order=score.desc&offset=${off}&limit=1000`);
    pop.push(...p);
    if (p.length < 1000) break;
  }
  const recientes = new Map(pop.map(p => [p.codigo_interno, p.score]));

  const todos = [];
  for (let off = 0; ; off += 1000) {
    const p = await sbGet(`productos?select=codigo_interno,descripcion&order=codigo_interno.asc&offset=${off}&limit=1000`);
    todos.push(...p);
    if (p.length < 1000) break;
  }

  const previas = new Map((await sbGet('producto_descripcion?select=codigo_interno,hash_origen&limit=20000'))
    .map(r => [r.codigo_interno, r.hash_origen]));
  const hashDe = t => crypto.createHash('md5').update(t).digest('hex');

  // Solo los vendidos DENTRO de la ventana: producto_popularidad incluye cualquier producto
  // con alguna venta en la historia, así que sin este filtro pagábamos por inventario
  // olvidado, que es justo lo que se quería evitar.
  const frescos = new Set(
    (await sbGet(`producto_popularidad?select=codigo_interno&ultima_venta=gte.${new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10)}&limit=1000&offset=0`)).map(r => r.codigo_interno)
  );
  for (let off = 1000; ; off += 1000) {
    const p = await sbGet(`producto_popularidad?select=codigo_interno&ultima_venta=gte.${new Date(Date.now() - DIAS * 864e5).toISOString().slice(0, 10)}&limit=1000&offset=${off}`);
    for (const r of p) frescos.add(r.codigo_interno);
    if (p.length < 1000) break;
  }
  console.log(`  vendidos en ${DIAS} días: ${frescos.size}`);

  let objetivo = todos
    .filter(p => p.descripcion && frescos.has(p.codigo_interno))
    .filter(p => previas.get(p.codigo_interno) !== hashDe(p.descripcion.trim()))
    .sort((a, b) => (recientes.get(b.codigo_interno) || 0) - (recientes.get(a.codigo_interno) || 0));

  console.log(`catálogo ${todos.length} | con venta reciente ${recientes.size} | pendientes ${objetivo.length}`);
  if (PILOTO) { objetivo = objetivo.slice(0, PILOTO); console.log(`PILOTO: solo los ${objetivo.length} más vendidos`); }
  if (!objetivo.length) { console.log('Nada que hacer.'); return; }

  const lotes = [];
  for (let i = 0; i < objetivo.length; i += POR_LOTE) lotes.push(objetivo.slice(i, i + POR_LOTE));

  const filas = []; const vistos = new Set(); let tIn = 0, tOut = 0, fallos = 0, hechos = 0;
  const P = progreso(objetivo.length, { etiqueta: `describiendo` });
  const porCodigo = new Map(objetivo.map(p => [p.codigo_interno, p.descripcion]));

  async function procesar(lote) {
    let r;
    try { r = await pedir(lote); } catch (e) { fallos++; console.log(`\n  ✗ ${e.message}`); return; }
    tIn += r.uso.prompt_tokens; tOut += r.uso.completion_tokens;
    // Dedup por código: el modelo puede repetir un código entre lotes, y PostgREST rechaza
    // el INSERT entero (error 21000) si hay duplicados en el mismo comando.
    const nuevas = [];
    for (const d of (r.datos.productos || [])) {
      const orig = porCodigo.get(d.codigo);
      if (!orig || !d.descripcion) continue;   // código inventado por el modelo -> se descarta
      if (vistos.has(d.codigo)) continue;
      vistos.add(d.codigo);
      nuevas.push({
        codigo_interno: d.codigo,
        descripcion_ia: d.descripcion.trim().slice(0, 500),
        hash_origen: hashDe(orig.trim()),
        modelo: MODELO,
      });
    }
    // Se guarda POR LOTE, no al final: la primera versión perdió 4.638 descripciones ya
    // pagadas a OpenRouter porque el único upsert, al final, falló entero.
    if (nuevas.length) {
      try {
        const w = await fetch(`${SB}/rest/v1/producto_descripcion?on_conflict=codigo_interno`, {
          method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(nuevas),
        });
        if (!w.ok) { fallos++; console.log(`\n  ✗ upsert: ${w.status} ${(await w.text()).slice(0, 120)}`); }
        else filas.push(...nuevas);
      } catch (e) { fallos++; }
    }
    hechos++;
    P.avance(filas.length, { extra: `${hechos}/${lotes.length} lotes` });
  }

  for (let i = 0; i < lotes.length; i += CONCURRENCIA) {
    await Promise.all(lotes.slice(i, i + CONCURRENCIA).map(procesar));
  }
  console.log('');


  const costo = tIn / 1e6 * 0.10 + tOut / 1e6 * 0.60;
  P.fin(`${filas.length.toLocaleString('es-VE')} descripciones guardadas${fallos ? ` · ${fallos} lote(s) fallaron` : ''} · $${costo.toFixed(4)}`);
  console.log(`in ${tIn} / out ${tOut} | costo ${costo.toFixed(4)} USD`);
  if (PILOTO) console.log(`\nExtrapolado a los ${recientes.size} con venta reciente: ~$${(costo / filas.length * recientes.size).toFixed(2)}`);
  console.log('\nMuestra:');
  for (const f of filas.slice(0, 6)) console.log(`  ${porCodigo.get(f.codigo_interno)}\n    -> ${f.descripcion_ia}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
