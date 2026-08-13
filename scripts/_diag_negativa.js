// DIAGNÓSTICO (read-only): radio de daño de busqueda_negativa.
// esNoVendido() marca no_vendido cuando los tokens de la CONSULTA son subconjunto de los
// tokens del NEGATIVO. Es decir: cuanto MÁS GENERAL pregunta el cliente, más fácil le
// niegan el producto. Este script no llama a la red: replica la condición exacta.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');

// Extrae IGNORED/MODIFIERS/tokensDe del cuerpo vivo + helpers de la lib.
const { normMedida, singular, stemColor } = require(path.join(ROOT, 'lib', 'serrucho-search.js'));
const ig = /const IGNORED = new Set\(\[([\s\S]*?)\]\);/.exec(body)[1];
const md = /const MODIFIERS = new Set\(\[([\s\S]*?)\]\);/.exec(body)[1];
const parseSet = s => new Set((s.match(/'([^']*)'/g) || []).map(x => x.slice(1, -1)));
const IGNORED = parseSet(ig), MODIFIERS = parseSet(md);
const tokensDe = t => normMedida(t).split(' ')
  .filter(w => (w.length >= 2 || /\d/.test(w)) && !IGNORED.has(w))
  .map(w => /\d/.test(w) ? w : singular(stemColor(w)));

// Las 4 filas reales de busqueda_negativa (2026-08-13)
const NEGATIVOS = [
  'Tiene pipas de agua de 200',
  'que precio tiene la estructura o soporte del cielo razo porfavor',
  'Buen día, que precio tienen  la holladoras, motor para hacer huecos para meter estanquillo.',
  'Para saber si llego ángulo de 2x1 de 1 milímetro',
];

// Regla ACTUAL: consulta ⊆ negativo  → niega
const negActual = q => {
  const qs = [...new Set(tokensDe(q))].filter(w => !MODIFIERS.has(w));
  if (!qs.length) return null;
  for (const n of NEGATIVOS) {
    const nt = new Set(tokensDe(n));
    if (nt.size > 0 && nt.size <= 8 && qs.every(t => nt.has(t))) return n;
  }
  return null;
};
// Regla PROPUESTA: negativo ⊆ consulta → niega (el cliente pide algo AL MENOS tan
// específico como lo que el empleado descartó)
const negPropuesta = q => {
  const qs = new Set([...new Set(tokensDe(q))]);
  for (const n of NEGATIVOS) {
    const nt = [...new Set(tokensDe(n))].filter(w => !MODIFIERS.has(w));
    if (nt.length > 0 && nt.every(t => qs.has(t))) return n;
  }
  return null;
};

const PRUEBAS = [
  ['angulo', 'debe encontrar: hay 5 ángulos en stock'],
  ['tienen angulos', 'debe encontrar'],
  ['angulo L', 'debe encontrar'],
  ['precio del angulo', 'debe encontrar'],
  ['angulo de 2x1 de 1 milimetro', 'NEGAR ok (esa medida no existe)'],
  ['agua', 'debe encontrar'],
  ['motor', 'debe encontrar'],
  ['soporte', 'debe encontrar'],
  ['estructura', 'debe encontrar'],
  ['cielo raso', 'debe encontrar'],
  ['huecos', 'debe encontrar'],
  ['estanquillo', 'debe encontrar'],
  ['pipas de agua de 200', 'NEGAR ok'],
  ['holladora', 'debe encontrar'],
];

console.log('Tokens de cada negativo guardado:');
for (const n of NEGATIVOS) console.log(`  · "${n.slice(0, 60)}"\n      -> {${[...new Set(tokensDe(n))].join(', ')}}`);

console.log(`\n${'CONSULTA'.padEnd(32)} ${'ACTUAL'.padEnd(10)} ${'PROPUESTA'.padEnd(10)} nota`);
console.log('-'.repeat(88));
let danoActual = 0, danoNuevo = 0;
for (const [q, nota] of PRUEBAS) {
  const a = negActual(q), p = negPropuesta(q);
  const esperaNegar = /^NEGAR/.test(nota);
  if (!!a !== esperaNegar) danoActual++;
  if (!!p !== esperaNegar) danoNuevo++;
  console.log(`${q.padEnd(32)} ${(a ? 'NIEGA' : 'busca').padEnd(10)} ${(p ? 'NIEGA' : 'busca').padEnd(10)} ${nota}`);
}
console.log('-'.repeat(88));
console.log(`Veredictos equivocados — regla actual: ${danoActual}/${PRUEBAS.length} | regla propuesta: ${danoNuevo}/${PRUEBAS.length}`);
