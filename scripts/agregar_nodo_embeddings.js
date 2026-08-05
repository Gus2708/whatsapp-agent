// Añade al workflow "Sync Vocabulario Catálogo" un segundo Code node que mantiene al día
// productos_embedding (pgvector), y ACTIVA el workflow.
//
// Sin esto, cada producto nuevo entraría al catálogo sin vector y la capa semántica
// se iría quedando ciega justo con lo más reciente.
//
//   node scripts/agregar_nodo_embeddings.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const key = pick('N8N_API_KEY');
const ANON = pick('SUPABASE_ANON_KEY');
const SBURL = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

const NOMBRE = 'Sync Vocabulario Catálogo';
const NODO = 'Sync Embeddings';

const CODIGO = `// Mantiene productos_embedding al día. Incremental por hash de la descripción:
// solo embebe lo nuevo o lo que cambió. Si no hay OPENAI_API_KEY, no hace nada y lo dice
// (la búsqueda funciona igual sin la capa vectorial).
//
// OJO con dos cosas aprendidas a golpes:
//  - el lote de ESCRITURA va aparte y es chico: un vector de 1536 dims pesa ~20KB en JSON
//    y lotes grandes revientan el statement_timeout de Supabase (error 57014).
//  - hay tope por corrida para no comerse el tiempo de ejecución; lo que no entra se
//    procesa la noche siguiente y se REPORTA, no se descarta en silencio.
const axios = require('axios');
const crypto = require('crypto');

const SB = '${SBURL}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const OAI = $env.OPENAI_API_KEY;

if (!OAI) return [{ json: { ok: true, mensaje: 'sin OPENAI_API_KEY: capa vectorial desactivada', embebidos: 0 } }];

const MODELO = 'text-embedding-3-small';
const DIMS = 1536;
const LOTE_OAI = 128;
const LOTE_ESCRITURA = 40;
const MAX_POR_CORRIDA = 1500;

async function traerTodo(tabla, select, orden){
  const out = [];
  for (let off = 0; ; off += 1000){
    const r = await axios.get(SB + '/rest/v1/' + tabla + '?select=' + select + '&order=' + orden + '&offset=' + off + '&limit=1000', { headers: H });
    const d = r.data || [];
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

const hashDe = t => crypto.createHash('md5').update(t).digest('hex');

const productos = (await traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'))
  .filter(p => p.descripcion && p.descripcion.trim());
const previos = new Map((await traerTodo('productos_embedding', 'codigo_interno,hash_desc', 'codigo_interno.asc'))
  .map(r => [r.codigo_interno, r.hash_desc]));

let pendientes = productos.filter(p => previos.get(p.codigo_interno) !== hashDe(p.descripcion.trim()));
const total = pendientes.length;
if (!total) return [{ json: { ok: true, mensaje: 'embeddings al día', productos: productos.length, embebidos: 0 } }];

const diferidos = Math.max(0, total - MAX_POR_CORRIDA);
pendientes = pendientes.slice(0, MAX_POR_CORRIDA);

let escritos = 0, tokens = 0, fallos = 0;
for (let i = 0; i < pendientes.length; i += LOTE_OAI){
  const lote = pendientes.slice(i, i + LOTE_OAI);
  let vectores;
  try {
    const e = await axios.post('https://api.openai.com/v1/embeddings',
      { model: MODELO, input: lote.map(p => p.descripcion.trim()), dimensions: DIMS },
      { headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' }, timeout: 60000 });
    vectores = e.data.data.map(d => d.embedding);
    tokens += (e.data.usage && e.data.usage.total_tokens) || 0;
  } catch (err) { fallos++; continue; }

  const filas = lote.map((p, k) => ({
    codigo_interno: p.codigo_interno,
    descripcion: p.descripcion,
    hash_desc: hashDe(p.descripcion.trim()),
    embedding: JSON.stringify(vectores[k]),
    modelo: MODELO,
    actualizado_en: new Date().toISOString(),
  }));

  for (let j = 0; j < filas.length; j += LOTE_ESCRITURA){
    const trozo = filas.slice(j, j + LOTE_ESCRITURA);
    let ok = false;
    for (let intento = 1; intento <= 4 && !ok; intento++){
      try {
        await axios.post(SB + '/rest/v1/productos_embedding?on_conflict=codigo_interno', trozo,
          { headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) });
        ok = true;
      } catch (err) { await new Promise(r => setTimeout(r, 500 * intento)); }
    }
    if (ok) escritos += trozo.length; else fallos++;
  }
}

return [{ json: {
  ok: true,
  productos: productos.length,
  pendientes: total,
  embebidos: escritos,
  diferidos_a_la_proxima: diferidos,
  lotes_fallidos: fallos,
  costo_usd: Number((tokens / 1e6 * 0.02).toFixed(5)),
} }];`;

(async () => {
  const lista = await (await fetch(`${BASE}/workflows?limit=250`, { headers: H })).json();
  const wf0 = (lista.data || []).find(w => w.name === NOMBRE);
  if (!wf0) throw new Error(`no encuentro el workflow "${NOMBRE}"`);

  const wf = await (await fetch(`${BASE}/workflows/${wf0.id}`, { headers: H })).json();

  let nodo = wf.nodes.find(n => n.name === NODO);
  if (!nodo) {
    nodo = { id: 'vocab_embeddings', name: NODO, type: 'n8n-nodes-base.code', typeVersion: 2, position: [780, 300], parameters: { jsCode: CODIGO } };
    wf.nodes.push(nodo);
    console.log('✓ nodo "' + NODO + '" creado');
  } else if (nodo.parameters.jsCode !== CODIGO) {
    nodo.parameters.jsCode = CODIGO;
    console.log('✓ código del nodo actualizado');
  } else {
    console.log('· nodo ya estaba al día');
  }

  // encadenar: Sincronizar Vocabulario -> Sync Embeddings
  wf.connections['Sincronizar Vocabulario'] = { main: [[{ node: NODO, type: 'main', index: 0 }]] };

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  cs.executionOrder = cs.executionOrder || 'v1';
  cs.executionTimeout = 1800;

  const put = await fetch(`${BASE}/workflows/${wf0.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  if (!put.ok) { console.log('PUT fallo:', put.status, await put.text()); process.exit(1); }
  console.log('PUT ok');

  const act = await fetch(`${BASE}/workflows/${wf0.id}/activate`, { method: 'POST', headers: H });
  console.log(act.ok ? `OK — workflow ACTIVADO (id ${wf0.id}); corre cada noche a las 3:00.` : `no pude activarlo: ${act.status} ${await act.text()}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
