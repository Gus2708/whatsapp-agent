// READ-ONLY: audita las 93 entradas escritas a mano del mapa SIN contra el catálogo REAL.
//
// Un mapeo termino->canonico puede fallar de tres maneras:
//   DAÑINO   el TÉRMINO ya existe literal en descripciones -> traducirlo vuelve
//            inencontrable un producto que se llamaba justo así (caso 'cinta aislante').
//   MUERTO   el CANÓNICO no aparece en ninguna descripción -> manda la búsqueda a la nada.
//   ESTRECHO el canónico existe pero devuelve MENOS productos que el término original.
//
//   node scripts/_audit_sin.js            # solo los sospechosos
//   node scripts/_audit_sin.js --todos    # las 93, con sus conteos
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const L = require(path.join(ROOT, 'lib', 'serrucho-search.js'));
const norm = L.norm;

const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

const TODOS = process.argv.includes('--todos');

// ¿cuántas descripciones contienen TODAS las palabras de `frase`? (mismo criterio
// que el ilike encadenado de buscar_productos: AND sobre las palabras)
function cuenta(descs, frase) {
  const ws = norm(frase).split(' ').filter(w => w.length > 1);
  if (!ws.length) return -1;
  let n = 0;
  for (const d of descs) if (ws.every(w => d.includes(w))) n++;
  return n;
}

(async () => {
  const descs = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${SB}/rest/v1/productos?select=descripcion&order=codigo_interno.asc&offset=${off}&limit=1000`, { headers: H });
    const p = await r.json();
    for (const x of p) if (x.descripcion) descs.push(norm(x.descripcion));
    if (p.length < 1000) break;
  }
  console.log(`catálogo: ${descs.length} descripciones\n`);

  const filas = [];
  for (const [termino, canonico] of Object.entries(L.SIN)) {
    const nT = cuenta(descs, termino);
    const nC = canonico === '' ? -1 : cuenta(descs, canonico);
    let veredicto = 'ok';
    // El término ya se encuentra solo Y el canónico no aporta más: traducirlo solo puede restar.
    if (nT > 0 && canonico !== '' && nC >= 0 && nT >= nC) veredicto = 'DAÑINO';
    else if (nT > 0 && canonico !== '') veredicto = 'revisar';
    if (canonico !== '' && nC === 0) veredicto = 'MUERTO';
    filas.push({ termino, canonico, nT, nC, veredicto });
  }

  const orden = { 'MUERTO': 0, 'DAÑINO': 1, 'revisar': 2, 'ok': 3 };
  filas.sort((a, b) => orden[a.veredicto] - orden[b.veredicto] || b.nT - a.nT);

  const mostrar = TODOS ? filas : filas.filter(f => f.veredicto !== 'ok');
  console.log('VEREDICTO   término -> canónico                                  prods(term)  prods(canon)');
  console.log('-'.repeat(96));
  for (const f of mostrar) {
    const par = `"${f.termino}" -> "${f.canonico}"`;
    console.log(
      f.veredicto.padEnd(11) + par.padEnd(52) +
      String(f.nT).padStart(8) + String(f.nC < 0 ? '-' : f.nC).padStart(13)
    );
  }
  const c = v => filas.filter(f => f.veredicto === v).length;
  console.log(`\nTOTAL ${filas.length} | MUERTO ${c('MUERTO')} | DAÑINO ${c('DAÑINO')} | revisar ${c('revisar')} | ok ${c('ok')}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
