const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'n8n_workflow.json');

const BLOQUE_COMUN = `
const SB = $env.SUPABASE_URL || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = $env.SUPABASE_ANON_KEY;
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
      if (words.includes(t)) s += 10;
      else if (t.length>=3 && d.includes(t)) s += 5;
      else all = false;
    }
  }
  if (all && qTokens.length>0) s += 50;
  s -= words.length * 0.1;
  return s;
}
`.trim();

const BUSCAR = `
// buscar_productos v8 — relevancia primero, ventas como desempate + corte->c/ PostgREST OR mapping
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
    return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
  }).join('&');
  const url = SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&existencia=gt.0&limit='+(limit||30);
  try { const r = await axios.get(url,{headers:H}); return r.data||[]; } catch(e){ return []; }
}
async function rpc(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_productos',{p_busqueda:t},{headers:H}); return (r.data||[]).filter(p=>Number(p.existencia)>0); } catch(e){ return []; } }

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
if (res.length===0) return JSON.stringify({ encontrados:0, mensaje:'No encontre "'+p_busqueda+'" con stock disponible.' });

// dedup
const unicos=[]; const seen=new Set();
for(const p of res){ if(!seen.has(p.codigo_interno)){ seen.add(p.codigo_interno); unicos.push(p); } }
// ventas para desempate
const codes=unicos.map(p=>p.codigo_interno).slice(0,40);
let vMap={};
try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=4000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}
// ordenar: relevancia primero, ventas desempate
unicos.sort((a,b)=>{ const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens); if(Math.abs(ds)>0.5) return ds; return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0); });

const tasa = await getTasa();
const productos = unicos.slice(0,4).map(p=>{
  const usd=Number(p.precio_venta); const bsUsd=usd*RECARGO;
  return { nombre: tc(p.descripcion), disponible:true, precio_divisas_texto: nUSD(usd)+'$',
    precio_bs_texto: tasa ? (nUSD(bsUsd)+'$ o '+nBs(bsUsd*tasa)+'bs') : (nUSD(bsUsd)+'$ (tasa BCV no disponible)') };
});
return JSON.stringify({ encontrados:productos.length, tasa_bcv:tasa, productos });
`.trim();

const PRESUP = `
// hacer_presupuesto v2 — relevancia primero en cada producto de la lista + corte->c/ PostgREST OR mapping
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
      return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
    }).join('&');
    try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&existencia=gt.0&limit=30',{headers:H}); cand=r.data||[]; }catch(e){}
  }
  if (cand.length===0) return null;
  // ventas para desempate
  const codes=cand.map(p=>p.codigo_interno);
  let vMap={};
  try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=3000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}
  cand.sort((a,b)=>{ const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens); if(Math.abs(ds)>0.5) return ds; return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0); });
  return cand[0];
}

let bloque='', totUSD=0, n=0;
const noEnc=[];
for (const it of items){
  const prod=await buscarUno(it.nombre);
  if(!prod){ noEnc.push(it.nombre); continue; }
  n++;
  const usd=Number(prod.precio_venta);
  const sub=usd*it.cantidad;
  totUSD+=sub;
  bloque += n+'. *'+tc(prod.descripcion)+'*\\n';
  bloque += '   '+it.cantidad+' x '+nUSD(usd)+'$ = *'+nUSD(sub)+'$*\\n\\n';
}
if (n===0) return JSON.stringify({ ok:false, mensaje:'No encontré esos productos con stock: '+noEnc.join(', ') });

const totBs = tasa ? totUSD*RECARGO*tasa : null;
bloque += '━━━━━━━━━━━━━━━\\n';
bloque += '💵 *Pagando en dólares: '+nUSD(totUSD)+'$*\\n';
if (tasa) bloque += '🇻🇪 *Pagando en bolívares (+40%): '+nUSD(totUSD*RECARGO)+'$ = Bs '+nBsInt(totBs)+'*';
else bloque += '_(tasa BCV no disponible para el monto en Bs)_';

const nota = noEnc.length ? ('Ojo: no ubiqué con stock: '+noEnc.join(', ')+'.') : '';
return JSON.stringify({ ok:true, presupuesto_texto: bloque, nota });
`.trim();

try {
  const rawContent = fs.readFileSync(filePath, 'utf8');
  const wf = JSON.parse(rawContent);

  const buscarNode = wf.nodes.find(n => n.name === 'buscar_productos_tool');
  const presupNode = wf.nodes.find(n => n.name === 'hacer_presupuesto_tool');

  if (!buscarNode || !presupNode) {
    throw new Error('Search or Budget node not found in JSON');
  }

  buscarNode.parameters.jsCode = BUSCAR;
  presupNode.parameters.jsCode = PRESUP;

  fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
  console.log('✓ Successfully patched buscar_productos and hacer_presupuesto in n8n_workflow.json');

} catch (e) {
  console.error('Failed to patch workflow JSON:', e);
  process.exit(1);
}
