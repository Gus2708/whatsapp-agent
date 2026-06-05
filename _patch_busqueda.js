/**
 * Mejora la herramienta buscar_productos con:
 * 1. Diccionario de sinónimos ferreteros venezolanos
 * 2. Búsqueda multi-token: si la búsqueda falla, prueba cada palabra sola
 * 3. Búsqueda por partes: "tubo herreria 2x1" → busca "tubo herreria" + "2x1"
 * 4. Desduplicación y reordenamiento por ventas
 */
const http = require('http');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const WF_ID = 'ugHOTQv3Vb6cuTct';
const ANON = 'REDACTED_SUPABASE_ANON_KEY';
const SUPABASE = 'https://rgniqjfooifchyctnbzu.supabase.co';

function get() { return new Promise((res,rej)=>{ http.get({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,headers:{'X-N8N-API-KEY':API_KEY}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);}); }
function put(p){ return new Promise((res,rej)=>{ const b=JSON.stringify(p); const r=http.request({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,method:'PUT',headers:{'X-N8N-API-KEY':API_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));}); r.on('error',rej); r.write(b); r.end(); }); }

const NEW_CODE = `
// ── buscar_productos_tool v3 ────────────────────────────────────────────────
// Búsqueda robusta: sinónimos + multi-token + fallback por palabras individuales.
// SOLO devuelve productos con existencia > 0. Máximo 5, ordenados por más vendidos.
const axios = require('axios');
const { p_busqueda } = query;
const SUPABASE = '${SUPABASE}';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// ── Diccionario de sinónimos ferreteros venezolanos ──────────────────────────
const SINONIMOS = {
  'corrugada': 'estriada', 'corrugado': 'estriado', 'varilla': 'cabilla',
  'hierro': 'cabilla', 'hierros': 'cabilla',
  'simento': 'cemento', 'simanto': 'cemento',
  'tornillo': 'tornillos', 'clavo': 'clavos', 'clavillo': 'clavos',
  'tubo cuadrado': 'tubo herreria', 'tuberia metalica': 'tubo herreria',
  'tubo metalico': 'tubo herreria',
  'zinc': 'lamina zinc', 'láminas': 'lamina', 'laminas': 'lamina',
  'techo': 'lamina zinc', 'tejas': 'lamina zinc', 'calamina': 'lamina zinc',
  'alambre': 'alambre', 'alambre construccion': 'alambron',
  'cercha': 'cercha', 'vigueta': 'cercha',
  'disco corte': 'disco metal', 'tronzadora': 'disco metal',
  'codo agua': 'codo pvc', 'codo tubo': 'codo pvc',
  'saco cemento': 'cemento', 'bolsa cemento': 'cemento',
  'pintura': 'pintura', 'brocha': 'brocha', 'rodillo': 'rodillo',
  'cable electrico': 'cable thwn', 'cableado': 'cable',
  'llave paso': 'llave bola', 'grifo': 'llave',
  'cajetin': 'cajetin', 'caja de luz': 'cajetin'
};

// ── Normalizar texto ──────────────────────────────────────────────────────────
function normalizar(t) {
  return t.toLowerCase()
    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')  // quitar tildes
    .replace(/[^a-z0-9 \\/]/g, ' ').replace(/\\s+/g, ' ').trim();
}

// ── Aplicar sinónimos ─────────────────────────────────────────────────────────
function aplicarSinonimos(texto) {
  let t = normalizar(texto);
  for (const [k, v] of Object.entries(SINONIMOS)) {
    if (t.includes(k)) t = t.replace(new RegExp(k, 'g'), v);
  }
  return t;
}

// ── Llamar RPC buscar_productos ───────────────────────────────────────────────
async function rpc(termino) {
  try {
    const r = await axios.post(SUPABASE + '/rest/v1/rpc/buscar_productos', { p_busqueda: termino }, { headers: H });
    return (r.data || []).filter(p => Number(p.existencia) > 0);
  } catch(e) { return []; }
}

// ── Búsqueda en cascada ───────────────────────────────────────────────────────
let termino = aplicarSinonimos(p_busqueda);
let resultados = await rpc(termino);

// Si no trajo nada, probar con el término original normalizado
if (resultados.length === 0 && termino !== normalizar(p_busqueda)) {
  resultados = await rpc(normalizar(p_busqueda));
}

// Si aún no, probar por tokens individuales (palabras de 4+ letras)
if (resultados.length === 0) {
  const tokens = termino.split(' ').filter(w => w.length >= 4);
  const seen = new Set();
  for (const tok of tokens) {
    const sub = await rpc(tok);
    for (const p of sub) {
      if (!seen.has(p.codigo_interno)) { seen.add(p.codigo_interno); resultados.push(p); }
    }
    if (resultados.length >= 10) break;
  }
}

if (resultados.length === 0) {
  return 'No encontré "' + p_busqueda + '" con stock disponible. Intenta con otro nombre o pregúntame si tenemos algo similar.';
}

// ── Ordenar por más vendidos (consultar ventas) ───────────────────────────────
const codes = [...new Set(resultados.map(p => p.codigo_interno))];
let ventasMap = {};
try {
  const codesFilter = codes.map(c => '"' + c + '"').join(',');
  const vr = await axios.get(SUPABASE + '/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.(' + codesFilter + ')&limit=2000', { headers: H });
  for (const v of (vr.data || [])) {
    ventasMap[v.codigo_producto] = (ventasMap[v.codigo_producto] || 0) + Number(v.cantidad);
  }
} catch(e) {}

// Desduplicar y ordenar
const unicos = [];
const seenF = new Set();
for (const p of resultados) {
  if (!seenF.has(p.codigo_interno)) {
    seenF.add(p.codigo_interno);
    unicos.push(p);
  }
}
unicos.sort((a, b) => (ventasMap[b.codigo_interno] || 0) - (ventasMap[a.codigo_interno] || 0));

// Devolver top 5
return JSON.stringify(unicos.slice(0, 5).map(p => ({
  nombre: p.descripcion,
  precio_usd: Number(p.precio_venta),
  existencia: Math.floor(Number(p.existencia)),
  vendidos: ventasMap[p.codigo_interno] || 0
})));
`.trim();

(async () => {
  const wf = await get();
  const n = wf.nodes.find(x => x.name === 'buscar_productos_tool');
  if (!n) throw new Error('nodo no encontrado');
  n.parameters.jsCode = NEW_CODE;
  const r = await put({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: (wf.settings&&wf.settings.executionOrder)||'v1' } });
  console.log('PUT', r.status, r.status>=300 ? r.body.slice(0,400) : 'OK — buscar_productos_tool v3 con sinónimos+multi-token aplicado');
})();
