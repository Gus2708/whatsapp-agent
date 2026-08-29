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
  out('\n' + c.dim('╭' + linea + '╮'));
  const izq = ' ' + c.bold(c.cyan(titulo));
  const der = sub ? c.dim(sub) + ' ' : '';
  out(c.dim('│') + pad(izq, W - 2 - vis(der)) + der + c.dim('│'));
  out(c.dim('╰' + linea + '╯'));
}
function seccion(t) {
  out('\n ' + c.bold(t));
  out(' ' + c.dim('─'.repeat(W - 2)));
}
// fila etiqueta ......... valor  [glifo]
// El valor SIEMPRE termina en la misma columna; el glifo va después, fuera de esa columna.
// (Antes se restaba el ancho del glifo a la etiqueta y eso desalineaba las filas con estado.)
function fila(etiqueta, valor, glifo) {
  const anchoValor = 14;
  out('  ' + pad(c.dim(etiqueta), W - 6 - anchoValor) + padL(valor, anchoValor) + (glifo ? ' ' + glifo : ''));
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
    // spin.fin(); // spin no está definido aquí
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

// ─────────────────────────────────────────────────────── salida en dos columnas
// `estado` tarda ~14s y hasta ahora no imprimía NADA hasta el final: parecía colgado.
// Ahora la salida se acumula en un buffer mientras un spinner dice en qué va, y al
// terminar se pinta todo de una. Como efecto secundario, tener el texto en un buffer
// permite montarlo en dos columnas: métricas a la izquierda, gráficas a la derecha.
const SALTO = String.fromCharCode(10);   // escribirlo como escape se pierde al generar este archivo
let CAP = null;
const out = s => { if (!CAP) return console.log(s); for (const l of String(s).split(SALTO)) CAP.push(l); };

const COLS = Number(process.env.RAG_COLS) || process.stdout.columns || 80;
const AD = 46;                                  // ancho de la columna derecha
const DOBLE = COLS >= W + AD + 4;               // si no cabe, se apilan

function cargando() {
  if (!TTY) return { paso() {}, fin() {} };
  const marcos = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0, txt = '';
  const t = setInterval(() => {
    process.stdout.write('\r\x1b[2K ' + c.cyan(marcos[i++ % marcos.length]) + ' ' + c.dim(txt));
  }, 90);
  t.unref();
  return {
    paso(s) { txt = s; },
    fin() { clearInterval(t); process.stdout.write('\r\x1b[2K'); },
  };
}

function dosColumnas(izq, derIn) {
  if (!DOBLE) { for (const l of izq) console.log(l); for (const l of derIn) console.log(l); return; }
  const der = ['', '', '', ...derIn];               // arranca bajo el marco del título
  const n = Math.max(izq.length, der.length);
  for (let i = 0; i < n; i++) {
    const d = der[i] || '';
    console.log(pad(izq[i] || '', W + 2) + c.dim('│') + (d ? ' ' + d : ''));
  }
}

// ── piezas de gráfica para la columna derecha
function tituloDer(t) { return ['', ' ' + c.bold(t), ' ' + c.dim('─'.repeat(AD - 2))]; }
function barraH(valor, max, ancho, color) {
  const n = max > 0 ? Math.round((valor / max) * ancho) : 0;
  return (color || c.cyan)('█'.repeat(n)) + c.dim('░'.repeat(Math.max(0, ancho - n)));
}

// productos agrupados por el mes de su última venta: dice cuánto del catálogo sigue vivo
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function panelActividad(popRows) {
  const cubos = new Map();
  let viejos = 0;
  const hoy = new Date();
  const limite = new Date(hoy.getFullYear(), hoy.getMonth() - 7, 1).toISOString().slice(0, 7);
  for (const r of popRows) {
    const ym = String(r.ultima_venta || '').slice(0, 7);
    if (!ym) continue;
    if (ym < limite) { viejos++; continue; }
    cubos.set(ym, (cubos.get(ym) || 0) + 1);
  }
  const claves = [];
  for (let k = 7; k >= 0; k--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - k, 1);
    claves.push(d.toISOString().slice(0, 7));
  }
  const max = Math.max(1, ...claves.map(k => cubos.get(k) || 0));
  const L = tituloDer('ACTIVIDAD DEL CATÁLOGO');
  L.push(' ' + c.dim('productos según el mes de su última venta'));
  for (const k of claves) {
    const v = cubos.get(k) || 0;
    const et = MESES[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4);
    L.push('  ' + c.dim(et) + ' ' + barraH(v, max, 22) + ' ' + padL(c.num(num(v)), 6));
  }
  // 'antes' agrupa 8+ meses: dibujarle una barra al lado de un mes suelto engaña
  L.push('  ' + c.dim(pad('antes', 29)) + padL(c.dim(num(viejos)), 6));
  return L;
}

function panelStock(vivos, fantasma) {
  const tot = vivos + fantasma;
  const p = v => (tot ? (v / tot) * 100 : 0);
  const L = tituloDer('COMPOSICIÓN DEL STOCK');
  L.push(' ' + c.dim('los ' + num(tot) + ' productos con existencia'));
  L.push('  ' + c.dim(pad('vendido en 1 año', 17)) + barraH(vivos, tot, 14, c.ok) + ' ' + padL(c.num(num(vivos)), 6) + c.dim(p(vivos).toFixed(0).padStart(4) + '%'));
  L.push('  ' + c.dim(pad('sin venta', 17)) + barraH(fantasma, tot, 14, c.warn) + ' ' + padL(c.num(num(fantasma)), 6) + c.dim(p(fantasma).toFixed(0).padStart(4) + '%'));
  return L;
}

// ───────────────────────────────────────────────────────────────────── estado
async function estado() {
  const t0 = Date.now();
  const spin = cargando();
  CAP = [];                                     // a partir de aquí la salida se acumula
  cabecera('RAG · Perucho', 'Ferretería El Serrucho');

  spin.paso('leyendo el catálogo…');
  const productos = (await traerTodo('productos', 'codigo_interno,descripcion,existencia', 'codigo_interno.asc'))
    .filter(p => p.descripcion && p.descripcion.trim());
  spin.paso('leyendo los vectores…');
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
  out('  ' + barra(cobertura, W - 6));
  fila('sin vector', c.num(num(sinVector.length)), sinVector.length ? GL.err : GL.ok);
  fila('descripción movida', c.num(num(movidas.length)), movidas.length ? GL.warn : GL.ok);
  fila('último embedding', dias(dEmb));
  if (sinVector.length) {
    out('  ' + c.dim('└ p.ej. ' + sinVector.slice(0, 3).map(p => p.codigo_interno + ' ' + p.descripcion.slice(0, 26)).join('  ')));
  }

  spin.paso('diccionario coloquial…');
  seccion('DICCIONARIO COLOQUIAL');
  const terminos = await contar('catalogo_vocabulario', 'activo=eq.true', 'termino');
  const cats = await traerTodo('catalogo_vocab_categorias', 'categoria,procesado_en', 'procesado_en.desc');
  const ultVocab = cats[0] ? cats[0].procesado_en : '';
  const vocabNuevo = Boolean(ultVocab && ultEmb && ultVocab > ultEmb);
  fila('términos activos', c.num(num(terminos)));
  fila('categorías cubiertas', c.num(num(cats.length)));
  fila('última generación', String(ultVocab).slice(0, 10) || '—', vocabNuevo ? GL.warn : GL.ok);
  if (vocabNuevo) out('  ' + c.warn('└ es más nuevo que los vectores: el texto embebido cambió'));

  spin.paso('ranking por ventas…');
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
  if (pctFantasma > 30) out('  ' + c.dim('└ el ranking por ventas los hunde solos: score 0 o negativo'));

  // ── conectividad: sin esto, las capas 4 y 5 se apagan sin avisar
  spin.paso('probando OpenRouter y OpenAI…');
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
    if (s.geo) out('  ' + c.warn('└ ¿VPN caída? OpenAI bloquea Venezuela: sin VPN no hay embeddings'));
    caidos.push(s);
  }

  // ── el coseno en vivo: sin esto el margen señal/ruido puede derrumbarse sin que nadie
  // lo note. Un vector "funciona" siempre (devuelve vecinos); lo que decide si SIRVE es la
  // distancia entre una consulta legítima y texto sin sentido.
  spin.paso('midiendo el coseno en vivo…');
  let margenVector = null;
  const panelCos = tituloDer('EL COSENO EN VIVO');
  if (!sondas[1].ok) {
    panelCos.push(' ' + c.dim('sin OpenAI no se puede medir'));
  } else {
    const vecs = await embeder([DEMO, BASURA]);
    const [top, ruido] = vecs ? await Promise.all([vecinos(vecs[0], 4), vecinos(vecs[1], 1)]) : [[], []];
    if (!top.length) {
      panelCos.push(' ' + c.dim('la RPC no devolvió vecinos'));
    } else {
      const simRuido = ruido.length ? ruido[0].similitud : 0;
      margenVector = top[0].similitud - simRuido;
      panelCos.push(' ' + c.dim('cos(θ) sobre 1.536 dimensiones'));
      panelCos.push(' ' + c.bold(`"${DEMO}"`) + c.dim(' → vecinos'));
      for (const f of top) {
        panelCos.push('  ' + (f.similitud >= UMBRAL_VECTOR ? c.ok(f.similitud.toFixed(3)) : c.dim(f.similitud.toFixed(3))) +
          ' ' + barraSim(f.similitud, 14) + ' ' + c.dim(f.descripcion.slice(0, 20)));
      }
      panelCos.push('  ' + c.warn(UMBRAL_VECTOR.toFixed(3)) + ' ' + c.dim('╌'.repeat(14)) + ' ' + c.dim('umbral'));
      panelCos.push('  ' + c.err(simRuido.toFixed(3)) + ' ' + barraSim(simRuido, 14) + ' ' + c.dim('ruido (suelo)'));
      const sano = margenVector > 0.05;
      panelCos.push('  ' + (sano ? GL.ok : GL.err) + ' ' + c.bold('margen ' + margenVector.toFixed(3)) +
        (sano ? c.dim('  separa de verdad') : c.err('  la capa no aporta')));
    }
  }
  panelCos.push('  ' + c.dim('└ ') + c.cyan('rag.js coseno "..."'));

  spin.fin();
  const izq = CAP; CAP = null;
  const der = [...panelCos, ...panelActividad(popRows), ...panelStock(conStockArr.length - fantasma.length, fantasma.length)];
  dosColumnas(izq, der);

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

// ──────────────────────────────────────────────────── lienzo braille (2x4 por carácter)
// Para dibujar los vectores de verdad hace falta más resolución que un carácter por punto.
// Braille da 2x4 subpíxeles por celda, que es lo que permite que una diagonal se vea recta.
const PUNTO = [[0x01, 0x02, 0x04, 0x40], [0x08, 0x10, 0x20, 0x80]];

function lienzo(cols, filas) {
  const PX = cols * 2, PY = filas * 4;
  const celdas = new Uint8Array(cols * filas);
  const tinte = new Array(cols * filas).fill(null);
  const rotulos = [];
  const dentro = (x, y) => x >= 0 && y >= 0 && x < PX && y < PY;
  return {
    PX, PY,
    punto(x, y, color) {
      x = Math.round(x); y = Math.round(y);
      if (!dentro(x, y)) return;
      const i = (y >> 2) * cols + (x >> 1);
      celdas[i] |= PUNTO[x & 1][y & 3];
      if (color) tinte[i] = color;
    },
    // Bresenham: sin él las diagonales quedan con escalones desiguales
    linea(x0, y0, x1, y1, color) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      for (;;) {
        this.punto(x0, y0, color);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },
    arco(cx, cy, r, a0, a1, color) {
      const paso = 1 / Math.max(r, 1);
      const [ini, fin] = a0 < a1 ? [a0, a1] : [a1, a0];
      for (let a = ini; a <= fin; a += paso) this.punto(cx + r * Math.cos(a), cy - r * Math.sin(a), color);
    },
    // el texto va por encima del braille, en coordenadas de carácter
    texto(col, fila, s, color) { rotulos.push({ col, fila, s, color }); },
    render() {
      const filasTxt = [];
      for (let f = 0; f < filas; f++) {
        const celda = [];
        for (let x = 0; x < cols; x++) {
          const i = f * cols + x;
          celda.push(celdas[i] ? (tinte[i] || (s => s))(String.fromCharCode(0x2800 + celdas[i])) : ' ');
        }
        filasTxt.push(celda);
      }
      // El rótulo entero se mete en su PRIMERA celda ya coloreado y las siguientes quedan
      // vacías: así el ancho visible sigue siendo el del texto y no hay que abrir y cerrar
      // el color celda a celda.
      for (const r of rotulos) {
        if (r.fila < 0 || r.fila >= filas || r.col >= cols) continue;
        const s = r.s.slice(0, cols - Math.max(0, r.col));
        const col = Math.max(0, r.col);
        filasTxt[r.fila][col] = (r.color || (x => x))(s);
        for (let k = 1; k < s.length; k++) if (col + k < cols) filasTxt[r.fila][col + k] = String();
      }
      return filasTxt.map(f => f.join('').replace(/\s+$/, ''));
    },
  };
}

// Dibuja los vectores como rayos desde el origen, cada uno a su ÁNGULO REAL respecto a la
// consulta. Es exacto para cada par (consulta, producto), que es justo lo que mide el coseno;
// lo que la proyección a 2D no puede mostrar es el ángulo ENTRE dos productos.
//
// SX=2 no es decorativo: un subpíxel braille ocupa media anchura de carácter pero una
// anchura ENTERA de alto (celda 2x4 sobre un carácter que es ~1x2). Sin estirar la x por 2,
// un ángulo de 45° se dibuja como 27° y el diagrama miente justo en lo único que enseña.
const SX = 2;
function diagramaCoseno(consulta, items, cols, filas) {
  const L = lienzo(cols, filas);
  const G = Math.PI / 180;
  const ox = 4, oy = L.PY - 5;
  const HUECO = 46;                          // px reservados a la derecha para los rótulos
  const R = Math.max(12, Math.min((L.PX - ox - HUECO) / SX, oy - 6));
  const BASE = 80 * G;                       // la consulta, separada del eje Y para que se distinga

  L.linea(ox, oy, ox, oy - R * 1.08, c.dim);
  L.linea(ox, oy, ox + SX * R * 1.08, oy, c.dim);

  const punta = (ang, r) => ({ x: ox + SX * r * Math.cos(ang), y: oy - r * Math.sin(ang) });
  const raya = (ang, color) => {
    const p = punta(ang, R);
    L.linea(ox, oy, p.x, p.y, color);
    // La flecha son dos segmentos CORTOS desde la punta hacia atrás. Calcularlos como
    // punta(ang ± 0.38, R*0.9) daba un arco de medio lienzo en vez de una flecha: a esa
    // distancia del origen, 0.38 rad de diferencia es una cuerda enorme.
    for (const d of [Math.PI - 0.42, Math.PI + 0.42]) {
      const a2 = ang + d;
      L.linea(p.x, p.y, p.x + SX * 4 * Math.cos(a2), p.y - 4 * Math.sin(a2), color);
    }
    return p;
  };

  const pa = raya(BASE, c.cyan);
  L.texto(Math.max(0, (pa.x >> 1) - 1), Math.max(0, (pa.y >> 2) - 1), 'A = ' + consulta.slice(0, cols - 10), c.cyan);

  const ocupadas = new Set();
  for (const it of items) {
    const th = Math.acos(Math.max(-1, Math.min(1, it.sim)));
    const p = raya(BASE - th, it.color);
    // dos vecinos con similitud parecida caen en la misma fila y los rótulos se pisan
    let fila = p.y >> 2;
    while (ocupadas.has(fila)) fila++;
    ocupadas.add(fila);
    L.texto((p.x >> 1) + 2, fila, it.etiqueta, it.color);
  }

  // el ángulo del vecino más cercano, marcado sobre el arco
  if (items.length) {
    const th = Math.acos(Math.max(-1, Math.min(1, items[0].sim)));
    const r = R * 0.24, paso = 1 / (SX * r);
    for (let a = BASE - th; a <= BASE; a += paso) { const p = punta(a, r); L.punto(p.x, p.y, c.warn); }
    const pm = punta(BASE - th / 2, r * 1.5);
    L.texto(pm.x >> 1, pm.y >> 2, 'θ=' + (th / G).toFixed(0) + '°', c.warn);
  }
  const dib = L.render();
  while (dib.length && !dib[0].trim()) dib.shift();          // filas vacías según dónde caiga la punta
  while (dib.length && !dib[dib.length - 1].trim()) dib.pop();
  return dib;
}

async function coseno(consulta) {
  const q = consulta || DEMO;
  cabecera('CÓMO DECIDE EL VECTOR', 'similitud de coseno');

  console.log(' ' + c.dim('Cada descripción se convierte en un vector de 1.536 números. Dos textos'));
  console.log(' ' + c.dim('se comparan por el ÁNGULO entre sus vectores, no por sus palabras:'));
  console.log('');
  console.log('   ' + c.cyan('cos(θ) = (A · B) / (|A| · |B|)') + c.dim('     1 = mismo sentido · 0 = sin relación'));

  const spinC = cargando();
  spinC.paso('embebiendo la consulta y midiendo vecinos…');
  const vecs = await embeder([q, BASURA]);
  if (!vecs) { spinC.fin(); console.log('\n ' + GL.err + ' no pude embeber (¿VPN caída? OpenAI bloquea Venezuela)'); return 1; }

  const [top, ruido] = await Promise.all([vecinos(vecs[0], 5), vecinos(vecs[1], 1)]);
  spinC.fin();
  if (!top.length) { console.log('\n ' + GL.err + ' la RPC no devolvió nada'); return 1; }

  // ── el dibujo. Los embeddings de OpenAI vienen normalizados, así que |A| = |B| = 1 y el
  // coseno ES el producto punto: cada vector está en la esfera unidad y arccos(similitud) es
  // un ángulo de verdad, no una licencia del dibujante.
  const simRuido = ruido.length ? ruido[0].similitud : 0;
  const norma = Math.sqrt(vecs[0].reduce((a, x) => a + x * x, 0));
  console.log('\n ' + c.dim('|A| = ') + c.num(norma.toFixed(3)) +
    c.dim('  → OpenAI normaliza, así que cos(θ) = A · B directamente'));
  const anchoD = Math.min(COLS - 6, 74);
  if (anchoD < 64) {
    console.log('');
    console.log(' ' + c.dim('(el diagrama necesita una terminal de 70 columnas o más)'));
  } else {
    const lineas = diagramaCoseno(q, [
      { sim: top[0].similitud, etiqueta: top[0].similitud.toFixed(3) + ' ' + top[0].descripcion.slice(0, 16), color: c.ok },
      { sim: UMBRAL_VECTOR, etiqueta: UMBRAL_VECTOR.toFixed(3) + ' umbral', color: c.warn },
      { sim: simRuido, etiqueta: simRuido.toFixed(3) + ' ruido', color: c.err },
    ], anchoD, 18);
    console.log('');
    for (const l of lineas) console.log(' ' + l);
    console.log('');
    console.log(' ' + c.dim('El ángulo de cada rayo CON A es el real. El ángulo entre dos rayos no:'));
    console.log(' ' + c.dim('1.536 dimensiones no caben en dos, y esa parte se pierde al proyectar.'));
  }

  console.log('\n ' + c.bold(`"${q}"`) + c.dim('  → los 5 vectores más cercanos del catálogo'));
  console.log(' ' + c.dim('─'.repeat(W - 2)));
  for (const f of top) {
    const pasa = f.similitud >= UMBRAL_VECTOR;
    console.log('  ' + (pasa ? c.ok(f.similitud.toFixed(3)) : c.dim(f.similitud.toFixed(3))) +
      ' ' + c.dim(padL(grados(f.similitud), 4)) + '  ' + barraSim(f.similitud) +
      '  ' + f.descripcion.slice(0, 34));
  }

  // el umbral y el suelo de ruido, que es lo que de verdad explica la decisión
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
  const spin = cargando();
  spin.paso('ejecutando el cuerpo real del nodo…');
  const t0 = Date.now();
  let r;
  try { r = JSON.parse(await run({ p_busqueda: consulta }, n => (n === 'axios' ? ax : require(n)), fakeEnv)); }
  catch (x) { spin.fin(); console.log(' ' + GL.err + ' la búsqueda lanzó excepción: ' + x.message); return 1; }
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
