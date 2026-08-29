#!/usr/bin/env node
/**
 * rag — CLI único para la capa de búsqueda de Perucho.
 *
 *   node rag.js                    # estado del sistema
 *   node rag.js ayuda              # todos los comandos
 *
 * ORQUESTA los scripts existentes, no duplica su lógica: este repo ya pagó caro tener el
 * mismo matcher copiado en tres sitios. Lo único propio de aquí es `estado` y `buscar`.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// ─────────────────────────────────────────────────────────────── util de presentación
const C = process.stdout.isTTY
  ? { d: s => `\x1b[2m${s}\x1b[0m`, b: s => `\x1b[1m${s}\x1b[0m`, v: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`, a: s => `\x1b[33m${s}\x1b[0m` }
  : { d: s => s, b: s => s, v: s => s, r: s => s, a: s => s };
const ok = s => C.v('✓ ') + s;
const mal = s => C.r('✗ ') + s;
const ojo = s => C.a('⚠ ') + s;
const titulo = s => '\n' + C.b(s) + '\n' + C.d('─'.repeat(Math.max(s.length, 46)));
const num = n => Number(n).toLocaleString('es-VE');

async function sb(q, extraHeaders) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: Object.assign({}, H, extraHeaders || {}) });
  if (!r.ok) throw new Error(`${q} -> ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r;
}
// cuenta sin traerse las filas
async function contar(tabla, filtro, col) {
  // la columna varia por tabla (catalogo_vocabulario no tiene codigo_interno): se parametriza
  const r = await sb(`${tabla}?select=${col || 'codigo_interno'}&limit=1${filtro ? '&' + filtro : ''}`, { Prefer: 'count=exact' });
  const cr = r.headers.get('content-range') || '';
  return Number(cr.split('/')[1] || 0);
}
async function traerTodo(tabla, select, orden) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const r = await sb(`${tabla}?select=${select}&order=${orden}&offset=${off}&limit=1000`);
    const d = await r.json();
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}

// lanza un script hijo mostrando su salida tal cual
function correr(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...(args || [])], { stdio: 'inherit', cwd: ROOT });
  return r.status === 0;
}

// ─────────────────────────────────────────────────────────────── estado
async function estado() {
  console.log(titulo('CATÁLOGO Y VECTORES'));

  const productos = (await traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'))
    .filter(p => p.descripcion && p.descripcion.trim());
  const emb = await traerTodo('productos_embedding', 'codigo_interno,descripcion,actualizado_en', 'codigo_interno.asc');
  const porCodigo = new Map(emb.map(e => [e.codigo_interno, e]));

  const sinVector = productos.filter(p => !porCodigo.has(p.codigo_interno));
  const descCambiada = productos.filter(p => {
    const e = porCodigo.get(p.codigo_interno);
    return e && String(e.descripcion || '').trim() !== p.descripcion.trim();
  });
  let ultimoEmb = '';
  for (const e of emb) if (e.actualizado_en > ultimoEmb) ultimoEmb = e.actualizado_en;
  const diasEmb = ultimoEmb ? Math.floor((Date.now() - new Date(ultimoEmb).getTime()) / 86400000) : null;

  console.log(`  productos          ${num(productos.length)}`);
  console.log(`  embebidos          ${num(emb.length)}`);
  console.log(`  ${sinVector.length ? mal(`sin vector         ${num(sinVector.length)}`) : ok(`sin vector         0`)}`);
  console.log(`  ${descCambiada.length ? ojo(`descripción movida ${num(descCambiada.length)} (vector desactualizado)`) : ok('descripciones      al día')}`);
  console.log(`  último embedding   hace ${diasEmb} día(s)`);
  if (sinVector.length) console.log(C.d('    p.ej. ' + sinVector.slice(0, 3).map(p => p.codigo_interno + ' ' + p.descripcion.slice(0, 30)).join(' · ')));

  // ── vocabulario
  console.log(titulo('DICCIONARIO'));
  const terminos = await contar('catalogo_vocabulario', 'activo=eq.true', 'termino');
  const cats = await traerTodo('catalogo_vocab_categorias', 'categoria,procesado_en', 'procesado_en.desc');
  const ultimoVocab = cats[0] ? cats[0].procesado_en : '';
  console.log(`  términos activos   ${num(terminos)}`);
  console.log(`  categorías         ${num(cats.length)}`);
  console.log(`  última corrida     ${String(ultimoVocab).slice(0, 10) || '—'}`);
  const vocabMasNuevo = Boolean(ultimoVocab && ultimoEmb && ultimoVocab > ultimoEmb);
  if (vocabMasNuevo) console.log('  ' + ojo('el vocabulario es MÁS NUEVO que los vectores: el texto embebido cambió'));

  // ── ventas
  console.log(titulo('RANKING POR VENTAS'));
  const pop = await contar('producto_popularidad');
  const rp = await sb('producto_popularidad?select=actualizado_en&order=actualizado_en.desc&limit=1');
  const ultimaPop = ((await rp.json())[0] || {}).actualizado_en || '';
  const diasPop = ultimaPop ? Math.floor((Date.now() - new Date(ultimaPop).getTime()) / 86400000) : null;
  const conStock = await contar('productos', 'existencia=gt.0');
  console.log(`  con datos de venta ${num(pop)}`);
  console.log(`  productos c/stock  ${num(conStock)}`);
  console.log(`  ${diasPop !== null && diasPop > 3 ? ojo(`última actualización hace ${diasPop} día(s)`) : ok(`actualizado hace ${diasPop} día(s)`)}`);

  // ── veredicto
  console.log(titulo('VEREDICTO'));
  const problemas = [];
  if (sinVector.length) problemas.push(`${sinVector.length} producto(s) sin vector`);
  if (descCambiada.length) problemas.push(`${descCambiada.length} con descripción movida`);
  if (vocabMasNuevo) problemas.push('vocabulario más nuevo que los vectores');
  if (diasPop !== null && diasPop > 3) problemas.push(`ranking de ventas de hace ${diasPop} días`);

  if (!problemas.length) {
    console.log('  ' + ok('capa vectorial y ranking al día'));
    return 0;
  }
  for (const p of problemas) console.log('  ' + mal(p));
  console.log('\n  ' + C.b('Para arreglarlo:'));
  if (sinVector.length || descCambiada.length || vocabMasNuevo) {
    console.log(C.d('    node rag.js embeddings        # avisa si conviene quitar el índice antes'));
  }
  if (diasPop !== null && diasPop > 3) console.log(C.d('    node rag.js popularidad'));
  return 1;
}

// ─────────────────────────────────────────────────────────────── buscar
async function buscar(consulta) {
  if (!consulta) { console.log('uso: node rag.js buscar "cemento gris"'); return 1; }
  const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
  const axiosShim = {
    async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
    async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: (c && c.headers) || {}, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
  };
  const fakeEnv = { OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'), OPENAI_API_KEY: pick('OPENAI_API_KEY') };
  const run = new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');
  const t0 = Date.now();
  let r;
  try { r = JSON.parse(await run({ p_busqueda: consulta }, n => (n === 'axios' ? axiosShim : require(n)), fakeEnv)); }
  catch (e) { console.log(mal('la búsqueda lanzó excepción: ' + e.message)); return 1; }
  const ms = Date.now() - t0;

  console.log(titulo(`"${consulta}"`));
  console.log(C.d(`  ${ms} ms · ${r.encontrados || 0} resultado(s)`) +
    (r.rescate ? C.a(`  · HIPÓTESIS (${r.rescate})`) : '') +
    (r.parcial ? C.a('  · parcial') : '') +
    (r.aclarar ? C.a('  · consulta vaga') : '') +
    (r.no_vendido ? C.a('  · marcado como no vendido') : ''));
  for (const p of (r.productos || [])) {
    console.log(`  ${p.disponible ? C.v('•') : C.r('•')} ${p.nombre}`);
    console.log(C.d(`      ${p.precio_divisas_texto}   ${p.precio_bs_texto}`));
  }
  if (!(r.productos || []).length) console.log(C.d('  (sin resultados)'));
  if (r.instruccion) console.log('\n  ' + C.b('instrucción al bot:') + '\n' + C.d('  ' + String(r.instruccion).slice(0, 260)));
  return 0;
}

// ─────────────────────────────────────────────────────────────── popularidad
async function popularidad() {
  const r = await fetch(`${SB}/rest/v1/rpc/refrescar_popularidad_reciente`, { method: 'POST', headers: H, body: '{}' });
  const t = await r.text();
  if (!r.ok) { console.log(mal('falló: ' + t.slice(0, 160))); return 1; }
  console.log(ok(`ranking por ventas recalculado: ${num(t)} productos con historial`));
  return 0;
}

// ─────────────────────────────────────────────────────────────── ayuda
function ayuda() {
  console.log(`
${C.b('rag')} — CLI de la capa de búsqueda de Perucho

${C.b('Diagnóstico')}
  ${C.b('estado')}                    salud de vectores, diccionario y ranking  ${C.d('(por defecto)')}
  ${C.b('buscar')} "<consulta>"       ejecuta una búsqueda real y muestra qué devuelve
  ${C.b('diag')} "<consulta>"         por qué la capa vectorial actuó o no en esa consulta

${C.b('Métricas')}
  ${C.b('medir')} [--sin-vector]      recall sobre 320 consultas coloquiales ${C.d('(~15 min)')}
  ${C.b('regresion')}                 51 casos, exige 0 falsos negativos ${C.d('(~2 min)')}
  ${C.b('vector')}                    margen señal/ruido del espacio vectorial
  ${C.b('fallos')}                    las consultas que de verdad escalaron a un empleado
  ${C.b('auditar')}                   audita el mapa SIN contra el catálogo real

${C.b('Mantenimiento')}
  ${C.b('embeddings')} [--dry]        genera los vectores que falten
  ${C.b('vocabulario')} [--dry]       regenera el diccionario coloquial
  ${C.b('descripciones')} [--piloto N] descripciones con Luna (solo lo vendido en 365 días)
  ${C.b('popularidad')}               recalcula el ranking por ventas recientes
  ${C.b('desplegar')} [--dry]         sube los dumps a n8n ${C.d('(corre npm test antes)')}

${C.d('El código está repartido en scripts/; este CLI los orquesta. `medir` cachea sus')}
${C.d('consultas a propósito: comparar dos corridas con preguntas distintas no mide nada.')}
`);
  return 0;
}

// ─────────────────────────────────────────────────────────────── despacho
const [cmd, ...rest] = process.argv.slice(2);
const resto = rest.filter(a => !a.startsWith('--'));
const flags = rest.filter(a => a.startsWith('--'));

(async () => {
  switch ((cmd || 'estado').toLowerCase()) {
    case 'estado': case 'status':        return await estado();
    case 'buscar': case 'search':        return await buscar(resto.join(' '));
    case 'diag':                         return correr('scripts/_diag_vector.js', resto.length ? [resto.join(' ')] : []) ? 0 : 1;
    case 'medir': case 'bench':          return correr('scripts/_test_coloquial.js', flags) ? 0 : 1;
    case 'regresion': case 'regression': return correr('scripts/_test_busqueda_50.js') ? 0 : 1;
    case 'vector':                       return correr('scripts/_test_vector.js') ? 0 : 1;
    case 'fallos':                       return correr('scripts/_test_fallos_reales.js', ['--prod']) ? 0 : 1;
    case 'auditar': case 'audit':        return correr('scripts/_audit_sin.js', flags) ? 0 : 1;
    case 'embeddings':                   return correr('scripts/generar_embeddings.js', flags) ? 0 : 1;
    case 'vocabulario':                  return correr('scripts/generar_vocabulario.js', flags) ? 0 : 1;
    case 'descripciones':                return correr('scripts/generar_descripciones.js', rest) ? 0 : 1;
    case 'popularidad':                  return await popularidad();
    case 'desplegar': case 'deploy':     return correr('scripts/deploy_nodos.js', flags) ? 0 : 1;
    case 'ayuda': case 'help': case '-h': case '--help': return ayuda();
    default:
      console.log(mal(`comando desconocido: "${cmd}"`));
      ayuda();
      return 1;
  }
})().then(c => process.exit(c || 0))
  .catch(e => { console.error(mal('ERROR: ' + e.message)); process.exit(1); });
