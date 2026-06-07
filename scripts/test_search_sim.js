const https = require('https');

const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function tc(s){ return String(s).toLowerCase().split(/\s+/).map(w=>{ if(/\d/.test(w)) return w.toUpperCase(); if(w.length<=3) return w.toUpperCase(); return w.charAt(0).toUpperCase()+w.slice(1); }).join(' '); }
function norm(t){ return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim(); }

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

function scoreMatch(descripcion, qTokens){
  const d = norm(descripcion);
  const words = d.split(/[\s\-x]+/);
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
      if (/\d/.test(t)) {
        const specials = ['.', '*', '+', '?', '^', '\$', '{', '}', '(', ')', '|', '[', ']', '\\\\'];
        let escaped = '';
        for (let j=0; j<t.length; j++) {
          const c = t[j];
          if (specials.includes(c)) escaped += '\\' + c;
          else escaped += c;
        }
        const rx = new RegExp('(?<![\\d/])' + escaped + '(?![\\d/])', 'i');
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

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: H }, res => {
      let d = '';
      res.on('data', chunk => d += chunk);
      res.on('end', () => {
        if (res.statusCode >= 300) reject(new Error('HTTP Status ' + res.statusCode + ': ' + d));
        else resolve(JSON.parse(d));
      });
    }).on('error', reject);
  });
}

async function run(p_busqueda) {
  const IGNORED = new Set([
    'de', 'y', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'o',
    'venden', 'vendes', 'tienen', 'tiene', 'hay', 'quiero', 'busco', 'comprar', 'necesito', 'dame', 'trae',
    'cuanto', 'cuesta', 'cuestan', 'vale', 'valen', 'sale', 'salen', 'precio', 'precios', 'costo', 'como',
    'saco', 'sacos', 'bolsa', 'bolsas', 'unidad', 'unidades', 'pieza', 'piezas', 'kilo', 'kilos', 'kg',
    'metro', 'metros', 'mts', 'caja', 'cajas', 'galon', 'galones', 'para', 'con', 'del', 'algo', 'vender',
    'tener', 'buscar', 'amigo', 'buenas', 'hola', 'tardes', 'dias', 'noches', 'porfa', 'favor', 'gracias',
    'una', 'uno', 'unas', 'unos', 'donde', 'tiene', 'tienen'
  ]);

  const termExp = expandir(p_busqueda);
  const qTokens = termExp.split(' ').filter(w => w.length>=2 && !IGNORED.has(w));
  const largas = qTokens.filter(w => w.length>=3 || /\d/.test(w));

  const q = largas.map(w => {
    if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';
    if (w === '1/2' || w === '12mm') return 'or=(descripcion.ilike.*1/2*,descripcion.ilike.*12mm*,descripcion.ilike.*12 mm*)';
    if (w === '3/8' || w === '10mm') return 'or=(descripcion.ilike.*3/8*,descripcion.ilike.*10mm*,descripcion.ilike.*10 mm*)';
    if (w === '5/8' || w === '16mm') return 'or=(descripcion.ilike.*5/8*,descripcion.ilike.*16mm*,descripcion.ilike.*16 mm*)';
    if (w === '3/4' || w === '20mm') return 'or=(descripcion.ilike.*3/4*,descripcion.ilike.*20mm*,descripcion.ilike.*20 mm*)';
    if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`;
    return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';
  }).join('&');

  const url = `${SB}/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&${q}&limit=30`;
  const data = await getJson(url);

  const codes = data.map(p => p.codigo_interno);
  const cf = codes.map(c => '"' + c + '"').join(',');
  let vMap = {};
  if (codes.length > 0) {
    const salesUrl = `${SB}/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.(${cf})&limit=4000`;
    const salesData = await getJson(salesUrl);
    for (const v of salesData) {
      vMap[v.codigo_producto] = (vMap[v.codigo_producto] || 0) + Number(v.cantidad);
    }
  }

  const unicos = [];
  const seen = new Set();
  for (const p of data) {
    if (!seen.has(p.codigo_interno)) {
      seen.add(p.codigo_interno);
      unicos.push(p);
    }
  }

  unicos.sort((a,b)=>{
    const ds=scoreMatch(b.descripcion,qTokens)-scoreMatch(a.descripcion,qTokens);
    if(Math.abs(ds)>0.5) return ds;

    const aStock = Number(a.existencia) > 0;
    const bStock = Number(b.existencia) > 0;
    if (aStock !== bStock) {
      return aStock ? -1 : 1;
    }

    return (vMap[b.codigo_interno]||0)-(vMap[a.codigo_interno]||0);
  });

  const productos = unicos.slice(0,4).map(p=>{
    const disp = Number(p.existencia) > 0;
    return {
      codigo: p.codigo_interno,
      nombre: tc(p.descripcion),
      score: scoreMatch(p.descripcion, qTokens),
      ventas: vMap[p.codigo_interno]||0,
      existencia: p.existencia,
      disponible: disp,
      precio: p.precio_venta
    };
  });

  console.log(`\nSEARCH RESULTS FOR "${p_busqueda}":`);
  console.log(JSON.stringify(productos, null, 2));
}

async function testAll() {
  const arg = process.argv[2];
  if (arg) {
    await run(arg);
  } else {
    await run('tubo herreria 2x1');
    await run('cabilla de media');
    await run('cabilla de 3/8');
    await run('cabilla de 10mm');
  }
}

testAll().catch(console.error);
