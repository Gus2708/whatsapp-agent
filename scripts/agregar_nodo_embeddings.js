// Convierte el tercer nodo del workflow "Sync Vocabulario Catálogo" en un MONITOR de la
// capa vectorial: detecta y avisa, no intenta embeber.
//
// POR QUÉ MONITOR Y NO TRABAJADOR (esto costó 20 días de fallo silencioso):
//   1. Escribir vectores con el índice HNSW presente revienta el statement_timeout de
//      Supabase (error 57014). El nodo NO puede quitar el índice: la anon key no hace DDL.
//   2. El nodo no puede calcular el hash del TEXTO ENRIQUECIDO que usa generar_embeddings.js
//      (descripción + descripción IA + categoría + sinónimos), así que veía el catálogo
//      entero como pendiente cada noche.
// Un job que no puede hacer su trabajo debe decirlo, no fingirlo. El embebido real lo hace
// scripts/generar_embeddings.js a mano, con drop/create del índice alrededor.
//
//   node scripts/agregar_nodo_embeddings.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const H = { 'X-N8N-API-KEY': pick('N8N_API_KEY'), 'Content-Type': 'application/json', accept: 'application/json' };
const SBURL = pick('SUPABASE_URL') || pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');

const NOMBRE = 'Sync Vocabulario Catálogo';
const NODO = 'Monitor Embeddings';
const NODO_VIEJO = 'Sync Embeddings';
const PREVIO = 'Sincronizar Vocabulario';
const SIGUIENTE = 'Refrescar Popularidad';

const CODIGO = `// MONITOR de la capa vectorial. Detecta desalineacion y avisa; NO embebe.
// El embebido real lo hace scripts/generar_embeddings.js a mano, porque escribir vectores
// con el indice HNSW presente revienta el statement_timeout y la anon key no puede quitarlo.
//
// Tres senales, todas calculables SIN replicar el enriquecimiento del texto:
//   A. productos SIN fila de embedding             -> invisibles para la busqueda semantica
//   B. descripcion cambiada desde que se embebio   -> vector desactualizado
//   C. vocabulario mas nuevo que los embeddings    -> el texto enriquecido cambio para todos
const axios = require('axios');
const SB = '${SBURL}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

async function traerTodo(tabla, select, orden){
  const out = [];
  for (let off = 0; ; off += 1000){
    const r = await axios.get(SB + '/rest/v1/' + tabla + '?select=' + select + '&order=' + orden + '&offset=' + off + '&limit=1000', { headers: H });
    const d = r.data || [];
    out.push.apply(out, d);
    if (d.length < 1000) break;
  }
  return out;
}

const productos = (await traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'))
  .filter(p => p.descripcion && p.descripcion.trim());
const emb = await traerTodo('productos_embedding', 'codigo_interno,descripcion,actualizado_en', 'codigo_interno.asc');
const porCodigo = new Map(emb.map(e => [e.codigo_interno, e]));

// A. sin vector: invisibles para la capa semantica
const sinVector = productos.filter(p => !porCodigo.has(p.codigo_interno));

// B. la descripcion cambio despues de embeberse. productos_embedding guarda la descripcion
//    con la que se genero el vector, asi que esto se detecta sin recalcular nada.
const descCambiada = productos.filter(p => {
  const e = porCodigo.get(p.codigo_interno);
  return e && String(e.descripcion || '').trim() !== p.descripcion.trim();
});

// C. el vocabulario se regenero despues del ultimo embedding: como el texto que se embebe
//    incluye los sinonimos de la categoria, eso invalida los vectores de TODO el catalogo.
let ultimoEmb = '';
for (const e of emb) if (e.actualizado_en > ultimoEmb) ultimoEmb = e.actualizado_en;
const vocabRows = await axios.get(SB + '/rest/v1/catalogo_vocab_categorias?select=procesado_en&order=procesado_en.desc&limit=1', { headers: H });
const ultimoVocab = (vocabRows.data && vocabRows.data[0] && vocabRows.data[0].procesado_en) || '';
const vocabMasNuevo = Boolean(ultimoVocab && ultimoEmb && ultimoVocab > ultimoEmb);

const diasSinEmbeber = ultimoEmb ? Math.floor((Date.now() - new Date(ultimoEmb).getTime()) / 86400000) : null;

const avisos = [];
if (sinVector.length) avisos.push(sinVector.length + ' producto(s) SIN vector: invisibles para la busqueda semantica');
if (descCambiada.length) avisos.push(descCambiada.length + ' producto(s) con la descripcion cambiada desde que se embebieron');
if (vocabMasNuevo) avisos.push('el vocabulario se actualizo DESPUES del ultimo embedding: el texto enriquecido cambio para todo el catalogo');

const sano = avisos.length === 0;
return [{ json: {
  ok: sano,
  estado: sano ? 'capa vectorial al dia' : 'REQUIERE ACCION MANUAL',
  avisos: avisos,
  accion: sano ? null
    : '1) drop index if exists idx_productos_embedding_hnsw;  ' +
      '2) node scripts/generar_embeddings.js  ' +
      '3) create index idx_productos_embedding_hnsw on productos_embedding using hnsw (embedding extensions.vector_cosine_ops);',
  productos: productos.length,
  embebidos: emb.length,
  sin_vector: sinVector.length,
  descripcion_cambiada: descCambiada.length,
  vocabulario_mas_nuevo_que_embeddings: vocabMasNuevo,
  dias_desde_ultimo_embedding: diasSinEmbeber,
  ejemplos_sin_vector: sinVector.slice(0, 5).map(p => p.codigo_interno + ' ' + p.descripcion.slice(0, 40)),
} }];`;

(async () => {
  const lista = await (await fetch(`${BASE}/workflows?limit=250`, { headers: H })).json();
  const wf0 = (lista.data || []).find(w => w.name === NOMBRE);
  if (!wf0) throw new Error(`no encuentro el workflow "${NOMBRE}"`);
  const wf = await (await fetch(`${BASE}/workflows/${wf0.id}`, { headers: H })).json();

  // el monitor sustituye al trabajador roto: mismo nodo, renombrado y con codigo nuevo
  let nodo = wf.nodes.find(n => n.name === NODO) || wf.nodes.find(n => n.name === NODO_VIEJO);
  if (!nodo) {
    nodo = { id: 'vocab_embeddings', name: NODO, type: 'n8n-nodes-base.code', typeVersion: 2, position: [780, 300], parameters: {} };
    wf.nodes.push(nodo);
    console.log('nodo creado');
  }
  const anterior = nodo.name;
  const renombrado = anterior !== NODO;
  nodo.name = NODO;
  nodo.parameters = { jsCode: CODIGO };
  console.log(renombrado ? `nodo "${anterior}" -> "${NODO}" (de trabajador a monitor)` : 'codigo del monitor actualizado');

  // recablear: el rename deja la conexion vieja huerfana
  if (renombrado) delete wf.connections[anterior];
  wf.connections[PREVIO] = { main: [[{ node: NODO, type: 'main', index: 0 }]] };
  if (wf.nodes.some(n => n.name === SIGUIENTE)) {
    wf.connections[NODO] = { main: [[{ node: SIGUIENTE, type: 'main', index: 0 }]] };
  }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  cs.executionOrder = cs.executionOrder || 'v1';
  cs.executionTimeout = 1800;

  const put = await fetch(`${BASE}/workflows/${wf0.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  if (!put.ok) { console.log('PUT fallo:', put.status, await put.text()); process.exit(1); }

  await fetch(`${BASE}/workflows/${wf0.id}/activate`, { method: 'POST', headers: H });
  const fin = await (await fetch(`${BASE}/workflows/${wf0.id}`, { headers: H })).json();
  console.log(`OK — activo: ${fin.active} | cadena: ${fin.nodes.map(n => n.name).join(' -> ')}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
