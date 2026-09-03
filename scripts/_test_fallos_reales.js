// READ-ONLY: corre el cuerpo EXACTO de buscar_productos contra las consultas REALES
// que hicieron fallar al bot (tabla solicitudes_ayuda). Es la medida honesta de si
// el diccionario del catálogo sirve: antes/después sobre fallos que de verdad pasaron.
//
//   node scripts/_test_fallos_reales.js          # todas las consultas reales
//   node scripts/_test_fallos_reales.js --prod   # solo las que piden un producto
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const { leerCredenciales, construirEnv } = require('./_lib_credenciales');
const { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON } = leerCredenciales();

const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const fakeRequire = n => (n === 'axios' ? axiosShim : require(n));
// $env: el nodo Code de n8n lo expone; sin él el rescate semántico no se ejecuta.
const $ENV = construirEnv();
const run = b => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + b + '\n})();');
const buscar = async q => { try { return JSON.parse(await run(body)({ p_busqueda: q }, fakeRequire, $ENV)); } catch (e) { return { error: e.message }; } };

// Consultas que NO son de catálogo: saludos, fotos, seguimientos sin producto.
// El bot hace bien en no encontrarlas; no cuentan como fallo de búsqueda.
const NO_ES_PRODUCTO = /^(si|no|ok|gracias|buenas?|hola)\b|foto|precio[s]?$|^y (el|la|de)|^de la|^esas? son|presupuesto de materiales|como esta todo|^\W*$/i;

(async () => {
  const r = await fetch(`${SB}/rest/v1/solicitudes_ayuda?select=consulta,no_disponible,creado_en&order=creado_en.desc&limit=200`,
    { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
  const filas = (await r.json()).filter(f => f.consulta && f.consulta.trim().length > 3);

  const soloProd = process.argv.includes('--prod');
  const casos = soloProd ? filas.filter(f => !NO_ES_PRODUCTO.test(f.consulta.trim())) : filas;

  console.log(`Consultas reales que escalaron: ${filas.length} | evaluando: ${casos.length}\n`);

  let hallados = 0, vacios = 0, noVendidos = 0;
  const sigueFallando = [];
  for (const f of casos) {
    const q = f.consulta.trim();
    const res = await buscar(q);
    const n = res.encontrados || 0;
    const etiqueta = res.error ? 'ERROR' : res.aclarar ? 'aclarar' : res.no_vendido ? 'no_vendido' : n > 0 ? 'OK' : 'vacío';
    if (n > 0) hallados++; else if (res.no_vendido) noVendidos++; else { vacios++; sigueFallando.push(q); }
    const top = (res.productos || []).slice(0, 2).map(p => p.nombre).join(' | ');
    console.log(`[${etiqueta.padEnd(10)}] "${q.slice(0, 78)}"`);
    if (top) console.log(`             => ${top}`);
  }

  console.log(`\n================ RESUMEN ================`);
  console.log(`evaluadas: ${casos.length} | con resultados: ${hallados} | no_vendido: ${noVendidos} | sin nada: ${vacios}`);
  console.log(`\nSiguen sin encontrar nada:`);
  for (const q of sigueFallando) console.log(`  · ${q.slice(0, 90)}`);

  const rutaJson = path.join(ROOT, 'scratch_live', 'fallos_reales_resultado.json');
  fs.writeFileSync(rutaJson, JSON.stringify({
    fecha: new Date().toISOString(),
    evaluadas: casos.length,
    con_resultados: hallados,
    no_vendido: noVendidos,
    sin_nada: vacios,
    consultas_fallidas: sigueFallando
  }, null, 2), 'utf8');

  if (process.argv.includes('--json')) {
    console.log(fs.readFileSync(rutaJson, 'utf8'));
  }
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
