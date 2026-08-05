// Crea (o actualiza) el workflow "Sync Vocabulario Catálogo" en n8n: un Schedule
// Trigger nocturno + un Code node que detecta por HASH qué categorías del catálogo
// cambiaron y regenera SOLO el vocabulario de esas, escribiéndolo en Supabase.
//
// Va en un workflow APARTE del flujo de mensajes a propósito: así no le suma ni un
// milisegundo de latencia a ningún cliente de WhatsApp.
//
//   node scripts/crear_workflow_vocabulario.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const ANON = (env.match(/^SUPABASE_ANON_KEY=(.+)$/m) || [])[1].trim();
const SBURL = ((env.match(/^SUPABASE_URL=(.+)$/m) || [])[1] || 'https://rgniqjfooifchyctnbzu.supabase.co').trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

const NOMBRE = 'Sync Vocabulario Catálogo';

// El cuerpo del Code node. Mismo hash (md5) y mismas guardas que
// scripts/generar_vocabulario.js, para que script y n8n no se peleen.
const CODIGO = `// Sync incremental del diccionario del catálogo.
// Detecta por hash md5 qué CATEGORÍAS cambiaron (producto nuevo, descripción editada)
// y le pide a Luna el vocabulario coloquial SOLO de esas. Tope por corrida para que
// una noche mala no se coma el presupuesto ni el tiempo de ejecución: lo que no entra
// se procesa en la corrida siguiente (y se reporta, no se descarta en silencio).
const axios = require('axios');
const crypto = require('crypto');

const SB = '${SBURL}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const OR_KEY = $env.OPENROUTER_API_KEY;
const MODELO = 'openai/gpt-5.6-luna';
const MAX_CATEGORIAS = 40;   // tope por corrida
const CATS_POR_LOTE = 8;
const MUESTRAS = 14;

function norm(t){ return String(t).toLowerCase().replace(/(\\d)\\s*,\\s*(\\d)/g,'$1.$2').replace(/[×✕✖]/g,'x').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9 .\\/-]/g,' ').replace(/\\s+/g,' ').trim(); }

const INSTRUCCIONES = \`Eres un ferretero veterano de Falcón/Zulia, Venezuela. Conoces cómo habla la gente del pueblo.
Te doy CATEGORÍAS del catálogo real con ejemplos de descripciones tal como están en el sistema.
Lista TODAS las formas en que un cliente venezolano pediría ese producto por WhatsApp y que NO coincidan literalmente con la descripción: coloquialismos, regionalismos, errores de escritura, marcas usadas como genérico, nombres del oficio, y perífrasis de quien no sabe el nombre.
REGLAS DURAS:
1. "canonico" debe estar formado SOLO por palabras que aparecen LITERALMENTE en las descripciones dadas. Si no puedes, omite el término.
2. NO generes un "termino" que ya aparezca literal en las descripciones: eso ya se encuentra solo.
3. "termino" en minúsculas, sin acentos ni signos.
4. Nada de medidas, calibres ni números.
5. Calidad sobre cantidad. confianza 5 = segurísimo, 3 = plausible; no bajes de 3.
Responde SOLO un JSON: {"categorias":[{"categoria":"...","terminos":[{"termino":"...","canonico":"...","confianza":4}]}]}\`;

// ---- 1. catálogo completo
let productos = [];
for (let off = 0; ; off += 1000) {
  const r = await axios.get(SB + '/rest/v1/productos?select=codigo_interno,descripcion&order=codigo_interno.asc&offset=' + off + '&limit=1000', { headers: H });
  productos = productos.concat(r.data || []);
  if (!r.data || r.data.length < 1000) break;
}
productos = productos.filter(p => p.descripcion);

const palabrasCatalogo = new Set();
for (const p of productos) for (const w of norm(p.descripcion).split(' ')) if (w.length > 2) palabrasCatalogo.add(w);

// ---- 2. agrupar y hashear por categoría
const porCat = new Map();
for (const p of productos) {
  const c = norm(p.descripcion).split(' ')[0];
  if (!c || c.length < 3) continue;
  if (!porCat.has(c)) porCat.set(c, []);
  porCat.get(c).push(p);
}
const hashDe = ps => crypto.createHash('md5').update(ps.map(p => p.codigo_interno + '|' + p.descripcion).sort().join('\\n')).digest('hex');

const prevRes = await axios.get(SB + '/rest/v1/catalogo_vocab_categorias?select=categoria,hash_categoria&limit=5000', { headers: H });
const previos = new Map((prevRes.data || []).map(r => [r.categoria, r.hash_categoria]));

let pendientes = [];
for (const [categoria, ps] of porCat.entries()) {
  const hash = hashDe(ps);
  if (previos.get(categoria) === hash) continue;
  pendientes.push({ categoria, hash, total: ps.length, muestras: ps.slice(0, MUESTRAS).map(p => p.descripcion) });
}
pendientes.sort((a, b) => b.total - a.total);

const totalPendientes = pendientes.length;
if (!totalPendientes) {
  return [{ json: { ok: true, mensaje: 'catálogo sin cambios', categorias_pendientes: 0, terminos_nuevos: 0 } }];
}
const diferidas = Math.max(0, totalPendientes - MAX_CATEGORIAS);
pendientes = pendientes.slice(0, MAX_CATEGORIAS);

// ---- 3. pedirle el vocabulario a Luna, por lotes
const aceptados = [];
const okCats = new Set();
const vistos = new Set();
let tIn = 0, tOut = 0, fallos = 0;

for (let i = 0; i < pendientes.length; i += CATS_POR_LOTE) {
  const lote = pendientes.slice(i, i + CATS_POR_LOTE);
  const texto = lote.map(c => '### Categoría: ' + c.categoria + ' (' + c.total + ' productos)\\n' + c.muestras.map(d => '- ' + d).join('\\n')).join('\\n\\n');
  let datos;
  try {
    const rr = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: MODELO, temperature: 0.4,
      messages: [{ role: 'system', content: INSTRUCCIONES }, { role: 'user', content: texto }],
      response_format: { type: 'json_object' },
    }, { headers: { Authorization: 'Bearer ' + OR_KEY, 'Content-Type': 'application/json' } });
    if (rr.data.usage) { tIn += rr.data.usage.prompt_tokens || 0; tOut += rr.data.usage.completion_tokens || 0; }
    datos = JSON.parse(rr.data.choices[0].message.content);
  } catch (e) { fallos++; continue; }

  for (const c of lote) okCats.add(c.categoria);

  for (const cat of (datos.categorias || [])) {
    const propia = lote.find(c => norm(c.categoria) === norm(cat.categoria));
    const palabrasCat = new Set();
    if (propia) for (const d of propia.muestras) for (const w of norm(d).split(' ')) if (w.length > 2) palabrasCat.add(w);
    for (const t of (cat.terminos || [])) {
      const termino = norm(t.termino || ''), canonico = norm(t.canonico || '');
      if (!termino || !canonico || termino === canonico || vistos.has(termino)) continue;
      // el término no debe ser ya encontrable por sí solo
      if (termino.split(' ').every(w => palabrasCatalogo.has(w))) continue;
      // el canónico sí debe existir, y en esta categoría
      if (!canonico.split(' ').every(w => palabrasCatalogo.has(w))) continue;
      if (!canonico.split(' ').some(w => palabrasCat.has(w))) continue;
      vistos.add(termino);
      aceptados.push({ termino, canonico, categoria: propia ? propia.categoria : norm(cat.categoria), origen: 'llm_catalogo', confianza: Math.min(5, Math.max(3, t.confianza || 3)) });
    }
  }
}

// ---- 4. guardar
if (aceptados.length) {
  await axios.post(SB + '/rest/v1/catalogo_vocabulario?on_conflict=termino', aceptados,
    { headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) });
}
const marcar = pendientes.filter(c => okCats.has(c.categoria)).map(c => ({
  categoria: c.categoria, hash_categoria: c.hash, productos: c.total,
  terminos: aceptados.filter(a => a.categoria === c.categoria).length,
  procesado_en: new Date().toISOString(),
}));
if (marcar.length) {
  await axios.post(SB + '/rest/v1/catalogo_vocab_categorias?on_conflict=categoria', marcar,
    { headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) });
}
await axios.patch(SB + '/rest/v1/catalogo_vocab_estado?id=eq.1', {
  productos_contados: productos.length,
  terminos_generados: aceptados.length,
  ultima_corrida: new Date().toISOString(),
  ultimo_error: fallos ? (fallos + ' lote(s) fallaron') : null,
}, { headers: Object.assign({}, H, { Prefer: 'return=minimal' }) });

return [{ json: {
  ok: true,
  productos: productos.length,
  categorias_cambiadas: totalPendientes,
  categorias_procesadas: okCats.size,
  categorias_diferidas: diferidas,   // se toman en la próxima corrida
  terminos_nuevos: aceptados.length,
  lotes_fallidos: fallos,
  costo_usd: Number((tIn / 1e6 * 0.10 + tOut / 1e6 * 0.60).toFixed(4)),
} }];`;

const NODOS = [
  {
    id: 'vocab_schedule',
    name: 'Cada noche 3:00',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [260, 300],
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 3 * * *' }] } },
  },
  {
    id: 'vocab_sync',
    name: 'Sincronizar Vocabulario',
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [520, 300],
    parameters: { jsCode: CODIGO },
  },
];

const CONEXIONES = { 'Cada noche 3:00': { main: [[{ node: 'Sincronizar Vocabulario', type: 'main', index: 0 }]] } };

(async () => {
  const lista = await (await fetch(`${BASE}/workflows?limit=250`, { headers: H })).json();
  const existente = (lista.data || []).find(w => w.name === NOMBRE);

  const cuerpo = { name: NOMBRE, nodes: NODOS, connections: CONEXIONES, settings: { executionOrder: 'v1', executionTimeout: 1800 } };

  if (existente) {
    const put = await fetch(`${BASE}/workflows/${existente.id}`, { method: 'PUT', headers: H, body: JSON.stringify(cuerpo) });
    console.log('actualizado:', put.status, existente.id);
    if (!put.ok) { console.log(await put.text()); process.exit(1); }
    console.log(`OK — workflow "${NOMBRE}" actualizado (id ${existente.id}).`);
    console.log('Recuerda ACTIVARLO en n8n si aún no lo está.');
    return;
  }
  const post = await fetch(`${BASE}/workflows`, { method: 'POST', headers: H, body: JSON.stringify(cuerpo) });
  const j = await post.json();
  if (!post.ok) { console.log('ERROR', post.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  console.log(`OK — workflow "${NOMBRE}" creado (id ${j.id}). Actívalo en n8n para que corra cada noche.`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
