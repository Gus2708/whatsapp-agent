/**
 * Búsqueda de PRECISIÓN — relevancia primero, ventas solo como desempate.
 *  - scoreMatch(): +10 por palabra exacta, +5 por substring, +50 si coincide TODO
 *  - Así "cemento gris csc" → CSC (contiene csc) le gana a Catatumbo (no lo contiene)
 *  - Aplica a buscar_productos (individual) y a buscarUno (presupuesto)
 *  - Sube el límite de candidatos (no recorta por orden alfabético antes de puntuar)
 *  - Prompt: conservar términos exactos del cliente (marcas/medidas/modelos)
 */
const http = require('http');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const WF_ID = 'ugHOTQv3Vb6cuTct';
function get(){return new Promise((res,rej)=>{http.get({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,headers:{'X-N8N-API-KEY':KEY}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
function put(p){return new Promise((res,rej)=>{const b=JSON.stringify(p);const r=http.request({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,method:'PUT',headers:{'X-N8N-API-KEY':KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(b);r.end();});}
function post(path){return new Promise((res,rej)=>{const b='{}';const r=http.request({hostname:'localhost',port:5678,path,method:'POST',headers:{'X-N8N-API-KEY':KEY,'Content-Type':'application/json','Content-Length':2}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res(resp.statusCode));});r.on('error',rej);r.write(b);r.end();});}

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
  'caja luz':'cajetin','caja electrica':'cajetin'
};
function expandir(t){ let s=norm(t); const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length); for(const k of ks){ if(s.includes(k)) s=s.split(k).join(SIN[k]); } return s; }
async function getTasa(){ try { const r = await axios.get(SB+'/rest/v1/tasas?nombre=eq.actual&select=bcv_usd',{headers:H}); return r.data && r.data[0] && Number(r.data[0].bcv_usd); } catch(e){ return null; } }
// Puntuación de relevancia: prioriza coincidencia específica sobre popularidad.
function scoreMatch(descripcion, qTokens){
  const d = norm(descripcion);
  const words = d.split(' ');
  let s = 0, all = true;
  for (const t of qTokens){
    if (words.includes(t)) s += 10;          // palabra exacta
    else if (t.length>=3 && d.includes(t)) s += 5;  // substring
    else all = false;                        // token no encontrado
  }
  if (all && qTokens.length>0) s += 50;       // bonus: contiene TODOS los términos pedidos
  s -= words.length * 0.1;                     // leve preferencia por descripciones específicas
  return s;
}
`.trim();

// ── buscar_productos (individual) ────────────────────────────────────────────
const BUSCAR = `
// buscar_productos v6 — relevancia primero, ventas como desempate
const axios = require('axios');
${BLOQUE_COMUN}
const { p_busqueda } = query;

async function ilike(palabras, limit){
  const q = palabras.map(w=>'descripcion=ilike.*'+encodeURIComponent(w)+'*').join('&');
  const url = SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&existencia=gt.0&limit='+(limit||30);
  try { const r = await axios.get(url,{headers:H}); return r.data||[]; } catch(e){ return []; }
}
async function rpc(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_productos',{p_busqueda:t},{headers:H}); return (r.data||[]).filter(p=>Number(p.existencia)>0); } catch(e){ return []; } }

const termExp = expandir(p_busqueda);
const qTokens = termExp.split(' ').filter(w=>w.length>=2);
const largas = qTokens.filter(w=>w.length>=4);

let res = [];
if (largas.length>0) res = await ilike(largas, 30);
if (res.length===0 && largas.length>1) res = await ilike(largas.slice(0,2), 30);
if (res.length===0){ const ml=largas.slice().sort((a,b)=>b.length-a.length)[0]; if(ml) res=await ilike([ml], 30); }
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

// ── hacer_presupuesto (con buscarUno de precisión) ───────────────────────────
const PRESUP = `
// hacer_presupuesto — relevancia primero en cada producto de la lista
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
  const largas = qTokens.filter(w=>w.length>=3);
  let cand=[];
  // candidatos amplios (no recortar por alfabético antes de puntuar)
  for (let i=Math.min(largas.length,4); i>=1 && cand.length===0; i--){
    const q=largas.slice(0,i).map(w=>'descripcion=ilike.*'+encodeURIComponent(w)+'*').join('&');
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

(async()=>{
  const wf = await get();
  wf.nodes.find(n=>n.name==='buscar_productos_tool').parameters.jsCode = BUSCAR;
  wf.nodes.find(n=>n.name==='hacer_presupuesto_tool').parameters.jsCode = PRESUP;
  console.log('✓ buscar_productos y hacer_presupuesto → ranking por relevancia');

  // Prompt: conservar términos exactos del cliente
  const ai = wf.nodes.find(n=>n.name==='AI Agent');
  let sm = ai.parameters.options.systemMessage;
  if (!sm.includes('CONSERVA los términos exactos')) {
    sm = sm.replace('═══ BÚSQUEDA Y RELEVANCIA ═══',
      '═══ BÚSQUEDA Y RELEVANCIA ═══\n- CONSERVA los términos exactos del cliente al buscar o cotizar (marcas, medidas, modelos como "CSC", "12mm", "Catatumbo", "Ingco"). NO los simplifiques ni los quites: si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".');
    ai.parameters.options.systemMessage = sm;
    console.log('✓ Prompt → conservar términos exactos');
  }

  const r = await put({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings:{ executionOrder:'v1' } });
  if(r.status>=300){ console.error('PUT ERROR', r.body.slice(0,400)); return; }
  await post(`/api/v1/workflows/${WF_ID}/deactivate`);
  const ar = await post(`/api/v1/workflows/${WF_ID}/activate`);
  console.log('✓ PUT', r.status, '| reactivado', ar);
})().catch(e=>console.error('FATAL',e));
