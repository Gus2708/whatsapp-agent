// Mide RECALL real: se toma un producto del catálogo, se le pide a un "cliente
// simulado" que lo pida como lo pediría un venezolano de pueblo (sin usar las
// palabras técnicas), y se comprueba si buscar_productos devuelve ESE producto.
//
// Las consultas se generan UNA vez y se cachean en scratch_live/_coloquial_set.json,
// para que el antes/después del diccionario se mida sobre EXACTAMENTE las mismas
// preguntas. Sin eso la comparación no vale nada.
//
//   node scripts/_test_coloquial.js --generar 80   # crea el set (una sola vez)
//   node scripts/_test_coloquial.js                # corre el set contra la búsqueda
//   node scripts/_test_coloquial.js --etiqueta antes|despues
//   node scripts/_test_coloquial.js --sin-aprender --etiqueta vec   # corrida A (oficial)
//   node scripts/_test_coloquial.js --sin-aprender --sin-vector --etiqueta sinvec  # corrida B
//   node scripts/_test_coloquial.js --ab vec sinvec                # gate A/B (sin re-correr)
//
// Instrumentación (design search-accuracy D1-D4, D8): el archivo oficial solo se
// escribe al completar el set completo, con persistencia atómica (.tmp + rename);
// --limit nunca escribe oficial. --sin-aprender cortocircuita los POSTs de
// catalogo_vocabulario y automejora-busqueda para que una corrida de medición no
// tenga efectos secundarios. El veredicto del gate NO toca el ranking: solo lee
// los dos archivos etiquetados.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SET = path.join(ROOT, 'scratch_live', '_coloquial_set.json');
const norm = require(path.join(ROOT, 'lib', 'serrucho-search.js')).norm;

const { leerCredenciales, construirEnv } = require('./_lib_credenciales');
const { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON } = leerCredenciales();
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');

// ─────────────────────────────────────────────────────────── D1: shim de axios
// --sin-aprender cortocircuita SOLO los POSTs cuyo destino es esa lista (upsert de
// vocabulario + webhook de automejora) devolviendo {data:[]} sin tocar la red.
// RPC (buscar_productos, buscar_fuzzy) y todos los GETs pasan sin cambios: los
// resultados de búsqueda quedan idénticos, cero efectos secundarios.
const URL_SIN_APRENDER = ['catalogo_vocabulario', 'automejora-busqueda'];

function crearTransporteFetch() {
  return {
    async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
    async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
  };
}

function crearAxiosShim(transporte, opts) {
  const { sinAprender } = opts || {};
  const t = transporte || crearTransporteFetch();
  return {
    async get(u, c) { return t.get(u, c); },
    async post(u, b, c) {
      if (sinAprender && URL_SIN_APRENDER.some(x => String(u).includes(x))) return { data: [] };
      return t.post(u, b, c);
    },
  };
}

const crearRun = () => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');

// Corre el cuerpo vivo contra una consulta con el shim inyectado (mismo seam n8n).
async function buscarCon(consulta, shim, env) {
  const fakeRequire = n => (n === 'axios' ? shim : require(n));
  try { return JSON.parse(await crearRun()({ p_busqueda: consulta }, fakeRequire, env)); }
  catch (e) { return { error: e.message }; }
}

// ─────────────────────────────────────────────────────────── D2: registro + persistencia
// Registro por caso (schema del design): ok = hit normalizado exacto, posicion 1-based,
// top1 = nombre del primer resultado (o null), rescate/parcial booleanos.
function registrarCaso(c, res) {
  const prods = res.productos || [];
  const objetivo = norm(c.descripcion);
  let posicion = 0;
  for (let i = 0; i < prods.length; i++) {
    if (norm(prods[i].nombre || '') === objetivo) { posicion = i + 1; break; }
  }
  return {
    codigo: c.codigo,
    consulta: c.consulta,
    ok: posicion > 0,
    posicion,
    top1: prods.length ? prods[0].nombre : null,
    rescate: Boolean(res.rescate),
    parcial: Boolean(res.parcial),
  };
}

function rutaResultados(etiqueta) {
  return path.join(ROOT, 'scratch_live', '_coloquial_resultados' + (etiqueta ? '_' + etiqueta : '') + '.json');
}

// Atómica: escribe .tmp y reemplaza con rename; si algo falla a mitad, limpia el .tmp
// y el archivo oficial queda intacto (nunca a medias).
function persistirResultados(ruta, envelope, fsx) {
  const f = fsx || fs;
  const tmp = ruta + '.tmp';
  try {
    f.writeFileSync(tmp, JSON.stringify(envelope, null, 2), 'utf8');
    f.renameSync(tmp, ruta);
  } catch (e) {
    try { f.unlinkSync(tmp); } catch (e2) {}
    throw e;
  }
}

// ─────────────────────────────────────────────────────────── D3: buckets por antigüedad
// Misma semántica que el plan 010: ultima_venta >= ahora-365d -> "<1 año"; presente
// pero más vieja -> ">1 año"; null/ausente -> "sin historial" (nunca se descarta).
function bucketDeUltimaVenta(fechaISO, hoy) {
  if (!fechaISO) return 'sin historial';
  const f = new Date(fechaISO);
  if (Number.isNaN(f.getTime())) return 'sin historial';
  const h = hoy ? new Date(hoy) : new Date();
  const dias = (h.getTime() - f.getTime()) / 86400000;
  return dias <= 365 ? '<1 año' : '>1 año';
}

function armarBuckets(resultados, popularidad, hoy) {
  const ultima = new Map((popularidad || []).map(p => [p.codigo_interno, p.ultima_venta]));
  const vacio = { total: 0, exacto: 0 };
  const buckets = { '<1 año': { ...vacio }, '>1 año': { ...vacio }, 'sin historial': { ...vacio } };
  for (const r of resultados) {
    const b = bucketDeUltimaVenta(ultima.get(r.codigo) || null, hoy);
    buckets[b].total++;
    if (r.ok) buckets[b].exacto++;
  }
  for (const b of Object.keys(buckets)) {
    const x = buckets[b];
    x.exacto_pct = x.total ? Number(((x.exacto / x.total) * 100).toFixed(1)) : 0;
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────── D4: gate A/B
// gap = exacto_pct(vector) - exacto_pct(sin-vector); < 5 -> REJECTED (la capa
// vectorial no aporta), >= 5 -> conditional (abre solo plan 010 pasos 4-5).
function evaluarGap(pctVector, pctSinVector) {
  return Number((pctVector - pctSinVector).toFixed(2));
}

function evaluarGate(gap) {
  return gap >= 5 ? 'conditional' : 'REJECTED';
}

function leerResultados(ruta) {
  if (!fs.existsSync(ruta)) throw new Error('no existe el archivo de resultados: ' + ruta);
  return JSON.parse(fs.readFileSync(ruta, 'utf8'));
}

// ─────────────────────────────────────────────────────────── generación del set
const SIM = `Eres un cliente venezolano común de un pueblo de Falcón: albañil, herrero, ama de casa o gente mayor. Escribes por WhatsApp a la ferretería.

Te doy un producto REAL del catálogo. Escribe el mensaje que mandarías para pedirlo.

REGLAS:
- Escribe como habla la gente, no como el catálogo. Usa el nombre popular, no el técnico.
- EVITA copiar las palabras exactas de la descripción si existe una forma coloquial.
- Puedes tener faltas de ortografía leves, como escribe la gente de verdad.
- Un solo mensaje corto, natural. Sin comillas.
- Si el producto lleva medida, puedes mencionarla como la diría un cliente.`;

async function generar(n) {
  const { OPENROUTER_API_KEY: OR_KEY } = leerCredenciales();
  const r = await fetch(`${SB}/rest/v1/productos?select=codigo_interno,descripcion&existencia=gt.0&limit=4000`, { headers: H });
  const todos = await r.json();
  // muestreo determinista y repartido por todo el catálogo (sin Math.random: reproducible)
  const paso = Math.floor(todos.length / n);
  const muestra = Array.from({ length: n }, (_, i) => todos[i * paso]).filter(Boolean);

  const casos = [];
  for (let i = 0; i < muestra.length; i += 8) {
    const grupo = muestra.slice(i, i + 8);
    const res = await Promise.all(grupo.map(async p => {
      const rr = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-5.6-luna', temperature: 0.8,
          messages: [{ role: 'system', content: SIM }, { role: 'user', content: `Producto: ${p.descripcion}` }],
        }),
      });
      const j = await rr.json();
      if (j.error) return null;
      return { codigo: p.codigo_interno, descripcion: p.descripcion, consulta: (j.choices[0].message.content || '').trim().replace(/^["']|["']$/g, '') };
    }));
    casos.push(...res.filter(Boolean));
    process.stdout.write(`\r  generadas ${casos.length}/${muestra.length}`);
  }
  fs.writeFileSync(SET, JSON.stringify(casos, null, 2));
  console.log(`\nset guardado: ${SET} (${casos.length} casos)`);
}

// ─────────────────────────────────────────────────────────── CLI
const FLAGS_VALIDOS = new Set(['--generar', '--limit', '--sin-vector', '--sin-aprender', '--etiqueta', '--ab']);

function uso(stderr) {
  const f = stderr ? console.error : console.log;
  f('uso: node scripts/_test_coloquial.js [--generar N] [--limit N] [--sin-vector] [--sin-aprender] [--etiqueta <tag>] [--ab <a> <b>]');
}

async function main() {
  const argv = process.argv.slice(2);

  // 1. Validación de flags: falla RÁPIDO, antes de construir env o tocar la red.
  for (const a of argv) {
    if (a.startsWith('--') && !FLAGS_VALIDOS.has(a)) {
      console.error('flag desconocido: ' + a);
      uso(true);
      process.exit(1);
    }
  }
  const tiene = flag => argv.includes(flag);
  const valorDe = flag => {
    const i = argv.indexOf(flag);
    return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : null;
  };
  const valorRequerido = flag => {
    const v = valorDe(flag);
    if (v === null || v.startsWith('--')) {
      console.error(`falta el valor de ${flag}`);
      uso(true);
      process.exit(1);
    }
    return v;
  };

  // 2. Generación del set (no toca resultados).
  if (tiene('--generar')) {
    const n = Number(valorDe('--generar')) || 80;
    return generar(n);
  }

  // 3. Gate A/B: SOLO lee los dos archivos etiquetados; no ejecuta ninguna búsqueda.
  if (tiene('--ab')) {
    const i = argv.indexOf('--ab');
    const a = argv[i + 1], b = argv[i + 2];
    if (!a || !b || a.startsWith('--') || b.startsWith('--')) {
      console.error('--ab requiere dos etiquetas: --ab <a> <b>');
      uso(true);
      process.exit(1);
    }
    const ra = leerResultados(rutaResultados(a));
    const rb = leerResultados(rutaResultados(b));
    const pctA = ra.resumen.exacto_pct, pctB = rb.resumen.exacto_pct;
    const gap = evaluarGap(pctA, pctB);
    const veredicto = evaluarGate(gap);
    console.log('========= GATE A/B =========');
    console.log(`  vector     (${a}): ${pctA}%`);
    console.log(`  sin-vector (${b}): ${pctB}%`);
    console.log(`  gap (vector − sin-vector): ${gap} pts`);
    console.log(`  umbral: 5 pts  →  veredicto: ${veredicto === 'REJECTED' ? 'REJECTED (la capa vectorial no aporta; el breakdown queda como métrica permanente)' : 'conditional (abre plan 010 pasos 4-5 con --sin-ventas)'}`);
    return;
  }

  if (!fs.existsSync(SET)) throw new Error('no existe el set; corre primero: node scripts/_test_coloquial.js --generar 80');
  const todos = JSON.parse(fs.readFileSync(SET, 'utf8'));
  const etiqueta = tiene('--etiqueta') ? valorRequerido('--etiqueta') : '';
  const limite = tiene('--limit') ? Number(valorRequerido('--limit')) : 0;
  if (tiene('--limit') && !Number.isFinite(limite)) {
    console.error('--limit requiere un número');
    uso(true);
    process.exit(1);
  }
  const SIN_VECTOR = tiene('--sin-vector');
  const SIN_APRENDER = tiene('--sin-aprender');

  const casos = limite > 0 ? todos.slice(0, limite) : todos;
  if (limite > 0) console.log(`PARCIAL: ${casos.length} de ${todos.length} casos (--limit) — no es el número oficial\n`);

  const $ENV = construirEnv({ sinVector: SIN_VECTOR });
  const shim = crearAxiosShim(null, { sinAprender: SIN_APRENDER });

  let exacto = 0, categoria = 0, nada = 0, hechos = 0;
  const resultados = [];
  const fallos = [];
  const t0 = Date.now();
  for (const c of casos) {
    const res = await buscarCon(c.consulta, shim, $ENV);
    const reg = registrarCaso(c, res);
    resultados.push(reg);
    if (reg.ok) {
      exacto++;
    } else {
      // "misma categoría" = comparten la primera palabra de la descripción
      const cat1 = norm(c.descripcion).split(' ')[0];
      const catHit = (res.productos || []).some(p => norm(p.nombre || '').split(' ')[0] === cat1);
      if (catHit) categoria++;
      else { nada++; fallos.push(c); }
    }
    hechos++;
    const seg = (Date.now() - t0) / 1000;
    const falta = Math.round((seg / hechos) * (casos.length - hechos));
    process.stdout.write(`\r  ${hechos}/${casos.length}  ·  exacto ${exacto}  ·  ${seg.toFixed(0)}s transcurridos, ~${falta}s restantes    `);
  }
  process.stdout.write('\r' + ' '.repeat(76) + '\r');

  // D3: join con producto_popularidad. Solo el set completo reporta buckets
  // oficiales; si el fetch falla, todo va a "sin historial" (nunca se cae la corrida).
  let popularidad = [];
  try {
    const r = await fetch(`${SB}/rest/v1/producto_popularidad?select=codigo_interno,ultima_venta&limit=10000`, { headers: H });
    if (r.ok) {
      const d = await r.json();
      if (Array.isArray(d)) popularidad = d;
    }
  } catch (e) {
    console.warn(`\n  (aviso) no se pudo leer producto_popularidad; todos los casos van a "sin historial": ${e.message}`);
    popularidad = [];
  }
  const buckets = armarBuckets(resultados, popularidad);
  const exacto_pct = Number(((exacto / casos.length) * 100).toFixed(1));
  const resumen = { exacto, exacto_pct, categoria, nada, buckets };

  // D2: persistir SOLO en corrida completa (--limit nunca escribe el oficial).
  if (limite === 0) {
    persistirResultados(rutaResultados(etiqueta), {
      meta: { set: '_coloquial_set.json', casos: todos.length, flags: argv, fecha: new Date().toISOString(), duracion_s: Math.round((Date.now() - t0) / 1000) },
      resumen,
      resultados,
    });
  }

  const pct = n => ((n / casos.length) * 100).toFixed(1) + '%';
  console.log(`\n========= RECALL COLOQUIAL ${etiqueta ? '[' + etiqueta + ']' : ''} =========`);
  console.log(`casos: ${casos.length}`);
  console.log(`  producto exacto en resultados : ${exacto}  (${pct(exacto)})`);
  console.log(`  al menos la categoría correcta: ${categoria}  (${pct(categoria)})`);
  console.log(`  fallo total                   : ${nada}  (${pct(nada)})`);
  if (limite === 0) {
    console.log(`\n  buckets por antigüedad de última venta (denominadores suman ${casos.length}):`);
    for (const b of ['<1 año', '>1 año', 'sin historial']) {
      const x = buckets[b];
      console.log(`    ${b.padEnd(13)}: ${String(x.total).padStart(4)} casos · exacto ${x.exacto_pct}%`);
    }
    console.log(`\nResultados oficiales guardados: ${rutaResultados(etiqueta)}`);
  }
  console.log(`\nFallos:`);
  for (const f of fallos.slice(0, 30)) console.log(`  · "${f.consulta.slice(0, 70)}"\n      esperaba: ${f.descripcion}`);
}

if (require.main === module) {
  main().catch(e => { console.error('ERROR', e.message); process.exit(1); });
}

module.exports = {
  crearTransporteFetch,
  crearAxiosShim,
  URL_SIN_APRENDER,
  buscarCon,
  registrarCaso,
  rutaResultados,
  persistirResultados,
  bucketDeUltimaVenta,
  armarBuckets,
  evaluarGap,
  evaluarGate,
  leerResultados,
};