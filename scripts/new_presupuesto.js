// hacer_presupuesto v4 — relevancia + medidas robustas + reglas cabilla/cemento + ventas; Bs sin revelar recargo
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
function normMedida(s){
  let t = norm(s);
  t = t.replace(/(\d+)\s*mm/g, '$1mm');
  t = t.replace(/(\d+)\s*[.\s]\s*(\d+\/\d+)/g, '$1-$2');
  t = t.replace(/(\d[\d\/-]*)\s*[x*]\s*(?=\d)/gi, '$1x');
  return t.replace(/\s+/g,' ').trim();
}
const SIZEQ = {
  '1/2':['1/2','12mm'], '12mm':['1/2','12mm'],
  '3/8':['3/8','10mm'], '10mm':['3/8','10mm'],
  '5/8':['5/8','16mm'], '16mm':['5/8','16mm'],
  '3/4':['3/4','20mm'], '20mm':['3/4','20mm']
};
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
function singular(w){
  if (w.length < 5) return w;
  if (/ones$/.test(w)) return w.slice(0,-2);
  if (/ores$/.test(w)) return w.slice(0,-2);
  if (/[aeiou]s$/.test(w)) return w.slice(0,-1);
  if (/[^aeiou]es$/.test(w)) return w.slice(0,-2);
  if (/s$/.test(w)) return w.slice(0,-1);
  return w;
}
function expandir(t){ let s=norm(t); s=s.replace(/\bcal\b(?!\s*\d)/g,'cal preparada'); if(/\bfibra\b/.test(s)&&/\b(pisos?|concreto|vaciado|losa|estructural)\b/.test(s)) s=s.replace(/\bfibra\b/g,'macrofibra'); const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length); for(const k of ks){ if(s.includes(k)) s=s.split(k).join(SIN[k]); } return s; }
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

let raw = query.productos || query.items || query.lista || query.some_input || '';
if (typeof raw !== 'string') { try { raw = JSON.stringify(raw); } catch(e){ raw=String(raw); } }
raw = raw.trim();
if (!raw) return JSON.stringify({ ok:false, mensaje:'Necesito la lista de productos con cantidades.' });

function parseItems(str){
  const partes = str.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean);
  const out = [];
  for (let p of partes){
    let nombre=p, cant=1;
    let m = p.match(/^(.*?)[:=]\s*(\d+(?:\.\d+)?)\s*$/);
    if (!m) m = p.match(/^(.*?)\s+x\s*(\d+(?:\.\d+)?)\s*$/i);
    if (!m){ const m2=p.match(/^(\d+(?:\.\d+)?)\s+(.*)$/); if(m2){ cant=Number(m2[1]); nombre=m2[2]; } }
    if (m){ nombre=m[1].trim(); cant=Number(m[2]); }
    nombre = nombre.replace(/^((sacos?|unidades?|uds?|piezas?|metros?|mts|de|del|la|el|los|las)\s+)+/i,'').trim();
    if (nombre) out.push({ nombre, cantidad: cant>0?cant:1 });
  }
  return out;
}
const items = parseItems(raw);
if (items.length===0) return JSON.stringify({ ok:false, mensaje:'No pude interpretar la lista. Formato: nombre:cantidad' });

const tasa = await getTasa();

const STOPW = new Set(['de','del','la','el','los','las','un','una','unos','unas','y','o','con','para','por','al','cada','metro','metros','mt','mts','pulgada','pulgadas','pieza','piezas','rollo','rollos','saco','sacos','unidad','unidades','caja','cajas','galon','galones']);
async function buscarUno(nombre){
  const exp = normMedida(expandir(nombre));
  const qTokens = exp.split(' ').filter(w=>(w.length>=2 || /\d/.test(w)) && !STOPW.has(w)).map(w => /\d/.test(w) ? w : singular(stemColor(w)));
  const largas = qTokens.filter(w=>w.length>=3 || /\d/.test(w));
  const textLargas = largas.filter(w=>!/\d/.test(w));
  const medLargas = largas.filter(w=>/\d/.test(w));
  const granelIntent = /\b(por|al|x|cada|el)\s*(metro|metros|mt|mts)\b/.test(norm(nombre));
  const rolloIntent = /\b(rollos?)\b/.test(norm(nombre)); // "rollo de cable" -> rollo completo, no por metro
  const GRANEL_OR = 'or=(descripcion.ilike.*x mt*,descripcion.ilike.*x metro*,descripcion.ilike.*por metro*)';
  let cand=[];
  // si hay categoria de texto, trae amplio por categoria y filtra medida en JS
  if (textLargas.length>0){
    const q = textLargas.map(w => { if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`; return 'descripcion=ilike.*' + encodeURIComponent(w) + '*'; }).join('&');
    if (granelIntent){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&'+GRANEL_OR+'&limit=60',{headers:H}); cand=r.data||[]; }catch(e){} }
    if (cand.length===0){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&limit=60',{headers:H}); cand=r.data||[]; }catch(e){} }
  }
  // fallback: logica anterior por tokens (incluye medidas en el ilike)
  for (let i=Math.min(largas.length,4); i>=1 && cand.length===0; i--){
    const q = largas.slice(0,i).map(w => {
      if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
      if (w === '1/2' || w === '12mm') return 'or=(descripcion.ilike.*1/2*,descripcion.ilike.*12mm*,descripcion.ilike.*12 mm*)';
      if (w === '3/8' || w === '10mm') return 'or=(descripcion.ilike.*3/8*,descripcion.ilike.*10mm*,descripcion.ilike.*10 mm*)';
      if (w === '5/8' || w === '16mm') return 'or=(descripcion.ilike.*5/8*,descripcion.ilike.*16mm*,descripcion.ilike.*16 mm*)';
      if (w === '3/4' || w === '20mm') return 'or=(descripcion.ilike.*3/4*,descripcion.ilike.*20mm*,descripcion.ilike.*20 mm*)';
      if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`;
      return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
    }).join('&');
    try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&limit=30',{headers:H}); cand=r.data||[]; }catch(e){}
  }
  if (cand.length===0) return null;

  // Regla CEMENTO
  { const nbq = norm(nombre); if (qTokens.includes('cemento')) { let tipo='gris'; if(nbq.includes('blanco')) tipo='blanco'; else if(nbq.includes('asfalt')||nbq.includes('plastic')||nbq.includes('bituplast')||nbq.includes('edil')) tipo='plastico'; else if(nbq.includes('contacto')||nbq.includes('pega')) tipo='contacto'; const matchTipo=(d)=>{ d=norm(d); if(tipo==='blanco') return d.includes('blanco'); if(tipo==='plastico') return d.includes('plastico')||d.includes('bituplast')||d.includes('edil')||d.includes('asfalt'); if(tipo==='contacto') return d.includes('contacto')||d.includes('pega'); return d.includes('cemento gris'); }; const filt = cand.filter(p => matchTipo(p.descripcion)); if (filt.length>0) cand = filt; } }

  // Regla CABILLA
  { const nbq = norm(nombre); if (qTokens.includes('cabilla')) { const wantCuadrada=nbq.includes('cuadrada'); const wantRedonda=nbq.includes('redonda'); const wantLisa=nbq.includes('lisa'); let filt=null; if(wantCuadrada||wantRedonda||wantLisa){ filt = cand.filter(p => { const d=norm(p.descripcion); if(wantCuadrada) return d.includes('cuadrada'); if(wantRedonda) return d.includes('redonda'); if(wantLisa) return d.includes('lisa'); return true; }); } else { const est = cand.filter(p => norm(p.descripcion).includes('estriada')); if (medLargas.length>0){ const estM = est.filter(p=>{ const nd=normMedida(p.descripcion); return medLargas.every(m=>medPresent(m,nd)); }); filt = (estM.length>0) ? est : null; } else { filt = est; } } if (filt && filt.length>0) cand = filt; } }

  // Si pidio "por metro", prioriza productos a granel (X MT)
  if (granelIntent){
    const g = cand.filter(p => esGranel(p.descripcion));
    if (g.length>0) cand = g;
  }
  // Si pidio "rollo", prioriza el rollo COMPLETO (no las versiones por metro "X MT")
  if (rolloIntent && !granelIntent){
    const r = cand.filter(p => !esGranel(p.descripcion));
    if (r.length>0) cand = r;
  }

  const candPre = cand.slice();
  // Filtro de MEDIDA
  if (medLargas.length>0){
    const filt = cand.filter(p => { const nd=normMedida(p.descripcion); return medLargas.every(m => medPresent(m, nd)); });
    if (filt.length>0) cand = filt;
    else return null; // pidio una medida que ningun producto tiene -> no sustituir; va a "no encontrados"
  }

  // ventas para desempate
  const codes=cand.map(p=>p.codigo_interno);
  let vMap={};
  try{ const vr=await axios.post(SB+'/rest/v1/rpc/popularidad_productos',{p_codigos:codes},{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=Number(v.total); }catch(e){}
  cand.sort((a,b)=>{
    const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
    if(Math.abs(ds)>0.5) return ds;
    const aStock = esGranel(a.descripcion) || Number(a.existencia) > 0;
    const bStock = esGranel(b.descripcion) || Number(b.existencia) > 0;
    if (aStock !== bStock) return aStock ? -1 : 1;
    return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
  });
  // Si el mejor resultado no comparte NINGUNA palabra de categoría con lo pedido, es OTRO producto
  // (coincidió por subcadena/número) -> no lo sustituyas; va a "no encontrados".
  if (textLargas.length>0 && cand.length>0){
    const w0 = norm(cand[0].descripcion).split(/[\s\-x]+/);
    if (!textLargas.some(t => w0.includes(t))) return null;
  }
  // best = mas vendido de la medida pedida. Si el EXACTO esta AGOTADO, ofrece sustitutos
  // DISPONIBLES de la MISMA familia (estructural/herreria/...) en vez de callar o saltar a otro producto.
  const best = cand[0];
  const bestAgotado = !esGranel(best.descripcion) && Number(best.existencia) <= 0;
  const famDe = (s)=>{ const d=norm(s); for (const f of ['estructural','herreria','ventilacion','agua negra','agua caliente','agua fria','conduit','presion','electricidad']) if (d.includes(f)) return f; return null; };
  const fam = famDe(best.descripcion);
  const pool = bestAgotado
    ? (typeof candPre!=='undefined'?candPre:cand).filter(c => c.codigo_interno!==best.codigo_interno && (esGranel(c.descripcion) || Number(c.existencia)>0) && (!fam || norm(c.descripcion).includes(fam))).sort((a,b)=>(vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0))
    : cand.slice(1);
  const seenP = new Set([Number(best.precio_venta)]);
  const alts = [];
  for (const c of pool){
    const avail = esGranel(c.descripcion) || Number(c.existencia) > 0;
    const pr = Number(c.precio_venta);
    if (avail && !seenP.has(pr)){ seenP.add(pr); alts.push(c); }
    if (alts.length>=2) break;
  }
  return { best, alts };
}

let bloque='', totUSD=0, n=0;
const noEnc=[];
const altLines=[];
let hasAgotado = false;
for (const it of items){
  const r=await buscarUno(it.nombre);
  if(!r || !r.best){ noEnc.push(it.nombre); continue; }
  const prod=r.best;
  n++;
  const usd=Number(prod.precio_venta);
  const sub=usd*it.cantidad;
  totUSD+=sub;
  const isAgotado = !esGranel(prod.descripcion) && Number(prod.existencia) <= 0;
  if (isAgotado) hasAgotado = true;
  bloque += n+'. *'+tc(prod.descripcion)+'*' + (isAgotado ? ' _(Agotado)_' : '') + '\n';
  bloque += '   '+it.cantidad+' x '+nUSD(usd)+'$ = *'+nUSD(sub)+'$*\n\n';
  // otras opciones disponibles para este renglón
  for (const a of (r.alts||[])){
    const ausd=Number(a.precio_venta);
    altLines.push('• En vez de *'+tc(prod.descripcion)+'* también está *'+tc(a.descripcion)+'* a '+nUSD(ausd)+'$ c/u');
  }
}
if (n===0) return JSON.stringify({ ok:false, instruccion:'NO encontre estos productos. Tu UNICA respuesta valida ahora es el token [PEDIR_AYUDA] (escribelo solo, exactamente asi). PROHIBIDO sugerir alternativas o decir que no los tenemos: un empleado los elegira.', mensaje:'No encontré esos productos: '+noEnc.join(', ') });

const totBs = tasa ? totUSD*RECARGO*tasa : null;
bloque += '━━━━━━━━━━━━━━━\n';
bloque += '💵 *Pagando en dólares: '+nUSD(totUSD)+'$*\n';
if (tasa) bloque += '🇻🇪 *Pagando en bolívares: '+nUSD(totUSD*RECARGO)+'$ = Bs '+nBsInt(totBs)+'*';
else bloque += '_(tasa BCV no disponible para el monto en Bs)_';

const notaParts = [];
if (noEnc.length) notaParts.push('no ubiqué en catálogo: ' + noEnc.join(', '));
if (hasAgotado) notaParts.push('algunos productos están agotados (marcados con Agotado)');
const nota = notaParts.length ? ('Ojo: ' + notaParts.join('; ') + '.') : '';
const alternativas_texto = altLines.length ? altLines.join('\n') : '';
return JSON.stringify({ ok:true, presupuesto_texto: bloque, alternativas_texto, nota });
