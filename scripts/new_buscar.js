// buscar_productos v10 — relevancia + medidas robustas (NxM, fracciones) + reglas cabilla/cemento + ventas
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const RECARGO = 1.40;
function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function nBs(n){ return (Math.round(Number(n)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function nBsInt(n){ return Math.round(Number(n)).toLocaleString('en-US'); }
function tc(s){ return String(s).toLowerCase().split(/\s+/).map(w=>{ if(/\d/.test(w)) return w.toUpperCase(); if(w.length<=3) return w.toUpperCase(); return w.charAt(0).toUpperCase()+w.slice(1); }).join(' '); }
function norm(t){ return String(t).toLowerCase().replace(/[\u00d7\u2715\u2716]/g,'x').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim(); }
// Normaliza medidas compuestas: "3 x 1-1/2", "3x1.1/2", "1 1/2 x 1 1/2" -> "3x1-1/2", "1-1/2x1-1/2"
function normMedida(s){
  let t = norm(s);
  t = t.replace(/(\d+)\s*mm/g, '$1mm');                    // 10 mm -> 10mm
  t = t.replace(/(\d+)\s*[.\s]\s*(\d+\/\d+)/g, '$1-$2');   // 1. 1/2  /  1 1/2  -> 1-1/2
  t = t.replace(/(\d[\d\/-]*)\s*[x*]\s*(?=\d)/gi, '$1x');  // 3 x 1-1/2 / 3*1 -> 3x1-1/2
  return t.replace(/\s+/g,' ').trim();
}
// Equivalencias de calibre cabilla (pulgada <-> mm)
const SIZEQ = {
  '1/2':['1/2','12mm'], '12mm':['1/2','12mm'],
  '3/8':['3/8','10mm'], '10mm':['3/8','10mm'],
  '5/8':['5/8','16mm'], '16mm':['5/8','16mm'],
  '3/4':['3/4','20mm'], '20mm':['3/4','20mm']
};
// ¿la medida `med` aparece en la descripcion ya normalizada `nd`, con limites de palabra?
function medPresent(med, nd){
  // Par de dimensiones AxB de perfiles (tubo/angulo/lamina): aceptar en CUALQUIER orden (40x100 == 100x40)
  const _pm = /^(\d[\d.\/-]*)x(\d[\d.\/-]*)$/.exec(med);
  if (_pm) {
    const _e = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const _a = _e(_pm[1]), _b = _e(_pm[2]);
    return new RegExp('(^|[ (x])'+_a+'x'+_b+'($|[ x)])').test(nd)
        || new RegExp('(^|[ (x])'+_b+'x'+_a+'($|[ x)])').test(nd);
  }
  if (SIZEQ[med]) {
    for (const a of SIZEQ[med]){ const esc=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); if (new RegExp('(^|[ (])'+esc+'($|[ x)])').test(nd)) return true; }
    return false;
  }
  if (/^\d+$/.test(med)) {
    if (new RegExp('(^|[ (])'+med+'mm($|[ x)])').test(nd)) return true;
    if (new RegExp('(^|[ (])'+med+'(?=x|\\)|$)').test(nd)) return true;
    if (new RegExp('(?<=x)'+med+'(?=x|\\)|$| )').test(nd)) return true;
    if (new RegExp('(^|[ (])'+med+' (?!(?:mm|cm|mts|mtrs|metros?|metro|m|pies?|pie|pulg|psi|gal|kg|kilos?|lbs?)\\b)').test(nd)) return true;
    return false;
  }
  const esc = med.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return new RegExp('(^|[ (])'+esc+'($|[ x)])').test(nd);
}
const SIN = {
  'rieles':'tubo herreria','riel':'tubo herreria',
  'lavaplatos':'fregadero','lavaplato':'fregadero','lava platos':'fregadero','lava plato':'fregadero','elegante':'lujo','corrugada':'estriada','corrugado':'estriado','varilla':'cabilla','varillas':'cabilla','hierro':'cabilla','cabillas':'cabilla',
  'simento':'cemento','simanto':'cemento','saco cemento':'cemento','bolsa cemento':'cemento',
  'clavo':'clavos','clavillo':'clavos','tornillo':'tornillos',
  'tubo cuadrado':'tubo herreria','tubo metalico':'tubo herreria','tuberia metalica':'tubo herreria',
  'tubo electrico':'tubo electricidad','tubo de luz':'tubo electricidad','tubo luz':'tubo electricidad',
  'tubo sanitario':'tubo agua negra','tubo aguas negras':'tubo agua negra','tubo cloaca':'tubo agua negra','tubo aguas servidas':'tubo agua negra',
  'tubo de agua':'tubo agua','tuberia':'tubo','codos':'codo',
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
  'fregadero': 'lavaplato','herreria': 'herrería','carbon': 'carbón','cautin': 'cautín','exhibicion': 'exhibición','gavilan': 'gavilán',
  'hidraulico': 'hidráulico','lampara': 'lámpara','periferica': 'periférica','polimero': 'polímero','presion': 'presión',
  'reduccion': 'reducción','refrigeracion': 'refrigeración','silicon': 'silicón','sintetico': 'sintético','tuberia': 'tubería',
  'plastico': 'plástico','lamina': 'lámina','bateria': 'batería','medicion': 'medición','fijacion': 'fijación'
};
// colores: neutraliza genero/numero a una raiz (blanco/blanca/blancos/blancas -> blanc)
// asi "pintura blanca" coincide con "PINTURA ... BLANCO" en la BD.
const COLOR_STEM = {
  'blanco':'blanc','blanca':'blanc','blancos':'blanc','blancas':'blanc',
  'negro':'negr','negra':'negr','negros':'negr','negras':'negr',
  'rojo':'roj','roja':'roj','rojos':'roj','rojas':'roj',
  'amarillo':'amarill','amarilla':'amarill','amarillos':'amarill','amarillas':'amarill',
  'morado':'morad','morada':'morad','morados':'morad','moradas':'morad',
  'dorado':'dorad','dorada':'dorad','dorados':'dorad','doradas':'dorad',
  'plateado':'platead','plateada':'platead','plateados':'platead','plateadas':'platead',
  'rosado':'rosad','rosada':'rosad','rosados':'rosad','rosadas':'rosad',
  'gris':'gris','grises':'gris','verde':'verde','verdes':'verde',
  'azul':'azul','azules':'azul','marron':'marron','marrones':'marron',
  'naranja':'naranja','naranjas':'naranja','beige':'beige','cafe':'cafe',
  'celeste':'celeste','celestes':'celeste'
};
function stemColor(w){ return COLOR_STEM[w] || w; }
// plural -> singular (español, suficiente para el catalogo)
function singular(w){
  if (w.length < 5) return w;                     // gris, csc, tres...
  if (/ones$/.test(w)) return w.slice(0,-2);      // alambrones->alambron, conexiones->conexion
  if (/ores$/.test(w)) return w.slice(0,-2);      // conectores->conector, destornilladores->destornillador
  if (/[aeiou]s$/.test(w)) return w.slice(0,-1);  // tubos->tubo, curvas->curva, llaves->llave, cables->cable
  if (/[^aeiou]es$/.test(w)) return w.slice(0,-2);// papeles->papel, meses->mes
  if (/s$/.test(w)) return w.slice(0,-1);
  return w;
}
function expandir(t){ let s=norm(t); s=s.replace(/\bcal\b(?!\s*\d)/g,'cal preparada'); const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length); for(const k of ks){ if(s.includes(k)) s=s.split(k).join(SIN[k]); } return s; }
// productos a granel (se venden por metro/kilo): su existencia es irreal, SIEMPRE disponibles
function esGranel(desc){ const d=norm(desc); return /(^| )x ?(mtrs|mtr|mts|mt|metros|metro|kilos|kilo|kg|gr|ml)( |$)/.test(d) || / por metro( |$)/.test(d); }
async function getTasa(){ try { const r = await axios.get(SB+'/rest/v1/tazas?nombre=eq.actual&select=bcv_usd',{headers:H}); return r.data && r.data[0] && Number(r.data[0].bcv_usd); } catch(e){ return null; } }
function scoreMatch(descripcion, qTokens){
  const d = norm(descripcion);
  const nd = normMedida(descripcion);
  const words = d.split(/[\s\-x]+/);
  let s = 0, all = true;
  for (const t of qTokens){
    if (t === 'corte') {
      if (words.includes('corte') || words.includes('c/') || d.includes('c/')) s += 10; else all = false;
    } else if (/\d/.test(t)) {
      if (medPresent(t, nd)) s += 12; else all = false;
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
const { p_busqueda } = query;

const IGNORED = new Set([
  'de', 'y', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'o',
  'venden', 'vendes', 'tienen', 'tiene', 'hay', 'quiero', 'busco', 'comprar', 'necesito', 'dame', 'trae',
  'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'sale', 'salen', 'precio', 'precios', 'costo', 'como',
  'saco', 'sacos', 'bolsa', 'bolsas', 'unidad', 'unidades', 'pieza', 'piezas', 'kilo', 'kilos', 'kg',
  'metro', 'metros', 'mts', 'caja', 'cajas', 'galon', 'galones', 'para', 'con', 'del', 'algo', 'vender', 'por', 'al', 'cada',
  'tener', 'buscar', 'amigo', 'buenas', 'hola', 'tardes', 'dias', 'noches', 'porfa', 'favor', 'gracias',
  'una', 'uno', 'unas', 'unos', 'donde', 'tiene', 'tienen'
]);
const MODIFIERS = new Set([
  'multifuncional', 'pulgada', 'pulgadas', 'media', 'cuarto', 'octavo', 'metro', 'metros', 'pies', 'pulg', 'mm', 'cm', 'mts',
  'negro', 'negra', 'blanco', 'blanca', 'gris', 'azul', 'rojo', 'verde', 'amarillo', 'amarilla'
]);

const GRANEL_OR = 'or=(descripcion.ilike.*x mt*,descripcion.ilike.*x metro*,descripcion.ilike.*por metro*)';
async function ilike(palabras, limit, extra){
  const q = palabras.map(w => {
    if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
    if (w === '1/2' || w === '12mm') return 'or=(descripcion.ilike.*1/2*,descripcion.ilike.*12mm*,descripcion.ilike.*12 mm*)';
    if (w === '3/8' || w === '10mm') return 'or=(descripcion.ilike.*3/8*,descripcion.ilike.*10mm*,descripcion.ilike.*10 mm*)';
    if (w === '5/8' || w === '16mm') return 'or=(descripcion.ilike.*5/8*,descripcion.ilike.*16mm*,descripcion.ilike.*16 mm*)';
    if (w === '3/4' || w === '20mm') return 'or=(descripcion.ilike.*3/4*,descripcion.ilike.*20mm*,descripcion.ilike.*20 mm*)';
    if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`;
    return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
  }).join('&');
  const url = SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+(extra?('&'+extra):'')+'&limit='+(limit||30);
  try { const r = await axios.get(url,{headers:H}); return r.data||[]; } catch(e){ return []; }
}
async function rpc(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_productos',{p_busqueda:t},{headers:H}); return r.data||[]; } catch(e){ return []; } }

const termExp = normMedida(expandir(p_busqueda));
const qTokens = termExp.split(' ').filter(w => (w.length>=2 || /\d/.test(w)) && !IGNORED.has(w)).map(w => /\d/.test(w) ? w : singular(stemColor(w)));
const largas = qTokens.filter(w => w.length>=3 || /\d/.test(w));
const textLargas = largas.filter(w => !/\d/.test(w));
const medLargas = largas.filter(w => /\d/.test(w));

// ¿el cliente lo pidio "por metro / al metro / x metro"? -> preferir el producto a granel (X MT)
const granelIntent = /\b(por|al|x|cada|el)\s*(metro|metros|mt|mts)\b/.test(norm(p_busqueda));

// Fetch: si hay palabras de texto (categoria), trae amplio por categoria y filtra la medida en JS
// (las descripciones guardan las medidas con formatos inconsistentes, por eso no las metemos al ilike).
let res = [];
if (granelIntent && textLargas.length>0) res = await ilike(textLargas, 60, GRANEL_OR);
if (res.length===0 && textLargas.length>0) res = await ilike(textLargas, 60);
if (res.length===0 && largas.length>0) res = await ilike(largas, 30);
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

// Regla negocio CEMENTO: generico = solo gris; otros tipos solo si los piden
{ const nbq = norm(p_busqueda); if (qTokens.includes('cemento')) { let tipo='gris'; if(nbq.includes('blanco')) tipo='blanco'; else if(nbq.includes('asfalt')||nbq.includes('plastic')||nbq.includes('bituplast')||nbq.includes('edil')) tipo='plastico'; else if(nbq.includes('contacto')||nbq.includes('pega')) tipo='contacto'; const matchTipo=(d)=>{ d=norm(d); if(tipo==='blanco') return d.includes('blanco'); if(tipo==='plastico') return d.includes('plastico')||d.includes('bituplast')||d.includes('edil')||d.includes('asfalt'); if(tipo==='contacto') return d.includes('contacto')||d.includes('pega'); return d.includes('cemento gris'); }; const filt = unicos.filter(p => matchTipo(p.descripcion)); if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }

// Regla negocio CABILLA: generico = solo ESTRIADA (12mm=1/2, 10mm=3/8 son las principales). Redonda/Cuadrada/Lisa solo si las piden.
{ const nbq = norm(p_busqueda); if (qTokens.includes('cabilla')) { const wantCuadrada=nbq.includes('cuadrada'); const wantRedonda=nbq.includes('redonda'); const wantLisa=nbq.includes('lisa'); let filt=null; if(wantCuadrada||wantRedonda||wantLisa){ filt = unicos.filter(p => { const d=norm(p.descripcion); if(wantCuadrada) return d.includes('cuadrada'); if(wantRedonda) return d.includes('redonda'); if(wantLisa) return d.includes('lisa'); return true; }); } else { const est = unicos.filter(p => norm(p.descripcion).includes('estriada')); if (medLargas.length>0){ const estM = est.filter(p=>{ const nd=normMedida(p.descripcion); return medLargas.every(m=>medPresent(m,nd)); }); filt = (estM.length>0) ? est : null; } else { filt = est; } } if (filt && filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }

// Si pidio "por metro", prioriza los productos a granel (X MT)
if (granelIntent){
  const g = unicos.filter(p => esGranel(p.descripcion));
  if (g.length>0){ unicos.length=0; for(const x of g) unicos.push(x); }
}

// Filtro de MEDIDA: si el cliente dio medidas, deja solo los que las cumplen TODAS
if (medLargas.length>0){
  const filt = unicos.filter(p => { const nd=normMedida(p.descripcion); return medLargas.every(m => medPresent(m, nd)); });
  if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); }
}

// ventas para desempate
const codes=unicos.map(p=>p.codigo_interno).slice(0,40);
let vMap={};
try{ const vr=await axios.post(SB+'/rest/v1/rpc/popularidad_productos',{p_codigos:codes},{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=Number(v.total); }catch(e){}

// ordenar: relevancia primero, luego disponibilidad (en stock primero), luego mas vendido
unicos.sort((a,b)=>{
  const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
  if(Math.abs(ds)>0.5) return ds;
  const aStock = esGranel(a.descripcion) || Number(a.existencia) > 0;
  const bStock = esGranel(b.descripcion) || Number(b.existencia) > 0;
  if (aStock !== bStock) return aStock ? -1 : 1;
  return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
});

const tasa = await getTasa();
const productos = unicos.slice(0,4).map(p=>{
  const usd=Number(p.precio_venta); const bsUsd=usd*RECARGO;
  const disp = esGranel(p.descripcion) || Number(p.existencia) > 0;
  return { nombre: tc(p.descripcion), disponible:disp, precio_divisas_texto: nUSD(usd)+'$',
    precio_bs_texto: tasa ? (nUSD(bsUsd)+'$ o '+nBs(bsUsd*tasa)+'bs') : (nUSD(bsUsd)+'$ (tasa BCV no disponible)') };
});
return JSON.stringify({ encontrados:productos.length, tasa_bcv:tasa, productos });
