const http = require('http');

const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const WF_ID = 'ugHOTQv3Vb6cuTct';

function get() {
  return new Promise((res, rej) => {
    http.get({
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1/workflows/${WF_ID}`,
      headers: { 'X-N8N-API-KEY': KEY }
    }, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => res(JSON.parse(d)));
    }).on('error', rej);
  });
}

function put(p) {
  return new Promise((res, rej) => {
    const b = JSON.stringify(p);
    const r = http.request({
      hostname: 'localhost',
      port: 5678,
      path: `/api/v1/workflows/${WF_ID}`,
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(b)
      }
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res({ status: resp.statusCode, body: d }));
    });
    r.on('error', rej);
    r.write(b);
    r.end();
  });
}

function post(path) {
  return new Promise((res, rej) => {
    const b = '{}';
    const r = http.request({
      hostname: 'localhost',
      port: 5678,
      path,
      method: 'POST',
      headers: {
        'X-N8N-API-KEY': KEY,
        'Content-Type': 'application/json',
        'Content-Length': 2
      }
    }, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res(resp.statusCode));
    });
    r.on('error', rej);
    r.write(b);
    r.end();
  });
}

const BLOQUE_COMUN = `
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const RECARGO = 1.40;
function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function nBs(n){ return (Math.round(Number(n)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function nBsInt(n){ return Math.round(Number(n)).toLocaleString('en-US'); }
function tc(s){ return String(s).toLowerCase().split(/\\s+/).map(w=>{ if(/\\d/.test(w)) return w.toUpperCase(); if(w.length<=3) return w.toUpperCase(); return w.charAt(0).toUpperCase()+w.slice(1); }).join(' '); }
function norm(t){ return String(t).toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9 .\\/-]/g,' ').replace(/\\s+/g,' ').trim(); }
const SIN = {
  'corrugada':'estriada','corrugado':'estriado','varilla':'cabilla','varillas':'cabilla','hierro':'cabilla','cabillas':'cabilla',
  'simento':'cemento','simanto':'cemento','saco cemento':'cemento','bolsa cemento':'cemento',
  'clavo':'clavos','clavillo':'clavos','tornillo':'tornillos',
  'tubo cuadrado':'tubo herreria','tubo metalico':'tubo herreria','tuberia metalica':'tubo herreria',
  'laminas':'lamina','techo zinc':'lamina zinc','calamina':'lamina zinc','tejas':'lamina zinc',
  'alambre construccion':'alambron','alambre negro':'alambron',
  'disco corte':'disco metal','disco amoladora':'disco metal',
  'codo agua':'codo pvc','codo media':'codo pvc',
  'cable electrico':'cable thwn','cableado':'cable',
  'llave paso':'llave bola','grifo':'llave bola',
  'caja luz':'cajetin','caja electrica':'cajetin',
  'tepe':'teipe','tepe negro':'teipe','teipe negro':'teipe','cinta aislante':'teipe',
  'media':'1/2','medio':'1/2','un cuarto':'1/4','cuarto':'1/4','tres cuartos':'3/4','tres octavos':'3/8','un octavo':'1/8'
};
const ACCENTS = {
  'herreria': 'herrería',
  'carbon': 'carbón',
  'cautin': 'cautín',
  'exhibicion': 'exhibición',
  'gavilan': 'gavilán',
  'hidraulico': 'hidráulico',
  'lampara': 'lámpara',
  'periferica': 'periférica',
  'polimero': 'polímero',
  'presion': 'presión',
  'reduccion': 'reducción',
  'refrigeracion': 'refrigeración',
  'silicon': 'silicón',
  'sintetico': 'sintético',
  'tuberia': 'tubería',
  'plastico': 'plástico',
  'lamina': 'lámina',
  'bateria': 'batería',
  'medicion': 'medición',
  'fijacion': 'fijación'
};
function expandir(t){ let s=norm(t); const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length); for(const k of ks){ if(s.includes(k)) s=s.split(k).join(SIN[k]); } return s; }
async function getTasa(){ try { const r = await axios.get(SB+'/rest/v1/tasas?nombre=eq.actual&select=bcv_usd',{headers:H}); return r.data && r.data[0] && Number(r.data[0].bcv_usd); } catch(e){ return null; } }
function scoreMatch(descripcion, qTokens){
  const d = norm(descripcion);
  const words = d.split(/[\\s\\-x]+/);
  let s = 0, all = true;
  for (const t of qTokens){
    if (t === 'corte') {
      if (words.includes('corte') || words.includes('c/') || d.includes('c/')) {
        s += 10;
      } else {
        all = false;
      }
    } else if (t === '1/2' || t === '12mm') {
      if (words.includes('1/2') || words.includes('12mm') || words.includes('12') || d.includes('1/2') || d.includes('12mm') || d.includes('12 mm')) {
        s += 10;
      } else {
        all = false;
      }
    } else if (t === '3/8' || t === '10mm') {
      if (words.includes('3/8') || words.includes('10mm') || words.includes('10') || d.includes('3/8') || d.includes('10mm') || d.includes('10 mm')) {
        s += 10;
      } else {
        all = false;
      }
    } else if (t === '5/8' || t === '16mm') {
      if (words.includes('5/8') || words.includes('16mm') || words.includes('16') || d.includes('5/8') || d.includes('16mm') || d.includes('16 mm')) {
        s += 10;
      } else {
        all = false;
      }
    } else if (t === '3/4' || t === '20mm') {
      if (words.includes('3/4') || words.includes('20mm') || words.includes('20') || d.includes('3/4') || d.includes('20mm') || d.includes('20 mm')) {
        s += 10;
      } else {
        all = false;
      }
    } else {
      if (/\\d/.test(t)) {
        const specials = ['.', '*', '+', '?', '^', '\\\\$', '{', '}', '(', ')', '|', '[', ']', '\\\\\\\\'];
        let escaped = '';
        for (let j=0; j<t.length; j++) {
          const c = t[j];
          if (specials.includes(c)) escaped += '\\\\' + c;
          else escaped += c;
        }
        const rx = new RegExp('(?<![\\\\d/])' + escaped + '(?![\\\\d/])', 'i');
        if (rx.test(d)) {
          s += 10;
        } else {
          all = false;
        }
      } else {
        if (words.includes(t)) s += 10;
        else if (t.length>=3 && d.includes(t)) s += 5;
        else all = false;
      }
    }
  }
  if (all && qTokens.length>0) s += 50;
  s -= words.length * 0.1;
  return s;
}
`.trim();

const BUSCAR = `
// buscar_productos v9 — relevancia primero, ventas como desempate + corte->c/ PostgREST OR mapping + accents & stock
const axios = require('axios');
${BLOQUE_COMUN}
const { p_busqueda } = query;

const IGNORED = new Set([
  'de', 'y', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'o',
  'venden', 'vendes', 'tienen', 'tiene', 'hay', 'quiero', 'busco', 'comprar', 'necesito', 'dame', 'trae',
  'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'sale', 'salen', 'precio', 'precios', 'costo', 'como',
  'saco', 'sacos', 'bolsa', 'bolsas', 'unidad', 'unidades', 'pieza', 'piezas', 'kilo', 'kilos', 'kg',
  'metro', 'metros', 'mts', 'caja', 'cajas', 'galon', 'galones', 'para', 'con', 'del', 'algo', 'vender',
  'tener', 'buscar', 'amigo', 'buenas', 'hola', 'tardes', 'dias', 'noches', 'porfa', 'favor', 'gracias',
  'una', 'uno', 'unas', 'unos', 'donde', 'tiene', 'tienen'
]);
const MODIFIERS = new Set([
  'pulgada', 'pulgadas', 'media', 'cuarto', 'octavo', 'metro', 'metros', 'pies', 'pulg', 'mm', 'cm', 'mts',
  'negro', 'negra', 'blanco', 'blanca', 'gris', 'azul', 'rojo', 'verde', 'amarillo', 'amarilla'
]);

async function ilike(palabras, limit){
  const q = palabras.map(w => {
    if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
    if (w === '1/2' || w === '12mm') return 'or=(descripcion.ilike.*1/2*,descripcion.ilike.*12mm*,descripcion.ilike.*12 mm*)';
    if (w === '3/8' || w === '10mm') return 'or=(descripcion.ilike.*3/8*,descripcion.ilike.*10mm*,descripcion.ilike.*10 mm*)';
    if (w === '5/8' || w === '16mm') return 'or=(descripcion.ilike.*5/8*,descripcion.ilike.*16mm*,descripcion.ilike.*16 mm*)';
    if (w === '3/4' || w === '20mm') return 'or=(descripcion.ilike.*3/4*,descripcion.ilike.*20mm*,descripcion.ilike.*20 mm*)';
    if (ACCENTS[w]) return \`or=(descripcion.ilike.*\${w}*,descripcion.ilike.*\${ACCENTS[w]}*)\`;
    return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
  }).join('&');
  const url = SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&limit='+(limit||30);
  try { const r = await axios.get(url,{headers:H}); return r.data||[]; } catch(e){ return []; }
}
async function rpc(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_productos',{p_busqueda:t},{headers:H}); return r.data||[]; } catch(e){ return []; } }

const termExp = expandir(p_busqueda);
const qTokens = termExp.split(' ').filter(w => w.length>=2 && !IGNORED.has(w));
const largas = qTokens.filter(w => w.length>=3 || /\\d/.test(w));

let res = [];
if (largas.length>0) res = await ilike(largas, 30);
if (res.length===0 && largas.length>1) res = await ilike(largas.slice(0,2), 30);
if (res.length===0){
  const filtradasParaFallback = largas.filter(w => !MODIFIERS.has(w) && !IGNORED.has(w));
  const ml=filtradasParaFallback.sort((a,b)=>b.length-a.length)[0];
  if(ml) res=await ilike([ml], 30);
}
if (res.length===0) res = await rpc(termExp);
if (res.length===0 && termExp!==norm(p_busqueda)) res = await rpc(norm(p_busqueda));
if (res.length===0) return JSON.stringify({ encontrados:0, mensaje:'No encontre "' + p_busqueda + '" en el catalogo.' });

// dedup
const unicos=[]; const seen=new Set();
for(const p of res){ if(!seen.has(p.codigo_interno)){ seen.add(p.codigo_interno); unicos.push(p); } }
// ventas para desempate
const codes=unicos.map(p=>p.codigo_interno).slice(0,40);
let vMap={};
try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=4000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}

// ordenar: relevancia primero, luego disponibilidad (en stock primero), luego ventas desempate
unicos.sort((a,b)=>{
  const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
  if(Math.abs(ds)>0.5) return ds;
  const aStock = Number(a.existencia) > 0;
  const bStock = Number(b.existencia) > 0;
  if (aStock !== bStock) return aStock ? -1 : 1;
  return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
});

const tasa = await getTasa();
const productos = unicos.slice(0,4).map(p=>{
  const usd=Number(p.precio_venta); const bsUsd=usd*RECARGO;
  const disp = Number(p.existencia) > 0;
  return { nombre: tc(p.descripcion), disponible:disp, precio_divisas_texto: nUSD(usd)+'$',
    precio_bs_texto: tasa ? (nUSD(bsUsd)+'$ o '+nBs(bsUsd*tasa)+'bs') : (nUSD(bsUsd)+'$ (tasa BCV no disponible)') };
});
return JSON.stringify({ encontrados:productos.length, tasa_bcv:tasa, productos });
`.trim();

const PRESUP = `
// hacer_presupuesto v3 — relevancia primero en cada producto de la lista con accents & stock
const axios = require('axios');
${BLOQUE_COMUN}

let raw = query.productos || query.items || query.lista || query.some_input || '';
if (typeof raw !== 'string') { try { raw = JSON.stringify(raw); } catch(e){ raw=String(raw); } }
raw = raw.trim();
if (!raw) return JSON.stringify({ ok:false, mensaje:'Necesito la lista de productos con cantidades.' });

function parseItems(str){
  const partes = str.split(/[,;\\n]+/).map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (let p of partes){
    let nombre=p, cant=1;
    let m = p.match(/^(.*?)[:=]\\s*(\\d+(?:\\.\\d+)?)\\s*$/);
    if (!m) m = p.match(/^(.*?)\\s+x\\s*(\\d+(?:\\.\\d+)?)\\s*$/i);
    if (!m){ const m2=p.match(/^(\\d+(?:\\.\\d+)?)\\s+(.*)$/); if(m2){ cant=Number(m2[1]); nombre=m2[2]; } }
    if (m){ nombre=m[1].trim(); cant=Number(m[2]); }
    nombre = nombre.replace(/^(sacos?|unidades?|uds?|piezas?|de)\\s+/i,'').trim();
    if (nombre) out.push({ nombre, cantidad: cant>0?cant:1 });
  }
  return out;
}
const items = parseItems(raw);
if (items.length===0) return JSON.stringify({ ok:false, mensaje:'No pude interpretar la lista. Formato: nombre:cantidad' });

const tasa = await getTasa();

async function buscarUno(nombre){
  const exp = expandir(nombre);
  const qTokens = exp.split(' ').filter(w=>w.length>=2);
  const largas = qTokens.filter(w=>w.length>=3 || /\\d/.test(w));
  let cand=[];
  for (let i=Math.min(largas.length,4); i>=1 && cand.length===0; i--){
    const q = largas.slice(0,i).map(w => {
      if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
      if (w === '1/2' || w === '12mm') return 'or=(descripcion.ilike.*1/2*,descripcion.ilike.*12mm*,descripcion.ilike.*12 mm*)';
      if (w === '3/8' || w === '10mm') return 'or=(descripcion.ilike.*3/8*,descripcion.ilike.*10mm*,descripcion.ilike.*10 mm*)';
      if (w === '5/8' || w === '16mm') return 'or=(descripcion.ilike.*5/8*,descripcion.ilike.*16mm*,descripcion.ilike.*16 mm*)';
      if (w === '3/4' || w === '20mm') return 'or=(descripcion.ilike.*3/4*,descripcion.ilike.*20mm*,descripcion.ilike.*20 mm*)';
      if (ACCENTS[w]) return \`or=(descripcion.ilike.*\${w}*,descripcion.ilike.*\${ACCENTS[w]}*)\`;
      return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
    }).join('&');
    try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&limit=30',{headers:H}); cand=r.data||[]; }catch(e){}
  }
  if (cand.length===0) return null;
  // ventas para desempate
  const codes=cand.map(p=>p.codigo_interno);
  let vMap={};
  try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=3000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}
  cand.sort((a,b)=>{
    const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
    if(Math.abs(ds)>0.5) return ds;
    const aStock = Number(a.existencia) > 0;
    const bStock = Number(b.existencia) > 0;
    if (aStock !== bStock) return aStock ? -1 : 1;
    return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
  });
  return cand[0];
}

let bloque='', totUSD=0, n=0;
const noEnc=[];
let hasAgotado = false;
for (const it of items){
  const prod=await buscarUno(it.nombre);
  if(!prod){ noEnc.push(it.nombre); continue; }
  n++;
  const usd=Number(prod.precio_venta);
  const sub=usd*it.cantidad;
  totUSD+=sub;
  const isAgotado = Number(prod.existencia) <= 0;
  if (isAgotado) hasAgotado = true;
  bloque += n+'. *'+tc(prod.descripcion)+'*' + (isAgotado ? ' _(Agotado)_' : '') + '\\n';
  bloque += '   '+it.cantidad+' x '+nUSD(usd)+'$ = *'+nUSD(sub)+'$*\\n\\n';
}
if (n===0) return JSON.stringify({ ok:false, mensaje:'No encontré esos productos: '+noEnc.join(', ') });

const totBs = tasa ? totUSD*RECARGO*tasa : null;
bloque += '━━━━━━━━━━━━━━━\\n';
bloque += '💵 *Pagando en dólares: '+nUSD(totUSD)+'$*\\n';
if (tasa) bloque += '🇻🇪 *Pagando en bolívares (+40%): '+nUSD(totUSD*RECARGO)+'$ = Bs '+nBsInt(totBs)+'*';
else bloque += '_(tasa BCV no disponible para el monto en Bs)_';

const notaParts = [];
if (noEnc.length) notaParts.push('no ubiqué en catálogo: ' + noEnc.join(', '));
if (hasAgotado) notaParts.push('algunos productos están agotados (marcados con Agotado)');
const nota = notaParts.length ? ('Ojo: ' + notaParts.join('; ') + '.') : '';
return JSON.stringify({ ok:true, presupuesto_texto: bloque, nota });
`.trim();

(async () => {
  const wf = await get();
  
  const toolBuscar = wf.nodes.find(n => n.name === 'buscar_productos_tool');
  if (toolBuscar) {
    toolBuscar.parameters.jsCode = BUSCAR;
  }
  
  const toolPresupuesto = wf.nodes.find(n => n.name === 'hacer_presupuesto_tool');
  if (toolPresupuesto) {
    toolPresupuesto.parameters.jsCode = PRESUP;
  }
  
  const r = await put({
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: 'v1' }
  });
  
  if (r.status >= 300) {
    console.error('PUT ERROR:', r.body.slice(0, 400));
    process.exit(1);
  }
  
  await post(`/api/v1/workflows/${WF_ID}/deactivate`);
  const ar = await post(`/api/v1/workflows/${WF_ID}/activate`);
  console.log('✓ Modified buscar_productos and hacer_presupuesto successfully.');
  console.log('✓ n8n put status:', r.status, '| reactivated:', ar);
})().catch(e => {
  console.error('PATCH FATAL ERROR:', e);
  process.exit(1);
});
