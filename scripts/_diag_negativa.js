// DIAGNÓSTICO (read-only) de busqueda_negativa — alineado a la regla viva (design D5 / R6).
//
// Corre el CUERPO VIVO completo de live_buscar.js (misma carga que _diag_negaciones.js,
// read-only) con aislamiento D1: el veredicto es el esNoVendido() REAL del cuerpo,
// no una réplica estática que puede desincronizarse (la versión anterior replicaba la
// regla al revés: consulta ⊆ negativo, y marcaba 10/14 casos mal). La regla viva
// (c01ed5d) es: NEGATIVO ⊆ CONSULTA, `_nt.length <= 8`, sin filtro de MODIFIERS, TTL
// 90 días por `creado_en` (server-side). Cero escrituras: sin upsert de vocabulario y
// sin webhook de automejora (D1).
//
//   node scripts/_diag_negativa.js                    # casos conocidos (PRUEBAS)
//   node scripts/_diag_negativa.js --qs "Tiene pipas de agua de 200"
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');

const { construirEnv } = require('./_lib_credenciales');
const { crearAxiosShim } = require('./_test_coloquial.js');

// Casos de control: consultas que el catálogo SÍ tiene (deben "buscar") y las que
// chocan con un negativo guardado (deben "NO_VENDIDO").
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

const crearRun = () => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');

// Ejecuta el cuerpo vivo completo para una consulta con el shim/entorno inyectados.
// Exportada para los tests hermeticos (D5): el diagnóstico ES el matcher real.
async function diagBuscar(q, shim, env) {
  const fakeRequire = n => (n === 'axios' ? shim : require(n));
  try { return JSON.parse(await crearRun()({ p_busqueda: q }, fakeRequire, env)); }
  catch (e) { return { error: e.message }; }
}

async function main() {
  const argv = process.argv.slice(2);
  for (const a of argv) {
    if (a.startsWith('--') && a !== '--qs') {
      console.error('flag desconocido: ' + a);
      console.error('uso: node scripts/_diag_negativa.js [--qs "<consulta>"]');
      process.exit(1);
    }
  }
  const i = argv.indexOf('--qs');
  const qs = i !== -1 && argv[i + 1] ? argv[i + 1].trim() : null;

  // D1: el diagnóstico jamás escribe efectos secundarios (sin upsert, sin webhook).
  const shim = crearAxiosShim(null, { sinAprender: true });
  const $ENV = construirEnv();

  if (qs) {
    const res = await diagBuscar(qs, shim, $ENV);
    const top = (res.productos || []).slice(0, 3).map(p => `${p.nombre}${p.disponible === false ? ' (AGOTADO)' : ''}`).join(' | ');
    const etiqueta = res.error ? 'ERROR ' + res.error
      : res.no_vendido ? 'NO_VENDIDO (regla viva: NEGATIVO ⊆ CONSULTA, ≤8 tokens, TTL 90d)'
      : res.aclarar ? 'aclarar'
      : res.encontrados > 0 ? 'busca' : 'sin resultados';
    console.log(`consulta: "${qs}"`);
    console.log(`veredicto: ${etiqueta}`);
    if (top) console.log(`top: ${top}`);
    return;
  }

  console.log('Evaluando casos conocidos contra el CUERPO VIVO (esNoVendido real):');
  let ok = 0;
  for (const [q, nota] of PRUEBAS) {
    const res = await diagBuscar(q, shim, $ENV);
    const niega = res.error ? false : Boolean(res.no_vendido);
    const esperaNegar = /^NEGAR/.test(nota);
    if (niega === esperaNegar) ok++;
    console.log(`  [${niega === esperaNegar ? 'ok ' : '✗  '}] "${q}"  →  ${niega ? 'NO_VENDIDO' : 'busca'}  (${nota})${res.error ? '  ERROR: ' + res.error : ''}`);
  }
  console.log(`\nCoinciden con la expectativa: ${ok}/${PRUEBAS.length}`);
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1); });
}

module.exports = { diagBuscar, PRUEBAS };