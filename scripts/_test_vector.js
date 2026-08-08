// READ-ONLY: sonda de calidad del espacio vectorial, aislada del resto del pipeline.
// Mide las tres cosas que decidieron el veredicto la vez pasada:
//   1. ¿pone el producto correcto arriba? ("cemento gris" -> CEMENTO, no PINTURA GRIS)
//   2. ¿cuánto separa una consulta legítima del texto basura? (el suelo de ruido)
//   3. ¿resuelve las variantes de nombre? ("tapa para el baño" -> TAPA DE INODORO)
//
//   node scripts/_test_vector.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL'), ANON = pick('SUPABASE_ANON_KEY'), OAI = pick('OPENAI_API_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// Casos con el resultado que SE ESPERA, para poder decir "acierta" y no solo "devuelve algo".
const CASOS = [
  { q: 'cemento gris', espera: /^cemento/i, nota: 'v1 ponía PINTURA GRIS CONCRETO encima' },
  { q: 'tapa para el bano', espera: /inodoro|poceta|wc/i, nota: 'v1: 0.619, el único donde ganaba' },
  { q: 'aparato para medir la corriente', espera: /multimetro|tester|amperimetr/i, nota: '' },
  { q: 'lo que se usa para pegar los bloques', espera: /cemento|mortero/i, nota: 'v1 daba Juego de Mechas' },
  // OJO con estas dos: las escribí mal la primera vez y el probe reportó 1/7 y 2/7 cuando
  // el acierto real era 6/7. "TENAZA CABILLERA" ES la herramienta de cortar cabilla, y el
  // catálogo abrevia "TORNILLO" como "TORN". Una expectativa mal escrita hace que una
  // medición correcta parezca un fracaso, y eso lleva a revertir algo que funciona.
  { q: 'algo para cortar cabilla', espera: /cizalla|segueta|disco|sierra|tenaza|cortadora/i, nota: 'v1 daba Cabilla Estriada' },
  { q: 'motor para hacer huecos', espera: /taladro|hoyadora|rotomartillo|percutor/i, nota: 'v1 daba Cabo para Hacha' },
  { q: 'tornillos galvanizados', espera: /tornillo|\btorn\b/i, nota: 'el catálogo abrevia TORN' },
];
const BASURA = ['asdfgh qwerty', 'hola buenas tardes como estan', 'xxxxx zzzz'];

async function embed(textos) {
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST', headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: textos, dimensions: 1536 }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.data.map(d => d.embedding);
}
async function buscar(v, n = 3) {
  const r = await fetch(SB + '/rest/v1/rpc/buscar_semantico', {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_embedding: JSON.stringify(v), p_umbral: 0.0, p_limite: n }),
  });
  try { const d = JSON.parse(await r.text()); return Array.isArray(d) ? d : []; } catch (e) { return []; }
}

(async () => {
  const todas = [...CASOS.map(c => c.q), ...BASURA];
  const vs = await embed(todas);

  let aciertos = 0, minLegit = 1;
  console.log('CONSULTAS REALES');
  for (let i = 0; i < CASOS.length; i++) {
    const c = CASOS[i];
    const res = await buscar(vs[i]);
    const top = res[0];
    const ok = top && c.espera.test(top.descripcion);
    if (ok) aciertos++;
    if (top) minLegit = Math.min(minLegit, top.similitud);
    console.log(`${ok ? '✓' : '✗'} "${c.q}"${c.nota ? '   (' + c.nota + ')' : ''}`);
    for (const x of res) console.log(`     ${x.similitud.toFixed(3)}  ${x.descripcion.slice(0, 62)}`);
  }

  let maxBasura = 0;
  console.log('\nTEXTO BASURA (debería puntuar BAJO)');
  for (let i = 0; i < BASURA.length; i++) {
    const res = await buscar(vs[CASOS.length + i], 1);
    const s = res[0] ? res[0].similitud : 0;
    maxBasura = Math.max(maxBasura, s);
    console.log(`   ${s.toFixed(3)}  "${BASURA[i]}" -> ${res[0] ? res[0].descripcion.slice(0, 50) : '(nada)'}`);
  }

  console.log(`\n================ RESUMEN ================`);
  console.log(`aciertos en el top-1: ${aciertos}/${CASOS.length}`);
  console.log(`peor consulta legítima : ${minLegit.toFixed(3)}`);
  console.log(`mejor texto basura     : ${maxBasura.toFixed(3)}`);
  const margen = minLegit - maxBasura;
  console.log(`MARGEN (legítimo - basura): ${margen.toFixed(3)}  ${margen > 0.05 ? '-> hay umbral posible' : '-> NO hay umbral que los separe'}`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
