#!/usr/bin/env node
/**
 * rag — CLI único para la capa de búsqueda de Perucho.
 *
 *   node rag.js                    # estado del sistema
 *   node rag.js ayuda              # todos los comandos
 *
 * ORQUESTA los scripts existentes, no duplica su lógica: este repo ya pagó caro tener el
 * mismo matcher copiado en tres sitios. Lo único propio de aquí es `estado`, `buscar` y
 * el resumen de `suite`.
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

// ───────────────────────────────────────────────────────────────────── presentación
const TTY = process.stdout.isTTY;
const W = 64;                                   // ancho fijo: alinea todo sin depender del contenido
const e = (n, s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const c = {
  dim: s => e(2, s), bold: s => e(1, s),
  ok: s => e(32, s), err: s => e(31, s), warn: s => e(33, s),
  cyan: s => e(36, s), num: s => e(97, s),
};
// longitud visible (sin códigos de color) para poder alinear
const vis = s => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - vis(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - vis(s))) + s;

const GL = { ok: c.ok('✓'), err: c.err('✗'), warn: c.warn('▲'), dot: c.dim('·') };

function cabecera(titulo, sub) {
  const linea = '─'.repeat(W - 2);
  console.log('\n' + c.dim('╭' + linea + '╮'));
  const izq = ' ' + c.bold(c.cyan(titulo));
  const der = sub ? c.dim(sub) + ' ' : '';
  console.log(c.dim('│') + pad(izq, W - 2 - vis(der)) + der + c.dim('│'));
  console.log(c.dim('╰' + linea + '╯'));
}
function seccion(t) {
  console.log('\n ' + c.bold(t));
  console.log(' ' + c.dim('─'.repeat(W - 2)));
}
// fila etiqueta ......... valor  [glifo]
// El valor SIEMPRE termina en la misma columna; el glifo va después, fuera de esa columna.
// (Antes se restaba el ancho del glifo a la etiqueta y eso desalineaba las filas con estado.)
function fila(etiqueta, valor, glifo) {
  const anchoValor = 14;
  console.log('  ' + pad(c.dim(etiqueta), W - 6 - anchoValor) + padL(valor, anchoValor) + (glifo ? ' ' + glifo : ''));
}
function barra(pct, ancho) {
  const n = ancho || 22;
  const llenos = Math.round((pct / 100) * n);
  const color = pct >= 99.5 ? c.ok : pct >= 90 ? c.warn : c.err;
  return color('█'.repeat(llenos)) + c.dim('░'.repeat(n - llenos));
}
const num = n => Number(n).toLocaleString('es-VE');
const dias = d => (d === null ? '—' : d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`);

async function sb(q, extra) {
  const r = await fetch(`${SB}/rest/v1/${q}`, { headers: Object.assign({}, H, extra || {}) });
  if (!r.ok) throw new Error(`${q} -> ${r.status} ${(await r.text()).slice(0, 120)}`);
  return r;
}
async function contar(tabla, filtro, col) {
  // la columna varía por tabla (catalogo_vocabulario no tiene codigo_interno): se parametriza
  const r = await sb(`${tabla}?select=${col || 'codigo_interno'}&limit=1${filtro ? '&' + filtro : ''}`, { Prefer: 'count=exact' });
  return Number((r.headers.get('content-range') || '').split('/')[1] || 0);
}
// Comprueba que un proveedor responda de verdad, no solo que haya key.
// OpenAI bloquea Venezuela: sin VPN devuelve 403 unsupported_country_region_territory, y
// como buscar_productos envuelve la llamada en try/catch, la capa vectorial se apaga EN
// SILENCIO. Este chequeo existe para que eso no pase desapercibido.
async function sonda(nombre, url, opts, esperado) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 8000);
  const t0 = Date.now();
  try {
    const r = await fetch(url, Object.assign({ signal: ctrl.signal }, opts));
    clearTimeout(to);
    const ms = Date.now() - t0;
    if (r.ok) return { nombre, ok: true, ms };
    let codigo = '';
    try { const j = await r.json(); codigo = (j.error && (j.error.code || j.error.type)) || ''; } catch (x) {}
    const geo = r.status === 403 && /country|region|territory/i.test(codigo);
    return { nombre, ok: false, ms, estado: r.status, codigo, geo, esperado };
  } catch (x) {
    clearTimeout(to);
    return { nombre, ok: false, ms: Date.now() - t0, red: true, motivo: x.name === 'AbortError' ? 'sin respuesta en 8s' : x.message, esperado };
  }
}

async function traerTodo(tabla, select, orden) {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const d = await (await sb(`${tabla}?select=${select}&order=${orden}&offset=${off}&limit=1000`)).json();
    out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}
function correr(script, args) {
  return spawnSync(process.execPath, [path.join(ROOT, script), ...(args || [])], { stdio: 'inherit', cwd: ROOT }).status === 0;
}
// corre capturando la salida, para poder resumirla
function correrCapturando(script, args) {
  const r = spawnSync(process.execPath, [path.join(ROOT, script), ...(args || [])], { encoding: 'utf8', cwd: ROOT });
  return { salida: (r.stdout || '') + (r.stderr || ''), ok: r.status === 0 };
}

// ───────────────────────────────────────────────────────────────────── estado
async function estado() {
  const t0 = Date.now();
  cabecera('RAG · Perucho', 'Ferretería El Serrucho');

  const productos = (await traerTodo('productos', 'codigo_interno,descripcion,existencia', 'codigo_interno.asc'))
    .filter(p => p.descripcion && p.descripcion.trim());
  const emb = await traerTodo('productos_embedding', 'codigo_interno,descripcion,actualizado_en', 'codigo_interno.asc');
  const porCodigo = new Map(emb.map(x => [x.codigo_interno, x]));

  const sinVector = productos.filter(p => !porCodigo.has(p.codigo_interno));
  const movidas = productos.filter(p => {
    const x = porCodigo.get(p.codigo_interno);
    return x && String(x.descripcion || '').trim() !== p.descripcion.trim();
  });
  let ultEmb = '';
  for (const x of emb) if (x.actualizado_en > ultEmb) ultEmb = x.actualizado_en;
  const dEmb = ultEmb ? Math.floor((Date.now() - new Date(ultEmb).getTime()) / 86400000) : null;
  const cobertura = productos.length ? ((productos.length - sinVector.length) / productos.length) * 100 : 0;

  seccion('CATÁLOGO Y VECTORES');
  fila('productos en catálogo', c.num(num(productos.length)));
  fila('con vector', c.num(num(emb.length)));
  fila('cobertura vectorial', c.num(cobertura.toFixed(1) + '%'));
  console.log('  ' + barra(cobertura, W - 6));
  fila('sin vector', c.num(num(sinVector.length)), sinVector.length ? GL.err : GL.ok);
  fila('descripción movida', c.num(num(movidas.length)), movidas.length ? GL.warn : GL.ok);
  fila('último embedding', dias(dEmb));
  if (sinVector.length) {
    console.log('  ' + c.dim('└ p.ej. ' + sinVector.slice(0, 3).map(p => p.codigo_interno + ' ' + p.descripcion.slice(0, 26)).join('  ')));
  }

  seccion('DICCIONARIO COLOQUIAL');
  const terminos = await contar('catalogo_vocabulario', 'activo=eq.true', 'termino');
  const cats = await traerTodo('catalogo_vocab_categorias', 'categoria,procesado_en', 'procesado_en.desc');
  const ultVocab = cats[0] ? cats[0].procesado_en : '';
  const vocabNuevo = Boolean(ultVocab && ultEmb && ultVocab > ultEmb);
  fila('términos activos', c.num(num(terminos)));
  fila('categorías cubiertas', c.num(num(cats.length)));
  fila('última generación', String(ultVocab).slice(0, 10) || '—', vocabNuevo ? GL.warn : GL.ok);
  if (vocabNuevo) console.log('  ' + c.warn('└ es más nuevo que los vectores: el texto embebido cambió'));

  seccion('RANKING POR VENTAS');
  // OJO: el stock fantasma NO es (con existencia − filas de popularidad). Son conjuntos
  // que solo se solapan en parte: 1.602 productos con historial ya no tienen stock, y
  // compensaban a los que tienen stock y nunca vendieron. Esa resta daba 379 cuando la
  // cifra real son ~2.600. Hay que cruzar los códigos de verdad.
  const popRows = await traerTodo('producto_popularidad', 'codigo_interno,ultima_venta', 'codigo_interno.asc');
  const ventaPorCodigo = new Map(popRows.map(x => [x.codigo_interno, x.ultima_venta]));
  const haceUnAno = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

  const conStockArr = productos.filter(p => Number(p.existencia) > 0);
  const fantasma = conStockArr.filter(p => {
    const uv = ventaPorCodigo.get(p.codigo_interno);
    return !uv || String(uv).slice(0, 10) < haceUnAno;
  });
  const pctFantasma = conStockArr.length ? (fantasma.length / conStockArr.length) * 100 : 0;

  const ultPop = ((await (await sb('producto_popularidad?select=actualizado_en&order=actualizado_en.desc&limit=1')).json())[0] || {}).actualizado_en || '';
  const dPop = ultPop ? Math.floor((Date.now() - new Date(ultPop).getTime()) / 86400000) : null;

  fila('con historial de venta', c.num(num(popRows.length)));
  fila('con existencia', c.num(num(conStockArr.length)));
  fila('stock sin venta en 1 año', c.num(num(fantasma.length)) + c.dim(` (${pctFantasma.toFixed(0)}%)`), pctFantasma > 30 ? GL.warn : GL.ok);
  fila('recalculado', dias(dPop), dPop !== null && dPop > 3 ? GL.warn : GL.ok);
  if (pctFantasma > 30) console.log('  ' + c.dim('└ el ranking por ventas los hunde solos: score 0 o negativo'));

  // ── conectividad: sin esto, las capas 4 y 5 se apagan sin avisar
  seccion('CONECTIVIDAD');
  const OAI = pick('OPENAI_API_KEY');
  const OR = pick('OPENROUTER_API_KEY');
  const sondas = await Promise.all([
    OR ? sonda('OpenRouter · Luna', 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OR, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-5.6-luna', max_tokens: 1, messages: [{ role: 'user', content: 'ok' }] }),
    }, 'el bot no puede responder a nadie') : Promise.resolve({ nombre: 'OpenRouter · Luna', ok: false, faltaKey: true, esperado: 'el bot no puede responder a nadie' }),
    OAI ? sonda('OpenAI · embeddings', 'https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: 'ok', dimensions: 1536 }),
    }, 'capa vectorial apagada') : Promise.resolve({ nombre: 'OpenAI · embeddings', ok: false, faltaKey: true, esperado: 'capa vectorial apagada' }),
  ]);

  const caidos = [];
  for (const s of sondas) {
    if (s.ok) { fila(s.nombre, c.num(s.ms + ' ms'), GL.ok); continue; }
    const detalle = s.faltaKey ? 'sin key' : s.geo ? 'bloqueo por país' : s.red ? s.motivo : `HTTP ${s.estado}`;
    fila(s.nombre, c.err(detalle), GL.err);
    if (s.geo) console.log('  ' + c.warn('└ ¿VPN caída? OpenAI bloquea Venezuela: sin VPN no hay embeddings'));
    caidos.push(s);
  }

  // ── el coseno en vivo: sin esto el margen señal/ruido puede derrumbarse sin que nadie
  // lo note. Un vector "funciona" siempre (devuelve vecinos); lo que decide si SIRVE es la
  // distancia entre una consulta legítima y texto sin sentido.
  let margenVector = null;
  if (sondas[1].ok) {
    const vecs = await embeder([DEMO, BASURA]);
    if (vecs) {
      const [top, ruido] = await Promise.all([vecinos(vecs[0], 3), vecinos(vecs[1], 1)]);
      if (top.length) {
        const simRuido = ruido.length ? ruido[0].similitud : 0;
        margenVector = top[0].similitud - simRuido;
        seccion('EL COSENO EN VIVO');
        console.log('  ' + c.dim('cos(θ) = (A · B) / (|A| · |B|)  sobre 1.536 dimensiones'));
        console.log('  ' + c.bold(`"${DEMO}"`) + c.dim('  → vecinos más cercanos'));
        for (const f of top) {
          console.log('   ' + (f.similitud >= UMBRAL_VECTOR ? c.ok(f.similitud.toFixed(3)) : c.dim(f.similitud.toFixed(3))) +
            ' ' + barraSim(f.similitud, 20) + ' ' + c.dim(f.descripcion.slice(0, 28)));
        }
        console.log('   ' + c.err(simRuido.toFixed(3)) + ' ' + barraSim(simRuido, 20) + ' ' + c.dim('texto sin sentido (suelo)'));
        const sano = margenVector > 0.05;
        console.log('  ' + (sano ? GL.ok : GL.err) + ' ' + c.bold('margen ' + margenVector.toFixed(3)) + '  ' +
          (sano ? c.dim(`el umbral ${UMBRAL_VECTOR} separa de verdad`) : c.err('sin separación: la capa no aporta')));
        console.log('  ' + c.dim('└ detalle: ') + c.cyan('node rag.js coseno "lo que sea"'));
      }
    }
  }

  // ── veredicto
  const problemas = [];
  for (const s of caidos) problemas.push([`${s.nombre} no responde → ${s.esperado}`, null]);
  if (sinVector.length) problemas.push([`${num(sinVector.length)} producto(s) sin vector`, 'embeddings']);
  if (movidas.length) problemas.push([`${num(movidas.length)} con la descripción cambiada`, 'embeddings']);
  if (vocabNuevo) problemas.push(['vocabulario más nuevo que los vectores', 'embeddings']);
  if (dPop !== null && dPop > 3) problemas.push([`ranking de ventas de ${dias(dPop)}`, 'popularidad']);
  if (margenVector !== null && margenVector <= 0.05) problemas.push(['margen señal/ruido de ' + margenVector.toFixed(3) + ': la capa vectorial no aporta', 'embeddings']);

  console.log('');
  if (!problemas.length) {
    console.log(' ' + c.ok('▎') + ' ' + c.bold('Todo al día') + c.dim(`  ·  ${((Date.now() - t0) / 1000).toFixed(1)}s`));
    return 0;
  }
  console.log(' ' + c.err('▎') + ' ' + c.bold('Requiere acción'));
  for (const [p] of problemas) console.log('   ' + GL.err + ' ' + p);
  // los fallos de red no se arreglan con un comando (van con null): no inventar uno
  const cmds = [...new Set(problemas.map(p => p[1]).filter(Boolean))];
  if (cmds.length) {
    console.log('\n   ' + c.dim('ejecuta:') + '  ' + cmds.map(x => c.cyan('node rag.js ' + x)).join(c.dim('  y  ')));
  }
  return 1;
}

// ───────────────────────────────────────────────────────────────────── coseno
// Explica la capa vectorial con datos EN VIVO, no con un dibujo decorativo. Lo que hace
// entendible este sistema no es la fórmula, es ver la distancia entre una consulta legítima
// y texto sin sentido: si esa separación no existe, ningún umbral sirve y la capa es inútil
// por diseño (fue exactamente lo que pasó con los embeddings v1, margen 0.012).
const UMBRAL_VECTOR = 0.45;
const BASURA = 'asdfgh qwerty zzz';
const DEMO = 'tapa para el baño';

async function embeder(textos) {
  const OAI = pick('OPENAI_API_KEY');
  if (!OAI) return null;
  const r = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: textos, dimensions: 1536 }),
  });
  const j = await r.json();
  if (!r.ok || j.error) return null;
  return j.data.map(d => d.embedding);
}
async function vecinos(vec, limite) {
  const r = await fetch(`${SB}/rest/v1/rpc/buscar_semantico`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ p_embedding: JSON.stringify(vec), p_umbral: 0, p_limite: limite || 5 }),
  });
  try { const d = await r.json(); return Array.isArray(d) ? d : []; } catch (x) { return []; }
}
// barra proporcional a la similitud, con el umbral marcado en su posición real
function barraSim(sim, ancho) {
  const n = ancho || 24;
  const llenos = Math.max(0, Math.min(n, Math.round(sim * n)));
  const color = sim >= UMBRAL_VECTOR ? c.ok : c.dim;
  return color('█'.repeat(llenos)) + c.dim('·'.repeat(n - llenos));
}
const grados = sim => (Math.acos(Math.max(-1, Math.min(1, sim))) * 180 / Math.PI).toFixed(0) + '°';

async function coseno(consulta) {
  const q = consulta || DEMO;
  cabecera('CÓMO DECIDE EL VECTOR', 'similitud de coseno');

  console.log(' ' + c.dim('Cada descripción se convierte en un vector de 1.536 números. Dos textos'));
  console.log(' ' + c.dim('se comparan por el ÁNGULO entre sus vectores, no por sus palabras:'));
  console.log('');
  console.log('   ' + c.cyan('cos(θ) = (A · B) / (|A| · |B|)') + c.dim('     1 = mismo sentido · 0 = sin relación'));

  const vecs = await embeder([q, BASURA]);
  if (!vecs) { console.log('\n ' + GL.err + ' no pude embeber (¿VPN caída? OpenAI bloquea Venezuela)'); return 1; }

  const [top, ruido] = await Promise.all([vecinos(vecs[0], 5), vecinos(vecs[1], 1)]);
  if (!top.length) { console.log('\n ' + GL.err + ' la RPC no devolvió nada'); return 1; }

  console.log('\n ' + c.bold(`"${q}"`) + c.dim('  → los 5 vectores más cercanos del catálogo'));
  console.log(' ' + c.dim('─'.repeat(W - 2)));
  for (const f of top) {
    const pasa = f.similitud >= UMBRAL_VECTOR;
    console.log('  ' + (pasa ? c.ok(f.similitud.toFixed(3)) : c.dim(f.similitud.toFixed(3))) +
      ' ' + c.dim(padL(grados(f.similitud), 4)) + '  ' + barraSim(f.similitud) +
      '  ' + f.descripcion.slice(0, 34));
  }

  // el umbral y el suelo de ruido, que es lo que de verdad explica la decisión
  const simRuido = ruido.length ? ruido[0].similitud : 0;
  console.log(' ' + c.dim('─'.repeat(W - 2)));
  console.log('  ' + c.warn(UMBRAL_VECTOR.toFixed(3)) + c.dim('       ' + '╌'.repeat(24) + '  umbral: por debajo no se adopta'));
  console.log('  ' + c.err(simRuido.toFixed(3)) + ' ' + c.dim(padL(grados(simRuido), 4)) + '  ' + barraSim(simRuido) +
    '  ' + c.dim(`"${BASURA}" (sin sentido)`));

  const margen = top[0].similitud - simRuido;
  console.log('');
  const sano = margen > 0.05;
  console.log(' ' + (sano ? c.ok('▎') : c.err('▎')) + ' ' + c.bold('margen señal/ruido ' + margen.toFixed(3)) + '  ' +
    (sano ? c.dim('hay separación: el umbral distingue de verdad') : c.err('NO hay umbral posible: la capa es inservible')));
  console.log(' ' + c.dim('  Con los embeddings v1 este margen era 0.012 y la capa aportaba cero.'));
  console.log(' ' + c.dim('  Enriquecer el texto (categoría + coloquialismos) lo llevó a ~0.12.'));
  return 0;
}

// ───────────────────────────────────────────────────────────────────── buscar
async function buscar(consulta) {
  if (!consulta) { console.log(' uso: ' + c.cyan('node rag.js buscar "cemento gris"')); return 1; }
  const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
  const ax = {
    async get(u, cfg) { const r = await fetch(u, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
    async post(u, b, cfg) { const r = await fetch(u, { method: 'POST', headers: (cfg && cfg.headers) || {}, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (x) {} return { data: d }; },
  };
  const fakeEnv = { OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'), OPENAI_API_KEY: pick('OPENAI_API_KEY') };
  const run = new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');
  const t0 = Date.now();
  let r;
  try { r = JSON.parse(await run({ p_busqueda: consulta }, n => (n === 'axios' ? ax : require(n)), fakeEnv)); }
  catch (x) { console.log(' ' + GL.err + ' la búsqueda lanzó excepción: ' + x.message); return 1; }
  const ms = Date.now() - t0;

  cabecera(`"${consulta}"`, `${ms} ms`);
  const marcas = [];
  if (r.rescate) marcas.push(c.warn('HIPÓTESIS → ' + r.rescate));
  if (r.parcial) marcas.push(c.warn('parcial'));
  if (r.aclarar) marcas.push(c.warn('consulta vaga'));
  if (r.no_vendido) marcas.push(c.warn('no vendido'));
  console.log(' ' + c.dim(`${r.encontrados || 0} resultado(s)`) + (marcas.length ? '   ' + marcas.join(c.dim(' · ')) : ''));
  console.log('');

  for (const p of (r.productos || [])) {
    console.log('  ' + (p.disponible ? c.ok('●') : c.err('●')) + ' ' + p.nombre);
    console.log('    ' + c.dim(pad(p.precio_divisas_texto, 10) + p.precio_bs_texto));
  }
  if (!(r.productos || []).length) console.log('  ' + c.dim('(sin resultados)'));

  if (r.instruccion) {
    console.log('\n ' + c.dim('instrucción al bot'));
    console.log(' ' + c.dim('─'.repeat(W - 2)));
    console.log(' ' + String(r.instruccion).slice(0, 300).replace(/\n/g, '\n '));
  }
  return 0;
}

// ───────────────────────────────────────────────────────────────────── suite
// Corre TODOS los harness de una y resume. Es la foto completa de la calidad de búsqueda.
async function suite(flags) {
  const rapida = flags.includes('--rapida');
  cabecera('SUITE DE BÚSQUEDA', rapida ? 'modo rápido' : 'completa');
  if (!rapida) console.log(' ' + c.dim('el recall de 320 tarda ~15 min; usa --rapida para saltarlo'));

  const pasos = [
    { nombre: 'Regresión', script: 'scripts/_test_busqueda_50.js', args: [], parse: s => {
      const m = s.match(/Total:\s*(\d+)[\s\S]*?FALSO-NEGATIVO sospechoso:\s*(\d+)[\s\S]*?excepciones:\s*(\d+)/);
      if (!m) return null;
      return { casos: +m[1], fallos: +m[2] + +m[3], detalle: `${m[2]} falsos negativos · ${m[3]} excepciones` };
    } },
    { nombre: 'Fallos reales', script: 'scripts/_test_fallos_reales.js', args: ['--prod'], parse: s => {
      const m = s.match(/evaluadas:\s*(\d+)\s*\|\s*con resultados:\s*(\d+)[\s\S]*?sin nada:\s*(\d+)/);
      if (!m) return null;
      return { casos: +m[1], fallos: +m[3], detalle: `${m[2]} encuentran · ${m[3]} sin nada` };
    } },
    { nombre: 'Margen vectorial', script: 'scripts/_test_vector.js', args: [], parse: s => {
      const m = s.match(/aciertos en el top-1:\s*(\d+)\/(\d+)[\s\S]*?MARGEN[^:]*:\s*([\d.]+)/);
      if (!m) return null;
      const margen = parseFloat(m[3]);
      return { casos: +m[2], fallos: +m[2] - +m[1], detalle: `margen ${margen.toFixed(3)} ${margen > 0.05 ? '(umbral posible)' : '(INSERVIBLE)'}` };
    } },
  ];
  if (!rapida) pasos.push({ nombre: 'Recall coloquial', script: 'scripts/_test_coloquial.js', args: [], parse: s => {
    const m = s.match(/casos:\s*(\d+)[\s\S]*?producto exacto en resultados\s*:\s*(\d+)\s*\(([\d.]+)%\)[\s\S]*?fallo total\s*:\s*(\d+)/);
    if (!m) return null;
    return { casos: +m[1], fallos: +m[4], detalle: `${m[2]} exactos (${m[3]}%) · ${m[4]} fallos` };
  } });

  console.log('');
  let totalCasos = 0, totalFallos = 0, rotos = 0;
  for (const p of pasos) {
    // el progreso en el sitio solo tiene sentido en terminal: por tubería el \r queda literal
    if (TTY) process.stdout.write('  ' + c.dim('▸ ') + pad(p.nombre, 20) + c.dim('corriendo…'));
    const t0 = Date.now();
    const { salida } = correrCapturando(p.script, p.args);
    const r = p.parse(salida);
    const seg = ((Date.now() - t0) / 1000).toFixed(0) + 's';
    if (TTY) process.stdout.write('\r' + ' '.repeat(W) + '\r');   // borrar el "corriendo…", no solo volver al inicio
    if (!r) { console.log('  ' + GL.err + ' ' + pad(p.nombre, 20) + c.err('no pude leer el resultado') + c.dim('  ' + seg)); rotos++; continue; }
    totalCasos += r.casos; totalFallos += r.fallos;
    const g = r.fallos === 0 ? GL.ok : GL.warn;
    console.log('  ' + g + ' ' + pad(p.nombre, 20) + pad(c.num(r.casos + ' casos'), 12) + c.dim(r.detalle) + c.dim('  ' + seg));
  }

  console.log('\n ' + c.dim('─'.repeat(W - 2)));
  const sano = totalFallos === 0 && rotos === 0;
  console.log(' ' + (sano ? c.ok('▎') : c.warn('▎')) + ' ' + c.bold(`${num(totalCasos)} casos`) +
    c.dim('  ·  ') + (totalFallos ? c.warn(`${totalFallos} con problema`) : c.ok('sin fallos')));
  return sano ? 0 : 1;
}

// ───────────────────────────────────────────────────────────────────── popularidad
async function popularidad() {
  const r = await fetch(`${SB}/rest/v1/rpc/refrescar_popularidad_reciente`, { method: 'POST', headers: H, body: '{}' });
  const t = await r.text();
  if (!r.ok) { console.log(' ' + GL.err + ' falló: ' + t.slice(0, 160)); return 1; }
  console.log(' ' + GL.ok + ' ranking recalculado: ' + c.num(num(t)) + ' productos con historial de venta');
  return 0;
}

// ───────────────────────────────────────────────────────────────────── ayuda
function ayuda() {
  cabecera('RAG · Perucho', 'CLI de la capa de búsqueda');
  const g = (t, items) => {
    console.log('\n ' + c.bold(t));
    for (const [cmd, desc, nota] of items) {
      console.log('   ' + c.cyan(pad(cmd, 26)) + desc + (nota ? ' ' + c.dim(nota) : ''));
    }
  };
  g('Diagnóstico', [
    ['estado', 'salud de vectores, diccionario y ventas', '(por defecto)'],
    ['buscar "<consulta>"', 'ejecuta una búsqueda real y muestra qué devuelve'],
    ['diag "<consulta>"', 'por qué la capa vectorial actuó o no'],
    ['coseno ["<consulta>"]', 'el coseno en vivo: vecinos, umbral y suelo de ruido'],
  ]);
  g('Métricas', [
    ['suite [--rapida]', 'TODOS los harness de una vez', '(~18 min)'],
    ['medir [--sin-vector]', 'recall sobre 320 consultas coloquiales', '(~15 min)'],
    ['regresion', '86 casos, exige 0 falsos negativos', '(~2 min)'],
    ['vector', 'margen señal/ruido del espacio vectorial'],
    ['fallos', 'consultas que escalaron a un empleado'],
    ['auditar', 'audita el mapa SIN contra el catálogo'],
  ]);
  g('Mantenimiento', [
    ['embeddings [--dry]', 'genera los vectores que falten'],
    ['vocabulario [--dry]', 'regenera el diccionario coloquial'],
    ['descripciones [--piloto N]', 'descripciones con Luna (vendido en 365d)'],
    ['popularidad', 'recalcula el ranking por ventas'],
    ['desplegar [--dry]', 'sube los dumps a n8n', '(corre npm test antes)'],
  ]);
  console.log('\n ' + c.dim('`medir` cachea sus consultas a propósito: comparar dos corridas con'));
  console.log(' ' + c.dim('preguntas distintas no mide nada.') + '\n');
  return 0;
}

// ───────────────────────────────────────────────────────────────────── despacho
const [cmd, ...rest] = process.argv.slice(2);
const resto = rest.filter(a => !a.startsWith('--'));
const flags = rest.filter(a => a.startsWith('--'));

(async () => {
  switch ((cmd || 'estado').toLowerCase()) {
    case 'estado': case 'status':        return await estado();
    case 'buscar': case 'search':        return await buscar(resto.join(' '));
    case 'coseno': case 'vectores':  return await coseno(resto.join(' '));
    case 'diag':                         return correr('scripts/_diag_vector.js', resto.length ? [resto.join(' ')] : []) ? 0 : 1;
    case 'suite':                        return await suite(flags);
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
      console.log(' ' + GL.err + ` comando desconocido: "${cmd}"`);
      ayuda();
      return 1;
  }
})().then(x => process.exit(x || 0))
  .catch(x => { console.error(' ' + GL.err + ' ERROR: ' + x.message); process.exit(1); });
