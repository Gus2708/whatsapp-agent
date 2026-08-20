// buscar_productos v11 — relajacion drop-one, parcial honesto (medida inexistente), equivalencias 110v/4x4/3.60, fuzzy trgm, aprendizaje +/- de empleados, aclarar consulta vaga
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
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
  'lavaplatos':'fregadero','lavaplato':'fregadero','lava platos':'fregadero','lava plato':'fregadero','elegante':'lujo','corrugada':'estriada','corrugado':'estriado','varilla':'cabilla','varillas':'cabilla','cabillas':'cabilla',
  'simento':'cemento','simanto':'cemento','saco de cemento':'cemento','bolsa de cemento':'cemento','saco cemento':'cemento','bolsa cemento':'cemento',
  'clavillo':'clavos',
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
  // En contexto de soldadura se SUELTA la palabra en vez de traducirla: "soldar"/"7018" ya
  // identifican el producto, y mapearla a 'soldar' producia "soldar de soldar 7018".
  else if (/\bvarillas?\b/.test(s) && /soldar|soldadura|7018|6013|6011/.test(s)) s = s.replace(/\bvarillas?\b\s*/g, '');
  // "cinta aislante" existe TAL CUAL en el catalogo; mapearla a teipe la volvia
  // inencontrable. Se deja pasar y que el resto de los tokens desempate.
  s = s.replace(/\btriple a\b/g, 'aaa');
  // "hierro" solo significa CABILLA cuando va solo. Con otro sustantivo de cabeza es el
  // material ("mecha de hierro", "lima para hierro") y mapearlo a cabilla devolvia cabillas.
  if (/\bhierro\b/.test(s)) {
    if (/\btubos?\b/.test(s)) s = s.replace(/\btubos?\s+(de\s+)?hierro\b/g, 'tubo herreria');
    else if (/\b(mecha|mechas|lima|limas|sierra|sierras|alambre|alambres|tornillos?|clavos?|disco|discos|plancha|planchas|lamina|laminas|angulo|angulos|pletina|pletinas|malla|mallas)\b/.test(s)) s = s.replace(/\s*\b(de\s+)?hierro\b/g, '');
  }
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
  // SIN se aplica con LIMITE DE PALABRA, no como subcadena. Con split/join naive, una clave
  // que aparece DENTRO de otra palabra la destroza: "media"->"1/2" convertia "mediano" en
  // "1/2no", "zinc"->"lamina zinc" convertia "zincada" en "lamina zincada", y "riel" rompia
  // "p/riel". Eran 9 colisiones vivas (scripts/_audit_sin.js las lista). Mismo criterio que
  // aplicarVocabulario() para el diccionario de la BD, donde este bug ya habia mordido.
  const ks=Object.keys(SIN).sort((a,b)=>b.length-a.length);
  for(const k of ks){
    if(!s.includes(k)) continue;                                  // descarte rapido
    const re=new RegExp('(^|\\s)'+k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=\\s|$)','g');
    s=s.replace(re,(m,pre)=>pre+SIN[k]);
  }
  return s.replace(/\s+/g,' ').trim(); }
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

async function getRecargo(){ try { const r = await axios.get(SB+'/rest/v1/presupuesto_config?id=eq.1&select=markup_porcentaje',{headers:H}); const p = r.data && r.data[0] && Number(r.data[0].markup_porcentaje); return (p!=null && !isNaN(p)) ? 1+(p/100) : 1.30; } catch(e){ return 1.30; } }
async function getTasa(){ try { const r = await axios.get(SB+'/rest/v1/tazas?nombre=eq.actual&select=bcv_usd',{headers:H}); return r.data && r.data[0] && Number(r.data[0].bcv_usd); } catch(e){ return null; } }

const { p_busqueda } = query;

const IGNORED = new Set([
  'de', 'y', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'o', 'que', 'es', 'son', 'me', 'te', 'se', 'le', 'les', 'lo', 'mi', 'tu', 'su', 'ya', 'si', 'no', 'en', 'pero', 'aunque', 'entonces',
  'bs', 'bolivares', 'bolivar', 'dolar', 'dolares', 'divisas', 'usd',
  'importa', 'marca', 'modelo', 'solo', 'sola', 'mismo', 'misma', 'igual', 'cualquier', 'cualquiera', 'tambien', 'ambos', 'ambas',
  'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'eso', 'esos', 'esas', 'aqui', 'aca', 'alla', 'ahi', 'hoy', 'ahora', 'pues', 'ud', 'uds', 'usted', 'ustedes',
  // Saludos y muletillas. Sin esto, un simple "como esta todo" cotizaba 4 productos: el
  // token "todo" casa con "Disco P/lijad TODO" y "SueldaTODO", asi que la consulta parecia
  // tener contenido y el guardia de consulta vaga no saltaba.
  'todo', 'toda', 'todos', 'todas', 'como', 'asi', 'buenas', 'buenos', 'dia', 'dias', 'tarde', 'tardes', 'noche', 'noches',
  'saludos', 'gracias', 'favor', 'porfavor', 'porfa', 'amigo', 'amiga', 'hermano', 'disculpe', 'disculpa', 'bendiciones',
  'venden', 'vendes', 'vende', 'vendera', 'venderan', 'tienen', 'tiene', 'tienes', 'tenes', 'tendra', 'tendras', 'tendran', 'tuviera', 'tuvieran', 'habra', 'hay', 'sera', 'seria', 'sirve', 'sirven',
  // Verbos de cualidad: el cliente los usa para describir ("pega que AGUANTE humedad") pero
  // no son parte del nombre del producto. Si cuentan como palabra de contenido, el ilike
  // exige que aparezcan en la descripcion y el producto correcto NO entra ni a los candidatos.
  'aguante', 'aguanta', 'aguantan', 'aguantar', 'resista', 'resiste', 'resistan', 'soporte', 'soporta', 'soporten', 'dure', 'dura', 'duren',
  'disponible', 'disponibles', 'disponibilidad', 'existencia', 'stock', 'quedan', 'queda',
  'quiero', 'quisiera', 'queria', 'quiere', 'quieres', 'deseo', 'busco', 'comprar', 'necesito', 'dame', 'trae', 'ver', 'saber', 'hacer', 'meter', 'poner', 'echar', 'hechar',
  'puede', 'puedes', 'puedo', 'pueden', 'podria', 'podrias',
  'dijeron', 'dijo', 'dice', 'dicen', 'dime', 'digame', 'decir', 'habia', 'habian', 'llego', 'llegaron', 'llegado', 'pregunta', 'pregunte', 'preguntar', 'preguntarle', 'preguntarles',
  'regala', 'regalas', 'regalame', 'pasame', 'pasa', 'pasas', 'pasan', 'pasar', 'pasarme', 'mandame', 'manda', 'mandas', 'mandar', 'envia', 'enviame', 'enviar', 'mostrar', 'muestrame', 'ensename', 'ensenar', 'dar', 'darme',
  'foto', 'fotos', 'fotico', 'foticos', 'imagen', 'imagenes',
  'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'sale', 'salen', 'precio', 'precios', 'presio', 'presios', 'costo', 'como', 'cual', 'cuales', 'cuando', 'quien',
  'color', 'ml', 'pulgada', 'pulgadas', 'pulg',
  'numero', 'numeros', 'nro', 'num',
  'disponible', 'disponibles', 'disponibilidad', 'stock',
  'rollo', 'rollos', 'saco', 'sacos', 'bolsa', 'bolsas', 'unidad', 'unidades', 'pieza', 'piezas', 'kilo', 'kilos', 'kg',
  'metro', 'metros', 'mts', 'caja', 'cajas', 'galon', 'galones', 'para', 'con', 'del', 'algo', 'vender', 'por', 'al', 'cada',
  'tener', 'buscar', 'amigo', 'amiga', 'hermano', 'hermana', 'varon', 'vecino', 'vecina', 'pana', 'senor', 'senora',
  'buenas', 'buenos', 'buen', 'hola', 'tardes', 'tarde', 'dias', 'dia', 'noches', 'noche', 'saludos', 'saludo', 'bendicion', 'bendiciones',
  'porfa', 'favor', 'porfavor', 'xfavor', 'xfavr', 'xfa', 'fa', 'plis', 'gracias', 'ok', 'listo',
  'una', 'uno', 'unas', 'unos', 'donde'
]);
const MODIFIERS = new Set([
  'multifuncional', 'pulgada', 'pulgadas', 'media', 'cuarto', 'octavo', 'metro', 'metros', 'pies', 'pulg', 'mm', 'cm', 'mts',
  'negro', 'negra', 'blanco', 'blanca', 'gris', 'azul', 'rojo', 'verde', 'amarillo', 'amarilla'
]);

// "5 metros de cable" / "2 sacos de cemento": el numero es CANTIDAD, no medida del producto
const _pb = String(p_busqueda==null?'':p_busqueda).replace(/\b\d+(?:[.,]\d+)?\s*(metros?|mts?|mtrs|kilos?|kg|sacos?|unidades?|rollos?)\s+de\s+/gi, '$1 de ');

// tokenizador (mismo pipeline para consulta, aprendizaje y negativa)
function tokensDe(t){ return normMedida(t).split(' ').filter(w => (w.length>=2 || /\d/.test(w)) && !IGNORED.has(w)).map(w => /\d/.test(w) ? w : singular(stemColor(w))); }

// DICCIONARIO DEL CATALOGO: vocabulario generado por el LLM leyendo los 7.5k productos
// (tabla catalogo_vocabulario, ver scripts/generar_vocabulario.js). Traduce como habla
// el cliente a como escribe el catalogo: "tubo de herrero" -> "tubo herreria",
// "cincho" -> "abrazadera", "foco" -> "bombillo".
//
// OJO — se aplica por LIMITE DE PALABRA, no como subcadena (que es lo que hace expandir()
// con SIN). Con 93 claves curadas a mano la subcadena era inofensiva; con miles generadas
// es destructiva: el termino legitimo "te" -> "tee pvc" convertia "plateado" en
// "platee pvcado" y "tendran" en "tee pvcndran", rompiendo busquedas que antes servian.
// Si la consulta a Supabase falla, se sigue sin diccionario: la busqueda NUNCA debe caerse.
let _vocabRe = null; const _vocabMap = new Map();
try {
  const _vg = await axios.get(SB + '/rest/v1/catalogo_vocabulario?select=termino,canonico&activo=eq.true&limit=20000', { headers: H });
  const _vs = (_vg.data || []).filter(v => v.termino && v.canonico && SIN[v.termino] === undefined);
  _vs.sort((a, b) => b.termino.length - a.termino.length); // el mas largo gana
  for (const _v of _vs) _vocabMap.set(_v.termino, _v.canonico);
  if (_vs.length) {
    const _esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    _vocabRe = new RegExp('(^|\\s)(' + _vs.map(v => _esc(v.termino)).join('|') + ')(?=\\s|$)', 'g');
  }
} catch (e) { console.warn('[vocabulario] no se pudo cargar, sigo sin diccionario:', e.message); }

function aplicarVocabulario(t){
  if (!_vocabRe) return t;
  return norm(t).replace(_vocabRe, (m, pre, term) => pre + (_vocabMap.get(term) || term));
}

const _pbv = aplicarVocabulario(_pb);
const termExp = normMedida(expandir(_pbv));
const qTokens = tokensDe(expandir(_pbv));
const qTokensRaw = tokensDe(_pb); // SIN sinonimos: para casar contra aprendizaje/negativa guardados
const qRawSet = new Set(qTokensRaw);
// Un "0" suelto no es una medida: no dice nada del producto, pero casa con "AL 0%" y hacia
// que un mensaje de puro ruido ("0;  b b.") devolviera varillas de soldar. Las medidas de
// verdad ("0.30", "3/8", "2x2", "12") siguen entrando.
const largas = qTokens.filter(w => (w.length>=3 || /\d/.test(w)) && w !== '0');
const textLargas = largas.filter(w => !/\d/.test(w));
const medLargas = largas.filter(w => /\d/.test(w));

// consulta VAGA (sin ningun producto concreto): preguntar, no escalar
if (largas.length===0) return JSON.stringify({ encontrados:0, aclarar:true, instruccion:'La consulta NO menciona ningun producto concreto. NO uses [PEDIR_AYUDA] y NO digas que no lo encontraste: preguntale al cliente con calidez QUE producto necesita (nombre del producto, y si aplica la medida o marca).', mensaje:'Consulta sin producto: "' + p_busqueda + '"' });

// APRENDIZAJE: productos que un empleado ya eligio para consultas como esta
let aprBoost=[];
try{
  const _aprR=await axios.get(SB+'/rest/v1/busqueda_aprendizaje?select=termino_raw,termino_tokens,codigo_producto&order=usos.desc&limit=500',{headers:H});
  const _aprCodes=[];
  for(const _r of(_aprR.data||[])){
    const _rT=[...new Set(tokensDe(_r.termino_raw || _r.termino_tokens || ''))];
    if(_rT.length>=1 && _rT.length<=6 && _rT.every(t=>qRawSet.has(t)) && _aprCodes.indexOf(_r.codigo_producto)===-1) _aprCodes.push(_r.codigo_producto);
  }
  if(_aprCodes.length>0){
    const _cf=_aprCodes.slice(0,10).map(c=>encodeURIComponent(c)).join(',');
    const _pr=await axios.get(SB+'/rest/v1/productos?codigo_interno=in.('+_cf+')&select=codigo_interno,descripcion,precio_venta,existencia',{headers:H});
    aprBoost=(_pr.data||[]).map(p=>({...p,_aprendido:true}));
  }
}catch(e){}

// NEGATIVO: consultas que un empleado ya marco como "no lo vendemos" (caducidad 90 dias)
//
// La condicion es NEGATIVO ⊆ CONSULTA: solo se niega si el cliente pide algo AL MENOS tan
// especifico como lo que el empleado descarto. Es la misma direccion que usa el aprendizaje
// positivo de arriba (_rT.every(t=>qRawSet.has(t))).
//
// Al reves (consulta ⊆ negativo) el radio de daño CRECE con cada marca del empleado, porque
// cuanto MAS GENERAL pregunta el cliente, mas facil le niegan el producto. Paso en vivo: un
// empleado marco "angulo de 2x1 de 1 milimetro" (una medida que de verdad no existe) el
// 2026-07-23 a las 19:11, y esa misma noche a las 21:05 el bot empezo a responder "no
// manejamos angulos" teniendo 5 angulos en stock; lo repitio el 24/07 y el 03/08. Con solo
// 4 filas en la tabla ya negaba tambien "agua", "motor", "estructura" y "huecos".
// Medido en scripts/_diag_negativa.js: 10/14 veredictos equivocados antes, 0/14 despues.
//
// Ojo: NO filtrar MODIFIERS de los tokens del negativo. Quitarlos lo vuelve mas corto y por
// tanto MAS facil de satisfacer: un negativo "lamina blanca" quedaria en {lamina} y negaria
// cualquier lamina. Se exigen todos sus tokens tal cual.
async function esNoVendido(){
  try{
    const _lim = new Date(Date.now()-90*24*3600*1000).toISOString();
    const r = await axios.get(SB+'/rest/v1/busqueda_negativa?select=termino_raw&creado_en=gte.'+encodeURIComponent(_lim)+'&limit=200',{headers:H});
    if(qRawSet.size===0) return false;
    for(const nrow of (r.data||[])){
      const _nt = [...new Set(tokensDe(nrow.termino_raw||''))];
      if(_nt.length>0 && _nt.length<=8 && _nt.every(t=>qRawSet.has(t))) return true;
    }
  }catch(e){}
  return false;
}
const NO_VENDIDO_JSON = () => JSON.stringify({ encontrados:0, no_vendido:true, instruccion:'Un empleado ya CONFIRMO antes que este producto NO lo trabajamos. NO uses [PEDIR_AYUDA]: dile al cliente con calidez y honestidad que ese producto no lo manejamos y ofrecele ayudar con otra cosa de la ferreteria.', mensaje:'"' + p_busqueda + '" esta marcado como no vendido.' });

// Si un empleado YA marco esta consulta como "no la vendemos" y no hay aprendizaje que la
// resuelva, cortamos aqui. El aprendizaje manda sobre el negativo: si un empleado eligio un
// producto concreto para una consulta asi, ese hallazgo es mas fresco que la marca negativa.
if (aprBoost.length===0 && await esNoVendido()) return NO_VENDIDO_JSON();

const granelIntent = /\b(por|al|x|cada|el|un|1)\s*(metro|metros|mt|mts)\b/.test(norm(_pb)) || /\bmetros?\s+de\b/.test(norm(_pb));
const rolloIntent = /\b(rollos?)\b/.test(norm(p_busqueda||'')); // "rollo de cable" -> rollo completo, no por metro

const GRANEL_OR = 'or=(descripcion.ilike.*x mt*,descripcion.ilike.*x metro*,descripcion.ilike.*por metro*)';
async function ilike(palabras, limit, extra){
  const q = palabras.map(w => {
    if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
    if (SIZEQ[w]){ const _alts=[]; for (const a of SIZEQ[w]){ _alts.push('descripcion.ilike.*'+a+'*'); if(/mm$/.test(a)) _alts.push('descripcion.ilike.*'+a.replace(/mm$/,' mm')+'*'); } return 'or=('+_alts.join(',')+')'; }
    if (ALIAS[w]) return 'or=(' + ALIAS[w].map(a=>'descripcion.ilike.*'+a+'*').join(',') + ')';
    if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`;
    return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
  }).join('&');
  const url = SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+(extra?('&'+extra):'')+'&order=existencia.desc.nullslast&limit=1000';
  try { const r = await axios.get(url,{headers:H}); return r.data||[]; } catch(e){ return []; }
}
async function rpc(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_productos',{p_busqueda:t},{headers:H}); return r.data||[]; } catch(e){ return []; } }
async function fuzzy(t){ try { const r=await axios.post(SB+'/rest/v1/rpc/buscar_fuzzy',{p_term:t},{headers:H}); return (r.data||[]).map(p=>({codigo_interno:p.codigo_interno,descripcion:p.descripcion,precio_venta:p.precio_venta,existencia:p.existencia})); } catch(e){ return []; } }

// Fetch: si hay palabras de texto (categoria), trae amplio por categoria y filtra la medida en JS
// (las descripciones guardan las medidas con formatos inconsistentes, por eso no las metemos al ilike).
// Los ilike son de SUBCADENA ('%pega%' trae "Pegable"), lo cual esta bien para RECALL pero
// no para dar por buena la busqueda. Si NINGUN candidato casa por palabra, es un falso
// positivo del SQL: "pega para tubo pvc" devolvia un "Tubo PVC A/B Pegable" AGOTADO sin
// mencionar la pega, y encima impedia que corriera el drop-one porque el AND "encontro algo".
// Devolver [] deja que sigan las demas estrategias.
function casanDeVerdad(rows, tokens){
  const _t = (tokens||[]).filter(w => !/\d/.test(w) && w.length>=3);
  if (!rows || !rows.length || !_t.length) return rows || [];
  const ok = rows.filter(r => _t.every(w => aliasDe(w).some(a => casaPalabra(a, norm(r.descripcion)))));
  return ok.length ? ok : [];
}
let res = [];
let _fuzzy = false;
if (granelIntent && textLargas.length>0) res = casanDeVerdad(await ilike(textLargas, 60, GRANEL_OR), textLargas);
if (res.length===0 && textLargas.length>0) res = casanDeVerdad(await ilike(textLargas, 60), textLargas);
// RELAJACION drop-one: el AND completo fallo -> reintenta quitando UNA palabra a la vez,
// soltando primero la MENOS especifica (modificadores/colores/palabras cortas) y NUNCA
// dejando solo modificadores. Se queda con el primer intento que traiga resultados.
let _dropped = null; // palabra que la relajacion tuvo que ignorar (hay que confesarlo)
if (res.length===0 && textLargas.length>=2 && textLargas.length<=6){
  const _esMod = w => MODIFIERS.has(w) || COLOR_STEM[w] || stemColor(w)!==w;
  // La PRIMERA palabra de contenido es la categoria del producto; soltarla devuelve
  // cualquier cosa que comparta el adjetivo ("tornillos galvanizados" -> Bushing Galvanizado).
  // Orden de sacrificio: modificadores -> palabras posteriores mas cortas -> nunca la cabeza.
  const _rank = (w,i) => (_esMod(w)?0:1000) + (i===0?100000:0) + w.length;
  const _order = textLargas.map((_w,_i)=>_i).sort((a,b)=>_rank(textLargas[a],a)-_rank(textLargas[b],b));
  for (const _i of _order){
    const _sub = textLargas.filter((_w,_j)=>_j!==_i);
    if (_sub.every(_esMod)) continue; // no busques dejando solo modificadores
    const _r = casanDeVerdad(await ilike(_sub, 60), _sub);
    if (_r.length>0){ res=_r; _dropped=textLargas[_i]; break; }
  }
}
if (res.length===0 && largas.length>0) res = await ilike(largas, 30);
if (res.length===0 && largas.length>1) res = await ilike(largas.slice(0,2), 30);
if (res.length===0){
  const _solo = textLargas.filter(w => !MODIFIERS.has(w) && !IGNORED.has(w)).sort((a,b)=>b.length-a.length);
  for (const _w of _solo){ res = await ilike([_w], 30); if (res.length>0) break; }
}
if (res.length===0) res = await rpc(termExp);
if (res.length===0 && termExp!==norm(_pb)) res = await rpc(norm(_pb));
// ultimo recurso: busqueda difusa pg_trgm (typos fuertes)
if (res.length===0){ const _f = await fuzzy(norm(_pb)); if (_f.length>0){ res=_f; _fuzzy=true; } }
if (aprBoost.length>0) res=[...aprBoost,...res];
// RESCATE SEMANTICO — ultima red antes de rendirse.
// Lo lexico ya fallo (exacto, expandido, sinonimos, diccionario, fuzzy trgm). Aqui le
// pasamos a Luna la consulta + la lista de categorias reales del catalogo (~710 palabras,
// ~2k tokens) y le preguntamos a cual corresponde. Atrapa lo que ninguna tabla anticipa:
// "motor para hacer huecos para meter estanquillo" -> hoyadora.
//
// Solo se ejecuta cuando NO hay resultados (~2% de las busquedas): cero latencia y cero
// costo en el camino feliz. Lo que acierta se GUARDA en catalogo_vocabulario, asi que la
// proxima vez esa forma de pedirlo se resuelve sin LLM, gratis e instantanea.
let _rescate = null;
async function rescateSemantico(){
  const _k = (typeof $env !== 'undefined' && $env && $env.OPENROUTER_API_KEY) || '';
  if (!_k) return null;
  try {
    const _cr = await axios.get(SB + '/rest/v1/catalogo_vocab_categorias?select=categoria&order=productos.desc&limit=800', { headers: H });
    const _cats = (_cr.data || []).map(c => c.categoria);
    if (!_cats.length) return null;
    const _rr = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: 'openai/gpt-5.6-luna',
      temperature: 0.2,
      messages: [
        { role: 'system', content: 'Eres un ferretero venezolano. Te doy lo que pidio un cliente y la lista de CATEGORIAS reales de nuestro catalogo. Di a que categoria se refiere.\nResponde SOLO JSON: {"categoria":"<una EXACTA de la lista, o null si ninguna encaja>","termino":"<la palabra o frase corta que uso el cliente para nombrarlo>","confianza":1-5}\nSi no encaja NINGUNA con claridad, devuelve categoria null. Es preferible decir null que adivinar mal.' },
        { role: 'user', content: 'Cliente pidio: "' + p_busqueda + '"\n\nCategorias: ' + _cats.join(', ') },
      ],
      response_format: { type: 'json_object' },
    }, { headers: { Authorization: 'Bearer ' + _k, 'Content-Type': 'application/json' }, timeout: 12000 });
    const _j = JSON.parse(_rr.data.choices[0].message.content);
    if (!_j || !_j.categoria || !_cats.includes(norm(_j.categoria))) return null;
    if ((_j.confianza || 0) < 3) return null;
    return { categoria: norm(_j.categoria), termino: norm(_j.termino || ''), confianza: _j.confianza };
  } catch (e) { console.warn('[rescate] fallo:', e.message); return null; }
}

// BUSQUEDA VECTORIAL (pgvector + OpenAI text-embedding-3-small sobre productos_embedding).
// Va ANTES del rescate con Luna porque es ~80x mas rapida y mas barata, pero con umbral
// ALTO y a proposito: medido sobre este catalogo, el suelo de ruido es altisimo
// ("asdfgh qwerty" puntua 0.467, casi lo mismo que una consulta legitima). Las
// descripciones son codigos de SKU cortos, no prosa, asi que el vector captura sobre todo
// solapamiento lexico — lo que pg_trgm ya hace. Donde SI gana es en variantes de nombre:
// "tapa para el bano" -> TAPA DE INODORO (0.619). Por debajo de 0.58 no aporta senal, solo
// ruido con cara de resultado, y es mejor dejar que responda Luna.
// Devuelve { filas, simLex }. simLex = que tan cerca esta SEMANTICAMENTE el primer
// resultado lexico de lo que pidio el cliente. Es la senal que decide si adoptar el vector:
// medido, el lexico ACIERTA con 0.606 y se EQUIVOCA con 0.443 y 0.399, asi que un corte en
// 0.52 los separa con margen por ambos lados. Ni "categoria distinta" (demasiado estricto)
// ni "producto distinto" (demasiado laxo) median si el lexico habia acertado.
async function buscarVectorial(_codLex){
  const _k = (typeof $env !== 'undefined' && $env && $env.OPENAI_API_KEY) || '';
  if (!_k) return { filas: [], simLex: null };
  try {
    const _e = await axios.post('https://api.openai.com/v1/embeddings',
      { model: 'text-embedding-3-small', input: String(p_busqueda).slice(0, 500), dimensions: 1536 },
      { headers: { Authorization: 'Bearer ' + _k, 'Content-Type': 'application/json' }, timeout: 9000 });
    const _v = _e.data && _e.data.data && _e.data.data[0] && _e.data.data[0].embedding;
    if (!_v) return { filas: [], simLex: null };
    // Umbral 0.45 (antes 0.58). Con los embeddings v2 (texto enriquecido con categoria y
    // vocabulario coloquial) el suelo de ruido se desplomo: basura puntua 0.364-0.368 y la
    // peor consulta legitima 0.491, o sea margen 0.123 frente a los 0.012 de v1. Por eso
    // ahora SI existe un umbral que separa senal de ruido, y puede ser mas permisivo.
    const _r = await axios.post(SB + '/rest/v1/rpc/buscar_semantico',
      { p_embedding: JSON.stringify(_v), p_umbral: 0.45, p_limite: 8 }, { headers: H });
    // Similitud del top lexico contra el MISMO embedding: lookup por PK, no scan.
    let _sl = null;
    if (_codLex) {
      try {
        const _s = await axios.post(SB + '/rest/v1/rpc/similitud_de_codigos',
          { p_embedding: JSON.stringify(_v), p_codigos: [_codLex] }, { headers: H });
        if (Array.isArray(_s.data) && _s.data[0]) _sl = Number(_s.data[0].similitud);
      } catch (e) { /* sin simLex se cae al comportamiento anterior */ }
    }
    return { filas: Array.isArray(_r.data) ? _r.data : [], simLex: _sl };
  } catch (e) { console.warn('[vectorial] fallo:', e.message); return { filas: [], simLex: null }; }
}
// Por debajo de esto, lo que trajo la busqueda lexica no tiene que ver con lo que pidio el
// cliente. Medido: acierta 0.606; se equivoca 0.443 y 0.399.
const UMBRAL_LEXICO_FIABLE = 0.52;

if (res.length===0){
  if (await esNoVendido()) return NO_VENDIDO_JSON();
  // Sin resultados lexicos no hay nada que comparar: cualquier propuesta del vector mejora.
  const _vec = (await buscarVectorial(null)).filas;
  if (_vec.length > 0){
    res = _vec;
    // Tratado como HIPOTESIS igual que el rescate: es una interpretacion, no un hallazgo.
    _rescate = { categoria: norm(_vec[0].descripcion).split(' ')[0], termino: '', confianza: 4 };
  }
  const _rs = res.length===0 ? await rescateSemantico() : null;
  if (_rs){
    const _rr2 = await rpc(_rs.categoria);
    if (_rr2.length > 0){
      res = _rr2; _rescate = _rs;
      // Aprender: la proxima vez esta forma de pedirlo no gasta LLM. Mismas guardas que
      // el generador: solo si el termino del cliente no es ya el nombre de la categoria.
      if (_rs.termino && _rs.termino !== _rs.categoria && _rs.termino.length >= 3){
        try {
          await axios.post(SB + '/rest/v1/catalogo_vocabulario?on_conflict=termino',
            [{ termino: _rs.termino, canonico: _rs.categoria, categoria: _rs.categoria, origen: 'rescate', confianza: Math.min(5, Math.max(3, _rs.confianza)) }],
            { headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) });
        } catch (e) { console.warn('[rescate] no pude guardar el aprendizaje:', e.message); }
      }
    }
  }
  if (res.length===0) return JSON.stringify({ encontrados:0, instruccion:'NO encontre este producto. Tu UNICA respuesta valida ahora es el token [PEDIR_AYUDA] (escribelo solo, exactamente asi, sin saludo ni nada mas). PROHIBIDO sugerir alternativas, pedir que reformule o decir que no lo tenemos: un empleado lo elegira y se lo enviara al cliente.', mensaje:'No encontre "' + p_busqueda + '" en el catalogo.' });
}

// PERIFRASIS: el cliente describe PARA QUE sirve en vez de nombrarlo ("lo que se usa para
// pegar los bloques", "aparato para medir la corriente"). Aqui lo lexico SI devolvio algo,
// pero secuestrado por una palabra incidental: "pegar los bloques" -> Bloque #10, que es
// peor que no devolver nada porque el bot lo cotiza con total seguridad.
// Solo adoptamos la lectura de Luna si DISCREPA de la categoria que trajo lo lexico: si
// coinciden, lo lexico ya estaba bien y no se toca. Va aqui, sobre las filas CRUDAS, para
// no tener que rehacer el formateo de mas abajo.
// SECUESTRO POR PALABRA INCIDENTAL: lo lexico devolvio algo, pero su primer resultado NO
// empieza por el sustantivo principal de la consulta. El catalogo SIEMPRE empieza por la
// categoria, asi que eso delata que gano un producto por una palabra de paso:
// "tapa para el bano" -> "Tapa P/toma 270". Aqui la capa vectorial SI aporta (con los
// embeddings v2 devuelve TAPA DE INODORO a 0.601), y es ~80x mas barata que preguntarle
// a Luna, asi que se intenta primero. Solo se adopta si DISCREPA de lo lexico.
if (!_rescate && res.length > 0){
  // Senal de secuestro: al primer resultado le FALTA alguna palabra de la consulta.
  // "tapa para el bano" -> "Tapa P/toma 270" comparte "tapa" pero no "bano". Mirar solo
  // el sustantivo principal no bastaba, porque en ese caso tambien coincide.
  // Si estan TODAS (p.ej. "cemento gris" -> "Cemento Gris CSC"), lo lexico acerto y no se
  // llama a OpenAI: el camino feliz sigue costando ~750 ms y cero.
  const _d0 = norm(res[0].descripcion || '');
  const _falta = qTokens.filter(t => !/\d/.test(t)).some(t => !aliasDe(t).some(a => _d0.includes(a)));
  if (_falta){
    const _vr = await buscarVectorial(res[0].codigo_interno);
    const _vec = _vr.filas;
    const _vcat = _vec.length ? norm(_vec[0].descripcion || '').split(' ')[0] : '';
    // Se adopta el vector solo si lo LEXICO se equivoco, medido semanticamente. Si simLex
    // no se pudo calcular, se cae a la regla anterior (categoria distinta) para no quedarse
    // sin criterio. "disco de corte" sobrevive porque su lexico puntua 0.606: acerto.
    const _lexFalla = _vr.simLex !== null ? (_vr.simLex < UMBRAL_LEXICO_FIABLE)
                                          : (_vcat !== _d0.split(' ')[0]);
    if (_vec.length > 0 && _lexFalla){
      res = _vec;
      _rescate = { categoria: _vcat, termino: '', confianza: 4 };
    }
  }
}

// PERIFRASIS: el cliente describe PARA QUE sirve en vez de nombrarlo. Aqui manda Luna,
// no el vector: medido, el vector daba "Juego de Mechas" y "Pega Loka" donde Luna acierta
// cemento y cizalla. Solo se adopta si DISCREPA de lo lexico.
if (!_rescate && res.length > 0 &&
    /\b(algo|eso|cosa|aparato|maquina|herramienta)\s+(para|que|de)\b|\blo que (se )?(usa|sirve|echa|pone|hecha)\b|\bcon que\b|\bque me sirva\b|\bsirve para\b/.test(norm(_pb))){
  const _rp = await rescateSemantico();
  if (_rp && _rp.categoria !== norm(res[0].descripcion || '').split(' ')[0]){
    const _rows = await rpc(_rp.categoria);
    if (_rows.length > 0){ res = _rows; _rescate = _rp; }
  }
}

// dedup
const unicos=[]; const seen=new Set();
for(const p of res){ if(!seen.has(p.codigo_interno)){ seen.add(p.codigo_interno); unicos.push(p); } }

// Regla negocio CEMENTO: generico = solo gris; otros tipos solo si los piden
{ const nbq = norm(_pb); if (qTokens.includes('cemento')) { let tipo='gris'; if(nbq.includes('blanco')) tipo='blanco'; else if(nbq.includes('asfalt')||nbq.includes('plastic')||nbq.includes('bituplast')||nbq.includes('edil')) tipo='plastico'; else if(nbq.includes('contacto')||nbq.includes('pega')) tipo='contacto'; const matchTipo=(d)=>{ d=norm(d); if(tipo==='blanco') return d.includes('blanco'); if(tipo==='plastico') return d.includes('plastico')||d.includes('bituplast')||d.includes('edil')||d.includes('asfalt'); if(tipo==='contacto') return d.includes('contacto')||d.includes('pega'); return d.includes('cemento gris'); }; const filt = unicos.filter(p => matchTipo(p.descripcion)); if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }

// Regla negocio CABILLA: generico = solo ESTRIADA (12mm=1/2, 10mm=3/8 son las principales). Redonda/Cuadrada/Lisa solo si las piden.
{ const nbq = norm(_pb); if (qTokens.includes('cabilla')) { const wantCuadrada=nbq.includes('cuadrada'); const wantRedonda=nbq.includes('redonda'); const wantLisa=nbq.includes('lisa'); let filt=null; if(wantCuadrada||wantRedonda||wantLisa){ filt = unicos.filter(p => { const d=norm(p.descripcion); if(wantCuadrada) return d.includes('cuadrada'); if(wantRedonda) return d.includes('redonda'); if(wantLisa) return d.includes('lisa'); return true; }); } else { const est = unicos.filter(p => norm(p.descripcion).includes('estriada')); if (medLargas.length>0){ const estM = est.filter(p=>{ const nd=normMedida(p.descripcion); return medLargas.every(m=>medPresent(m,nd)); }); filt = (estM.length>0) ? est : null; } else { filt = est; } } if (filt && filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); } } }

// Regla negocio FREGADERO: "fregadero"/"lavaplatos" a secas = el mueble en si, no sus repuestos.
// Los repuestos (DESAGUE/LLAVE/GRIFO/TAPA/SIFON ... FREGADERO) tienen mas existencia que el
// fregadero completo y ganaban el desempate por stock, tapando el producto que el cliente pidio.
// Si el cliente SI pidio un repuesto por su nombre, no tocar el resultado.
{ const nbq = norm(_pb); const accesorioFregadero = /\b(desague|l{1,3}ave|grifo|tapa|sifon|tapon|tornillo|herraje|balancin)\b/; if (qTokens.includes('fregadero') && !accesorioFregadero.test(nbq)) { const principal = unicos.filter(p => !accesorioFregadero.test(norm(p.descripcion))); if (principal.length>0){ unicos.length=0; for(const x of principal) unicos.push(x); } } }

// Si pidio "por metro", prioriza los productos a granel (X MT)
if (granelIntent){
  const g = unicos.filter(p => esGranel(p.descripcion));
  if (g.length>0){ unicos.length=0; for(const x of g) unicos.push(x); }
}
// Si pidio "rollo", prioriza el rollo COMPLETO (no las versiones por metro "X MT")
if (rolloIntent && !granelIntent){
  const r = unicos.filter(p => !esGranel(p.descripcion));
  if (r.length>0){ unicos.length=0; for(const x of r) unicos.push(x); }
}

// Filtro de MEDIDA: si el cliente dio medidas, deja solo los que las cumplen TODAS.
// Si NINGUNO cumple todas pero dio VARIAS medidas (ej. "cable 8 12"), prueba cada una por separado.
let medMismatch = false;
let medParcial = null;
if (medLargas.length>0){
  const filt = unicos.filter(p => { const nd=normMedida(p.descripcion); return medLargas.every(m => medPresent(m, nd)); });
  if (filt.length>0){ unicos.length=0; for(const x of filt) unicos.push(x); }
  else if (medLargas.length>=2){
    const _hit=[]; const _ok=[];
    for (const m of medLargas){ const fm=unicos.filter(p=>medPresent(m, normMedida(p.descripcion))); if(fm.length>0){ _ok.push(m); for(const x of fm) if(_hit.indexOf(x)===-1) _hit.push(x); } }
    if (_hit.length>0){ unicos.length=0; for(const x of _hit) unicos.push(x); medParcial={ si:_ok, no: medLargas.filter(m=>_ok.indexOf(m)===-1) }; }
    else medMismatch = true;
  }
  else medMismatch = true; // pidio una medida/calibre que NINGUN producto tiene -> no sustituir a ciegas
}

// ventas para desempate
const codes=unicos.map(p=>p.codigo_interno).slice(0,40);
let vMap={};
try{ const vr=await axios.post(SB+'/rest/v1/rpc/popularidad_productos',{p_codigos:codes},{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=Number(v.total); }catch(e){}

// ¿la descripcion cumple TODOS los tokens de la consulta? (misma condicion que el +50 de
// scoreMatch, pero como booleano: separa "esto es exactamente lo que pidio" de "se acerca").
// Coincidencia de PALABRA, no de subcadena. "pega" no debe casar con "pegable": eso hacia
// que TEE PVC PEGABLE contara como coincidencia COMPLETA de "pega para pvc" y, al empatar,
// el desempate por ventas la pusiera por encima de la PEGA SOLDADURA de verdad (3.52 vs
// 3.34 de score). Se admite el plural o derivado corto (clavo->clavos, lamina->laminas):
// hasta 2 letras de mas y luego limite de palabra. Se prueba contra `d` y no contra `words`
// porque words parte por 'x' y romperia "oxido"/"exxel".
function casaPalabra(a, d){
  if (!a || a.length < 3) return false;
  const esc = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + esc + '[a-z]{0,2}([^a-z0-9]|$)').test(d);
}
function fullMatch(descripcion, qTokens){
  const d = norm(descripcion);
  const nd = normMedida(descripcion);
  const words = d.split(/[\s\-x]+/);
  for (const t of qTokens){
    if (t === 'corte'){ if (!(words.includes('corte') || words.includes('c/') || d.includes('c/'))) return false; continue; }
    if (/\d/.test(t)){ if (!medPresent(t, nd)) return false; continue; }
    let hit = false;
    for (const a of aliasDe(t)){ if (words.includes(a) || casaPalabra(a, d)){ hit=true; break; } }
    if (!hit) return false;
  }
  return qTokens.length > 0;
}
// ordenar: aprendido primero; entre los que cumplen TODO lo pedido manda quien mas se vende
// (en stock primero); entre coincidencias parciales manda la relevancia, como antes.
unicos.sort((a,b)=>{
  if (!!a._aprendido !== !!b._aprendido) return a._aprendido ? -1 : 1;
  // POPULARIDAD vs SEMANTICA. Si el conjunto lo trajo la capa vectorial, sus filas llevan
  // `similitud` y ESE es el orden bueno. Sin esto, "algo para cortar cabilla" adoptaba
  // TENAZA CABILLERA (0.608) y el desempate por ventas la hundia bajo Cabilla Estriada,
  // porque las cabillas se venden muchisimo mas que las tenazas: la senal de ventas
  // deshacia la correccion semantica justo despues de acertarla.
  // Las ventas siguen mandando entre productos de similitud PARECIDA (<0.03), que es donde
  // aportan de verdad: elegir la variante que la gente compra dentro de lo ya relevante.
  if (_rescate && typeof a.similitud === 'number' && typeof b.similitud === 'number'){
    const _dsim = b.similitud - a.similitud;
    if (Math.abs(_dsim) >= 0.03) return _dsim;
    return (vMap[b.codigo_interno]||0) - (vMap[a.codigo_interno]||0);
  }
  const aFull = fullMatch(a.descripcion, qTokens), bFull = fullMatch(b.descripcion, qTokens);
  if (aFull !== bFull) return aFull ? -1 : 1;
  const aStock = esGranel(a.descripcion) || Number(a.existencia) > 0;
  const bStock = esGranel(b.descripcion) || Number(b.existencia) > 0;
  if (aFull && bFull){
    if (aStock !== bStock) return aStock ? -1 : 1;
    const dv = (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
    if (dv !== 0) return dv;
    return scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
  }
  const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
  if(Math.abs(ds)>2) return ds; // dif. pequeña = solo ruido de conteo de palabras -> desempata disponibilidad
  if (aStock !== bStock) return aStock ? -1 : 1;
  return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
});

const tasa = await getTasa();
const RECARGO = await getRecargo();
const productos = unicos.slice(0,4).map(p=>{
  const usd=Number(p.precio_venta); const bsUsd=usd*RECARGO;
  const disp = esGranel(p.descripcion) || Number(p.existencia) > 0;
  return { nombre: tc(p.descripcion), disponible:disp, precio_divisas_texto: nUSD(usd)+'$',
    precio_bs_texto: tasa ? (nUSD(bsUsd)+'$ o '+nBs(bsUsd*tasa)+'bs') : (nUSD(bsUsd)+'$ (tasa BCV no disponible)') };
});
const _out = { encontrados:productos.length, tasa_bcv:tasa, productos };

// ¿el mejor resultado es de OTRA categoria? (no comparte NINGUNA palabra con lo pedido: coincidio de casualidad)
let _weak = false;
// _rescate excluido igual que _fuzzy: por definicion un rescate semantico devuelve algo que
// NO comparte palabras con lo que escribio el cliente ("motor para hacer huecos" -> hoyadora),
// asi que _weak lo marcaria como coincidencia de casualidad y anularia el rescate entero.
if (!_fuzzy && !_rescate && textLargas.length>0 && unicos.length>0 && !unicos[0]._aprendido){
  // ¿aparece alguna palabra de categoria (ya en singular/raiz) en la descripcion?
  // Usamos includes (no split por 'x') para no partir "oxido"/"exxel" ni fallar por plural (tornillo⊂tornillos).
  const _wd = norm(unicos[0].descripcion);
  if (!textLargas.some(t => aliasDe(t).some(a => _wd.includes(a)))) _weak = true;
}
if (_rescate){
  // Nunca presentar una interpretacion como certeza: es una HIPOTESIS y hay que confirmarla.
  _out.parcial = true;
  _out.rescate = _rescate.categoria;
  _out.instruccion = 'OJO: el cliente NO uso las palabras del catalogo, asi que INTERPRETE que se refiere a "' + _rescate.categoria + '". Es una HIPOTESIS, no una certeza. Muestrale estas opciones PREGUNTANDOLE primero si a eso se referia (ej. "¿te refieres a ...?"). NO lo des por confirmado ni le cotices como si lo hubiera pedido asi. Si te dice que no es eso, responde SOLO con el token [PEDIR_AYUDA].';
} else if (_weak){
  if (await esNoVendido()) return NO_VENDIDO_JSON();
  _out.instruccion = 'Lo que encontré NO coincide con lo que pidió el cliente (es de OTRA categoría o medida; coincidió de casualidad). NO lo ofrezcas como si fuera lo que pidió ni sugieras otra cosa: responde SOLO con el token [PEDIR_AYUDA].';
} else if (medMismatch){
  _out.parcial = true;
  _out.instruccion = 'OJO: la medida/calibre "' + medLargas.join(' ') + '" NO existe en el catalogo para este producto; los resultados son OTRAS medidas de la MISMA categoria. PROHIBIDO presentarlos como si fueran la medida pedida: dile al cliente con honestidad que esa medida no la trabajamos y ofrecele estas variantes indicando claramente la medida de cada una. Si el cliente insiste en la medida exacta o ninguna le sirve, responde SOLO con el token [PEDIR_AYUDA].';
} else if (medParcial){
  _out.parcial = true;
  _out.instruccion = 'El cliente menciono VARIAS medidas. SI existen: ' + medParcial.si.join(' y ') + (medParcial.no.length ? '; NO existen: ' + medParcial.no.join(' y ') : '') + '. Muestra las opciones encontradas indicando la medida REAL de cada una' + (medParcial.no.length ? ', aclara con honestidad que la otra medida no la trabajamos' : '') + ' y preguntale cual necesita. NO des por hecho una medida que no esta.';
} else if (_fuzzy){
  _out.parcial = true;
  _out.instruccion = 'Resultados APROXIMADOS: la consulta no coincidio exacto con el catalogo (posible error de escritura). Preguntale al cliente si se refiere a alguno de estos productos ANTES de darlo por confirmado; si te dice que no, responde SOLO con el token [PEDIR_AYUDA].';
} else if (_dropped){
  _out.parcial = true;
  _out.instruccion = 'OJO: NINGUN producto combina todo lo que pidio el cliente; para poder mostrarte algo tuve que IGNORAR la palabra "' + _dropped + '". Estos resultados son de la categoria correcta pero NO son "' + _dropped + '". PROHIBIDO presentarlos como si lo fueran: muestralos aclarando con honestidad que no tenemos esa variante/linea y preguntale si alguno le sirve. Si te dice que no, responde SOLO con el token [PEDIR_AYUDA].';
}
return JSON.stringify(_out);
