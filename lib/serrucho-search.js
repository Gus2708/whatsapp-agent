function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function nBs(n){ return (Math.round(Number(n)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function nBsInt(n){ return Math.round(Number(n)).toLocaleString('en-US'); }
function tc(s){ return String(s).toLowerCase().split(/\s+/).map(w=>{ if(/\d/.test(w)) return w.toUpperCase(); if(w.length<=3) return w.toUpperCase(); return w.charAt(0).toUpperCase()+w.slice(1); }).join(' '); }
function norm(t){ return String(t).toLowerCase().replace(/(\d)\s*,\s*(\d)/g,'$1.$2').replace(/[×✕✖]/g,'x').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim(); }
// Normaliza medidas compuestas: "3 x 1-1/2", "3x1.1/2", "1 1/2 x 1 1/2" -> "3x1-1/2", "1-1/2x1-1/2"
function normMedida(s){
  let t = norm(s);
  t = t.replace(/\.(?!\d)/g, ' ');                         // punto de frase: "1mm. cuanto" -> "1mm cuanto" (los decimales 0.30 se conservan)
  t = t.replace(/(\d+)\s*mm/g, '$1mm');                    // 10 mm -> 10mm
  t = t.replace(/(\d+)\s*[.\s]\s*(\d+\/\d+)/g, '$1-$2');   // 1. 1/2  /  1 1/2  -> 1-1/2
  // "2/1" NO es fraccion: en el catalogo los denominadores reales son potencias de 2
  // (1/2, 3/4, 5/8, 1/16...). Si no lo es, el cliente escribio la medida con barra: 2/1 -> 2x1
  t = t.replace(/\b(\d+)\/(\d+)\b/g, (m,a,b) => /^(2|4|8|16|32|64)$/.test(b) ? m : a+'x'+b);
  t = t.replace(/(\d[\d\/-]*)\s*[x*]\s*(?=\d)/gi, '$1x');  // 3 x 1-1/2 / 3*1 -> 3x1-1/2
  return t.replace(/\s+/g,' ').trim();
}
// Equivalencias: calibre cabilla (pulgada <-> mm), voltaje (110 == 120) y largos de lamina (3.60 == 3.66 = 12 pies)
const SIZEQ = {
  '1/2':['1/2','12mm'], '12mm':['1/2','12mm'],
  '3/8':['3/8','10mm'], '10mm':['3/8','10mm'],
  '5/8':['5/8','16mm'], '16mm':['5/8','16mm'],
  '3/4':['3/4','20mm'], '20mm':['3/4','20mm'],
  '110v':['110v','120v'], '120v':['120v','110v'],
  '3.60':['3.60','3.66'], '3.6':['3.6','3.60','3.66']
};
// pulgadas -> mm en pares NxM: el catalogo etiqueta herreria en pulgadas (2X1) y estructural en mm (100X100)
const INCH_MM = { '1':'25','2':'50','3':'75','4':'100','5':'125','6':'150' };
// ¿la medida `med` aparece en la descripcion ya normalizada `nd`, con limites de palabra?
function medPresent(med, nd){
  // Par de dimensiones AxB de perfiles (tubo/angulo/lamina): aceptar en CUALQUIER orden (40x100 == 100x40)
  // y probar tambien la equivalencia pulgadas->mm (4x4 == 100x100) porque el catalogo mezcla unidades.
  const _pm = /^(\d[\d.\/-]*)x(\d[\d.\/-]*)$/.exec(med);
  if (_pm) {
    const _e = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const _tl = '($|[ x)]|mm|mts|mtrs|metros?|pies?)'; // tolera sufijo de unidad: "1.10X6MTS"
    const _pairs = [[_pm[1], _pm[2]]];
    if (INCH_MM[_pm[1]] && INCH_MM[_pm[2]]) _pairs.push([INCH_MM[_pm[1]], INCH_MM[_pm[2]]]);
    for (const _pr of _pairs){
      const _a = _e(_pr[0]), _b = _e(_pr[1]);
      if (new RegExp('(^|[ (x])'+_a+'x'+_b+_tl).test(nd)) return true;
      if (new RegExp('(^|[ (x])'+_b+'x'+_a+_tl).test(nd)) return true;
    }
    return false;
  }
  if (SIZEQ[med]) {
    for (const a of SIZEQ[med]){ const esc=a.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); if (new RegExp('(^|[ (])'+esc+'($|[ x)\/])').test(nd)) return true; }
    return false;
  }
  if (/^\d+$/.test(med)) {
    if (new RegExp('(^|[ (])'+med+'mm($|[ x)])').test(nd)) return true;
    if (new RegExp('(^|[ (])'+med+'(?=x|\\)|$)').test(nd)) return true;
    if (new RegExp('(?<=x)'+med+'(?=x|\\)|$| )').test(nd)) return true;
    if (new RegExp('(^|[ (])'+med+' (?!(?:mm|cm|mts|mtrs|metros?|metro|m|pies?|pie|pulg|psi|gal|kg|kilos?|lbs?)\\b)').test(nd)) return true;
    // largo en metros: el cliente dice "6 metros" y el catalogo escribe "6MTS"/"X6MTS"/"6 MTS"
    if (new RegExp('(^|[ (x])'+med+'\\s?(?:mts|mtrs|mt|metros?|pies?)\\b').test(nd)) return true;
    // unidad pegada al numero: "110V", "500ML", "1800W", "1200L", "20A" (el cliente da solo el numero)
    if (new RegExp('(^|[ (x\/])'+med+'(?:v|w|ml|lts?|l|kg|hp|amp|a)($|[ x)\/])').test(nd)) return true;
    // calibre de 2 digitos: "30" matchea "CAL.30"/"CAL 30" y la forma decimal "0.30" (cal 30 = 0.30mm)
    if (med.length===2){
      if (new RegExp('cal\\.?\\s?'+med+'($|[ x)]|mm)').test(nd)) return true;
      if (new RegExp('(^|[ (.])0\\.'+med+'($|[ x)]|mm)').test(nd)) return true;
    }
    return false;
  }
  const esc = med.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  // decimal: tolera prefijo cal./espacio/x y sufijo de unidad mm (p.ej. "CAL.0.20", "0.20MM", "0.20 X")
  if (new RegExp('(^|[ (x]|cal\\.?\\s?)'+esc+'(mm|v)?($|[ x)\/])').test(nd)) return true;
  // cero final: el cliente escribe "1.1"/"0.2" y el catalogo "1.10"/"0.20"
  if (/^\d+\.\d$/.test(med) && new RegExp('(^|[ (x]|cal\\.?\\s?)'+esc+'0(mm)?($|[ x)])').test(nd)) return true;
  // calibre decimal "0.30" tambien matchea el entero "CAL.30" (0.30 == cal 30)
  const _ent = /^0\.(\d{2})$/.exec(med);
  if (_ent && new RegExp('cal\\.?\\s?'+_ent[1]+'($|[ x)]|mm)').test(nd)) return true;
  return false;
}
const SIN = {
  'calibre':'cal','cal.':'cal',
  'rieles':'tubo herreria','riel':'tubo herreria',
  'lavaplatos':'fregadero','lavaplato':'fregadero','lava platos':'fregadero','lava plato':'fregadero','elegante':'lujo','corrugada':'estriada','corrugado':'estriado','varilla':'cabilla','varillas':'cabilla','hierro':'cabilla','cabillas':'cabilla',
  'simento':'cemento','simanto':'cemento','saco de cemento':'cemento','bolsa de cemento':'cemento','saco cemento':'cemento','bolsa cemento':'cemento',
  'clavo':'clavos','clavillo':'clavos','tornillo':'tornillos',
  'tubo cuadrado':'tubo herreria','tubo metalico':'tubo herreria','tuberia metalica':'tubo herreria',
  'tubo electrico':'tubo electricidad','tubo de luz':'tubo electricidad','tubo luz':'tubo electricidad',
  'tubo sanitario':'tubo agua negra','tubo aguas negras':'tubo agua negra','tubo cloaca':'tubo agua negra','tubo aguas servidas':'tubo agua negra',
  'tubo de agua':'tubo agua','tuberia':'tubo','codos':'codo',
  'laminas':'lamina','techo zinc':'lamina zinc','calamina':'lamina zinc','tejas':'lamina zinc','zinc':'lamina zinc','sinz':'lamina zinc','zing':'lamina zinc','planchas zinc':'lamina zinc','plancha zinc':'lamina zinc',
  'alambre construccion':'alambron','alambre negro':'alambron',
  'disco corte':'disco metal','disco amoladora':'disco metal',
  'codo agua':'codo pvc','codo media':'codo pvc',
  'cable electrico':'cable thwn','cableado':'cable',
  'llave paso':'llave bola','grifo':'llave bola',
  'caja luz':'cajetin','caja electrica':'cajetin',
  'tepe':'teipe','tepe negro':'teipe','teipe negro':'teipe',
  'tela pollera':'malla gallinero','tela de gallinero':'malla gallinero','tela gallinero':'malla gallinero','malla para pollos':'malla pollito','malla de pollo':'malla pollito','malla pollo':'malla pollito',
  'pipotes de agua':'tanque','pipote de agua':'tanque','popotes de agua':'tanque','pipas de agua':'tanque','pipa de agua':'tanque','pipotes':'tanque','pipote':'tanque','popotes':'tanque','popote':'tanque',
  'pigmentos':'oxido','pigmento':'oxido',
  'cielo raso':'drywall','cielo razo':'drywall','cielorraso':'drywall',
  'prepintadas':'','prepintada':'','prepintados':'','prepintado':'',
  'media':'1/2','medio':'1/2','un cuarto':'1/4','cuarto':'1/4','tres cuartos':'3/4','tres octavos':'3/8','un octavo':'1/8'
};
// Sinonimos que CONVIVEN en el catalogo: el MISMO producto esta escrito de las dos
// formas (APAGADOR ... / INTERRUPTOR ...), asi que NO sirve sustituir un termino por otro
// via SIN (perderiamos la otra mitad del catalogo): hay que buscar TODAS las variantes con
// OR y dejar que el resto de los tokens (linea/color/marca) desempate.
// Ojo: los breakers se llaman "BREAKER" en el catalogo (no "interruptor termomagnetico"),
// asi que este alias no arrastra tableros electricos.
const ALIAS = {
  'apagador':    ['apagador','interruptor','suiche','switch'],
  'interruptor': ['interruptor','apagador','suiche','switch'],
  'suiche':      ['suiche','switch','interruptor','apagador'],
  'suich':       ['suiche','switch','interruptor','apagador'], // singular() deja "suiches"->"suich"
  'switch':      ['switch','suiche','interruptor','apagador'],
  // la linea de Troen se escribe NORDIK; el cliente la pide como "nordico/nordica"
  'nordico':     ['nordik','nordico'],
  'nordica':     ['nordik','nordico'],
  'nordik':      ['nordik','nordico']
};
const aliasDe = w => ALIAS[w] || [w];
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
function expandir(t){ let s=norm(t); s=s.replace(/\bcal\b(?!\s*\d)/g,'cal preparada'); if(/\bfibra\b/.test(s)&&/\b(pisos?|concreto|vaciado|losa|estructural)\b/.test(s)) s=s.replace(/\bfibra\b/g,'macrofibra'); if(/\b(protector|protectores|regulador|reguladores|breaker|voltaje|supresor)\b/.test(s)){ s=s.replace(/\b110\b/g,'110v').replace(/\b120\b/g,'120v'); } /* "varilla roscada" es BARRA ROSCADA, no cabilla: hay que protegerla ANTES de que SIN
   aplique varilla->cabilla, que convertia "varilla roscada de zinc" en "cabilla roscada"
   y devolvia cabillas estriadas. */
  // "varilla" NO siempre es cabilla: "varilla roscada" es BARRA ROSCADA y "varilla de
  // soldar" es la de soldadura (el catalogo la escribe con la errata "BARILLA").
  if (/\bvarillas?\s+roscad/.test(s)) s = s.replace(/\bvarillas?\b/g, 'barra');
  else if (/\bvarillas?\b/.test(s) && /soldar|soldadura|7018|6013|6011/.test(s)) s = s.replace(/\bvarillas?\b/g, 'soldar');
  // "cinta aislante" existe TAL CUAL en el catalogo; mapearla a teipe la volvia
  // inencontrable. Se deja pasar y que el resto de los tokens desempate.
  s = s.replace(/\btriple a\b/g, 'aaa');
  // "tubo/perfil/angulo ... pesado" = linea ESTRUCTURAL (pared gruesa, la que el catalogo etiqueta
  // en mm: 100X100, 140X60...). El termino puede ir antes o despues de la medida ("tubo 4x4 pesado"),
  // por eso se resuelve por presencia en toda la frase (no por adyacencia, que exige un SIN normal).
  // OJO: NO mapear "liviano"->herreria: el catalogo YA usa "LIVIANO" como nombre literal de otra
  // linea (TUBO LIVIANO P/ELECTRICIDAD, conduit), y pisarlo rompería esa búsqueda.
  if (/\b(tubo|perfil|angulo)\b/.test(s) && /\bpesad\w*\b/.test(s)) s = s.replace(/\bpesad\w*\b/g, 'estructural');
  /* Unidades como las escribe el cliente vs como las abrevia el catalogo:
     "6 vatios"->6w, "2 toneladas"->2 ton, "un metro"->1 metro, "doble a"->aa, empotrar->emp. */
  s = s.replace(/(\d+)\s*vatios?\b/g,'$1w').replace(/(\d+)\s*toneladas?\b/g,'$1 ton');
  s = s.replace(/\bun metro\b/g,'1 metro').replace(/\bdos metros\b/g,'2 metros');
  s = s.replace(/\bdoble a\b/g,'aa').replace(/\bempotrar\b/g,'emp');
  const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length); for(const k of ks){ if(s.includes(k)) s=s.split(k).join(SIN[k]); } return s.replace(/\s+/g,' ').trim(); }
// productos a granel (se venden por metro/kilo): su existencia es irreal, SIEMPRE disponibles
function esGranel(desc){ const d=norm(desc); return /(^| )x ?(mtrs|mtr|mts|mt|metros|metro|kilos|kilo|kg|gr|ml)( |$)/.test(d) || / por metro( |$)/.test(d); }
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
      // el termino cuenta si aparece EL o cualquiera de sus alias de catalogo
      // (apagador==interruptor, nordico==nordik): si no, "all" se cae y perdemos el +50.
      let hit = 0;
      for (const a of aliasDe(t)){
        if (words.includes(a)) { hit = 10; break; }
        if (a.length>=3 && d.includes(a)) hit = Math.max(hit, 5);
      }
      if (hit) s += hit; else all = false;
    }
  }
  // El catalogo SIEMPRE empieza por la categoria ("PEGA SOLDADURA PVC...", "TUBO PVC...").
  // Si la descripcion ARRANCA con el sustantivo principal de la consulta es, casi seguro,
  // lo que el cliente pidio; si solo lo menciona de pasada, no. Sin esto un sustantivo
  // incidental secuestra el ranking: "pega para tubo pvc que aguante humedad" devolvia
  // TUBO PVC, porque el producto correcto fallaba el token "tubo" y perdia el +50 de abajo.
  const _head = qTokens.find(t => !/\d/.test(t));
  if (_head && words.length && aliasDe(_head).some(a => singular(words[0]) === singular(a))) s += 30;
  if (all && qTokens.length>0) s += 50;
  s -= words.length * 0.1;
  return s;
}
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
module.exports = { nUSD, nBs, nBsInt, tc, norm, normMedida, SIZEQ, INCH_MM, medPresent, SIN, ALIAS, aliasDe, ACCENTS, COLOR_STEM, stemColor, singular, expandir, esGranel, scoreMatch, parseItems };
