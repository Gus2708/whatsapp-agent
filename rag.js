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
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = __dirname;
const L = require(path.join(ROOT, 'lib', 'serrucho-search.js'));
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL') || 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// ───────────────────────────────────────────────────────────────────── presentación (Brainless / Claude Code theme)
const TTY = process.stdout.isTTY;
const W = 64;                                   // ancho fijo: alinea todo sin depender del contenido

// Detección de color truecolor / 24-bit
const COLORTERM = process.env.COLORTERM || '';
const TRUECOLOR = TTY && (COLORTERM === 'truecolor' || COLORTERM === '24bit' || process.env.TERM_PROGRAM === 'vscode' || process.env.WT_SESSION);

const e = (n, s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const rgb = (r, g, b, s) => (TTY ? (TRUECOLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : e(36, s)) : s);
const rgbBg = (r, g, b, s) => (TTY ? (TRUECOLOR ? `\x1b[48;2;${r};${g};${b}m${s}\x1b[0m` : s) : s);

const c = {
  dim: s => e(2, s),
  bold: s => e(1, s),
  italic: s => e(3, s),
  // Paleta Tokyo Night / Claude Code:
  claude: s => rgb(205, 105, 74, s),       // Terracota / Serrucho (#cd694a)
  cyan: s => rgb(125, 207, 255, s),         // Azul claro cian (#7dcfff)
  violet: s => rgb(187, 154, 247, s),       // Lavanda / Violeta (#bb9af7)
  ok: s => rgb(78, 169, 111, s),           // Verde suave (#4ea96f)
  err: s => rgb(247, 118, 142, s),         // Rojo pastel (#f7768e)
  warn: s => rgb(224, 175, 104, s),        // Amarillo/Ocre (#e0af68)
  gray: s => rgb(139, 143, 163, s),        // Gris medio (#8b8fa3)
  darkGray: s => rgb(86, 95, 137, s),      // Gris azulado tenue (#565f89)
  num: s => rgb(192, 202, 245, s),         // Blanco suave (#c0caf5)
  chipBg: s => (TRUECOLOR ? `\x1b[48;2;30;30;36m\x1b[38;2;192;202;245m${s}\x1b[0m` : e(7, s)),
};

// longitud visible (sin códigos de color) para poder alinear
const vis = s => String(s).replace(/\x1b\[[0-9;]*m/g, '').length;
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - vis(s)));
const padL = (s, n) => ' '.repeat(Math.max(0, n - vis(s))) + s;

const GL = {
  ok: c.ok('⏺'),
  err: c.err('⏺'),
  warn: c.warn('▲'),
  dot: c.darkGray('·'),
  tree: c.darkGray('⎿'),
  prompt: c.claude('❯'),
  chip: c.cyan('›'),
};

function cabecera(titulo, sub, ancho) {
  // Diseño Fieldset Legend al estilo Claude Code (Brainless)
  const anchoCaja = ancho || (DOBLE ? W + AD + 5 : W);
  const tag = ' ' + c.bold(c.claude(titulo)) + ' ';
  const subTexto = sub ? ' ' + c.darkGray(sub) + ' ' : '';
  const restoIzq = 3;
  const restoDer = Math.max(0, anchoCaja - 2 - restoIzq - vis(tag) - vis(subTexto));
  const lineaSup = c.darkGray('╭' + '─'.repeat(restoIzq)) + tag + c.darkGray('─'.repeat(restoDer)) + (sub ? c.dim(subTexto) : '') + c.darkGray('╮');
  const lineaInf = c.darkGray('╰' + '─'.repeat(anchoCaja - 2) + '╯');
  
  out('\n' + lineaSup);
  const statusLine = '  ' + c.darkGray('branch: main') + c.darkGray(' · ') + c.gray('Ferretería El Serrucho') + c.darkGray(' · ') + c.ok('●') + ' ' + c.darkGray('online');
  out(c.darkGray('│') + pad(statusLine, anchoCaja - 2) + c.darkGray('│'));
  out(lineaInf);
}

function seccion(t) {
  out('\n ' + c.claude('◆') + ' ' + c.bold(c.num(t)));
  out(' ' + c.darkGray('─'.repeat(W - 2)));
}

// fila etiqueta ......... valor  [glifo]
function fila(etiqueta, valor, glifo) {
  const glifoStr = glifo ? ' ' + glifo : '';
  const esp = W - 2 - vis(glifoStr) - vis(valor);
  const etiq = pad(c.gray(etiqueta), Math.max(0, esp));
  out('  ' + etiq + valor + glifoStr);
}

function barra(pct, ancho) {
  const n = ancho || 22;
  const llenos = Math.max(0, Math.min(n, Math.round((pct / 100) * n)));
  const color = pct >= 99.5 ? c.ok : pct >= 90 ? c.warn : c.err;
  return color('█'.repeat(llenos)) + c.darkGray('░'.repeat(n - llenos));
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
  const t0 = Date.now();
  const t = setInterval(() => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    const hint = c.darkGray(` (${elapsed} · esc para cancelar)`);
    process.stdout.write('\r\x1b[2K ' + c.claude(marcos[i++ % marcos.length]) + ' ' + c.num(txt) + hint);
  }, 80);
  t.unref();
  return {
    paso(s) { txt = s; },
    fin() { clearInterval(t); process.stdout.write('\r\x1b[2K'); },
  };
}

function dosColumnas(izq, derIn) {
  if (!DOBLE) { for (const l of izq) console.log(l); for (const l of derIn) console.log(l); return; }
  const der = derIn;
  const n = Math.max(izq.length, der.length);
  for (let i = 0; i < n; i++) {
    const d = der[i] || '';
    console.log(pad(izq[i] || '', W + 4) + c.darkGray('│') + (d ? ' ' + d : ''));
  }
}

// ── piezas de gráfica para la columna derecha (estilo Brainless)
function tituloDer(t) { return [' ' + c.claude('◆') + ' ' + c.bold(c.num(t)), ' ' + c.darkGray('─'.repeat(AD - 2))]; }
function barraH(valor, max, ancho, color) {
  const n = max > 0 ? Math.max(0, Math.min(ancho, Math.round((valor / max) * ancho))) : 0;
  return (color || c.cyan)('█'.repeat(n)) + c.darkGray('░'.repeat(Math.max(0, ancho - n)));
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
  L.push(' ' + c.darkGray('productos según el mes de su última venta'));
  for (const k of claves) {
    const v = cubos.get(k) || 0;
    const et = MESES[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(2, 4);
    L.push('  ' + c.gray(et) + ' ' + barraH(v, max, 22, c.cyan) + ' ' + padL(c.num(num(v)), 6));
  }
  // 'antes' agrupa 8+ meses: dibujarle una barra al lado de un mes suelto engaña
  L.push('  ' + c.darkGray(pad('antes', 29)) + padL(c.darkGray(num(viejos)), 6));
  return L;
}

function panelStock(vivos, fantasma) {
  const tot = vivos + fantasma;
  const p = v => (tot ? (v / tot) * 100 : 0);
  const L = tituloDer('COMPOSICIÓN DEL STOCK');
  L.push(' ' + c.darkGray('los ' + num(tot) + ' productos con existencia'));
  L.push('  ' + c.gray(pad('vendido en 1 año', 17)) + barraH(vivos, tot, 14, c.ok) + ' ' + padL(c.num(num(vivos)), 6) + c.darkGray(p(vivos).toFixed(0).padStart(4) + '%'));
  L.push('  ' + c.gray(pad('sin venta', 17)) + barraH(fantasma, tot, 14, c.warn) + ' ' + padL(c.num(num(fantasma)), 6) + c.darkGray(p(fantasma).toFixed(0).padStart(4) + '%'));
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

  out(' ' + c.claude('◆') + ' ' + c.bold(c.num('CATÁLOGO Y VECTORES')));
  out(' ' + c.darkGray('─'.repeat(W - 2)));
  fila('productos en catálogo', c.num(num(productos.length)));
  fila('con vector', c.num(num(emb.length)));
  fila('cobertura vectorial', c.num(cobertura.toFixed(1) + '%'));
  out('  ' + barra(cobertura, W - 6));
  fila('sin vector', c.num(num(sinVector.length)), sinVector.length ? GL.err : GL.ok);
  fila('descripción movida', c.num(num(movidas.length)), movidas.length ? GL.warn : GL.ok);
  fila('último embedding', dias(dEmb));
  if (sinVector.length) {
    out('  ' + c.darkGray('⎿ ') + c.gray('p.ej. ' + sinVector.slice(0, 3).map(p => c.cyan(p.codigo_interno) + ' ' + p.descripcion.slice(0, 24)).join('  ')));
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
  if (vocabNuevo) out('  ' + c.darkGray('⎿ ') + c.warn('más nuevo que los vectores: el texto embebido cambió'));

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
  fila('stock sin venta en 1 año', c.num(num(fantasma.length)) + c.darkGray(` (${pctFantasma.toFixed(0)}%)`), pctFantasma > 30 ? GL.warn : GL.ok);
  fila('recalculado', dias(dPop), dPop !== null && dPop > 3 ? GL.warn : GL.ok);
  if (pctFantasma > 30) out('  ' + c.darkGray('⎿ ') + c.gray('el ranking por ventas los hunde solos: score 0 o negativo'));

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
    if (s.geo) out('  ' + c.darkGray('⎿ ') + c.warn('¿VPN caída? OpenAI bloquea Venezuela: sin VPN no hay embeddings'));
    caidos.push(s);
  }

  // ── el coseno en vivo
  spin.paso('midiendo el coseno en vivo…');
  let margenVector = null;
  const panelCos = tituloDer('EL COSENO EN VIVO');
  if (!sondas[1].ok) {
    panelCos.push(' ' + c.darkGray('sin OpenAI no se puede medir'));
  } else {
    const vecs = await embeder([DEMO, BASURA]);
    const [top, ruido] = vecs ? await Promise.all([vecinos(vecs[0], 4), vecinos(vecs[1], 1)]) : [[], []];
    if (!top.length) {
      panelCos.push(' ' + c.darkGray('la RPC no devolvió vecinos'));
    } else {
      const simRuido = ruido.length ? ruido[0].similitud : 0;
      margenVector = top[0].similitud - simRuido;
      panelCos.push(' ' + c.darkGray('cos(θ) sobre 1.536 dimensiones (esfera unidad)'));
      
      // Gráfico Braille de los vectores proyectados en el panel:
      const lineasGrafo = diagramaCoseno(DEMO, [
        { sim: top[0].similitud, etiqueta: top[0].similitud.toFixed(2) + ' ' + top[0].descripcion.slice(0, 10), color: c.ok },
        { sim: UMBRAL_VECTOR, etiqueta: UMBRAL_VECTOR.toFixed(2) + ' umbral', color: c.warn },
        { sim: simRuido, etiqueta: simRuido.toFixed(2) + ' ruido', color: c.err },
      ], AD - 2, 9);
      for (const l of lineasGrafo) panelCos.push(' ' + l);

      panelCos.push(' ' + c.bold(c.claude(`"${DEMO}"`)) + c.darkGray(' → vecinos'));
      for (const f of top.slice(0, 3)) {
        panelCos.push('  ' + (f.similitud >= UMBRAL_VECTOR ? c.ok(f.similitud.toFixed(3)) : c.darkGray(f.similitud.toFixed(3))) +
          ' ' + barraSim(f.similitud, 12) + ' ' + c.gray(f.descripcion.slice(0, 18)));
      }
      panelCos.push('  ' + c.warn(UMBRAL_VECTOR.toFixed(3)) + ' ' + c.darkGray('╌'.repeat(12)) + ' ' + c.darkGray('umbral'));
      panelCos.push('  ' + c.err(simRuido.toFixed(3)) + ' ' + barraSim(simRuido, 12) + ' ' + c.darkGray('ruido (suelo)'));
      const sano = margenVector > 0.05;
      panelCos.push('  ' + (sano ? GL.ok : GL.err) + ' ' + c.bold(c.num('margen ' + margenVector.toFixed(3))) +
        (sano ? c.darkGray('  separa de verdad') : c.err('  la capa no aporta')));
    }
  }
  panelCos.push('  ' + c.darkGray('└ ') + c.cyan('rag.js coseno "..."') + c.darkGray(' para pantalla completa'));

  spin.fin();
  const todoIzq = CAP; CAP = null;
  // La cabecera son las primeras 4 líneas (salto inicial + 3 líneas de caja)
  const cabeceraLineas = todoIzq.slice(0, 4);
  const izq = todoIzq.slice(4);
  const der = [...panelCos, '', ...panelActividad(popRows), '', ...panelStock(conStockArr.length - fantasma.length, fantasma.length)];
  
  for (const l of cabeceraLineas) console.log(l);
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
    console.log(' ' + c.ok('▎') + ' ' + c.bold(c.ok('Todo al día')) + c.darkGray(`  ·  ${((Date.now() - t0) / 1000).toFixed(1)}s`));
    return 0;
  }
  console.log(' ' + c.err('▎') + ' ' + c.bold(c.err('Requiere acción')));
  for (const [p] of problemas) console.log('   ' + GL.err + ' ' + c.num(p));
  // los fallos de red no se arreglan con un comando (van con null): no inventar uno
  const cmds = [...new Set(problemas.map(p => p[1]).filter(Boolean))];
  if (cmds.length) {
    console.log('\n   ' + c.darkGray('ejecuta:') + '  ' + cmds.map(x => c.cyan('node rag.js ' + x)).join(c.darkGray('  y  ')));
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

  console.log(' ' + c.gray('Cada descripción se convierte en un vector de 1.536 números. Dos textos'));
  console.log(' ' + c.gray('se comparan por el ÁNGULO entre sus vectores, no por sus palabras:'));
  console.log('');
  console.log('   ' + c.cyan('cos(θ) = (A · B) / (|A| · |B|)') + c.darkGray('     1 = mismo sentido · 0 = sin relación'));

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
  console.log('\n ' + c.darkGray('|A| = ') + c.num(norma.toFixed(3)) +
    c.darkGray('  → OpenAI normaliza, así que cos(θ) = A · B directamente'));
  const anchoD = Math.min(COLS - 6, 74);
  if (anchoD < 64) {
    console.log('');
    console.log(' ' + c.darkGray('(el diagrama necesita una terminal de 70 columnas o más)'));
  } else {
    const lineas = diagramaCoseno(q, [
      { sim: top[0].similitud, etiqueta: top[0].similitud.toFixed(3) + ' ' + top[0].descripcion.slice(0, 16), color: c.ok },
      { sim: UMBRAL_VECTOR, etiqueta: UMBRAL_VECTOR.toFixed(3) + ' umbral', color: c.warn },
      { sim: simRuido, etiqueta: simRuido.toFixed(3) + ' ruido', color: c.err },
    ], anchoD, 18);
    console.log('');
    for (const l of lineas) console.log(' ' + l);
    console.log('');
    console.log(' ' + c.darkGray('El ángulo de cada rayo CON A es el real. El ángulo entre dos rayos no:'));
    console.log(' ' + c.darkGray('1.536 dimensiones no caben en dos, y esa parte se pierde al proyectar.'));
  }

  console.log('\n ' + c.bold(c.claude(`"${q}"`)) + c.darkGray('  → los 5 vectores más cercanos del catálogo'));
  console.log(' ' + c.darkGray('─'.repeat(W - 2)));
  for (const f of top) {
    const pasa = f.similitud >= UMBRAL_VECTOR;
    console.log('  ' + (pasa ? c.ok(f.similitud.toFixed(3)) : c.darkGray(f.similitud.toFixed(3))) +
      ' ' + c.darkGray(padL(grados(f.similitud), 4)) + '  ' + barraSim(f.similitud) +
      '  ' + c.gray(f.descripcion.slice(0, 34)));
  }

  // el umbral y el suelo de ruido, que es lo que de verdad explica la decisión
  console.log(' ' + c.darkGray('─'.repeat(W - 2)));
  console.log('  ' + c.err(simRuido.toFixed(3)) + ' ' + c.darkGray(padL(grados(simRuido), 4)) + '  ' + barraSim(simRuido) +
    '  ' + c.darkGray(`"${BASURA}" (sin sentido)`));

  const margen = top[0].similitud - simRuido;
  console.log('');
  const sano = margen > 0.05;
  console.log(' ' + (sano ? c.ok('▎') : c.err('▎')) + ' ' + c.bold(c.num('margen señal/ruido ' + margen.toFixed(3))) + '  ' +
    (sano ? c.darkGray('hay separación: el umbral distingue de verdad') : c.err('NO hay umbral posible: la capa es inservible')));
  return 0;
}

// ───────────────────────────────────────────────────────────────────── diagnóstico vectorial nativo
async function diagnostico(consulta, flags) {
  const flagsList = flags || [];
  const soloJson = flagsList.includes('--json');
  if (!soloJson) cabecera('DIAGNÓSTICO VECTORIAL', 'camino semántico');

  const q = (consulta || '').trim();
  const casos = q ? [q] : [
    'tendran tapa para el bano',
    'disco de corte',
    'algo para cortar cabilla',
    'cemento gris',
  ];

  const body = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
  const axiosShim = {
    async get(u, cf) { const r = await fetch(u, { headers: (cf && cf.headers) || {} }); return { data: await r.json() }; },
    async post(u, b, cf) { const r = await fetch(u, { method: 'POST', headers: (cf && cf.headers) || {}, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
  };
  const runMatcher = new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');
  const fakeEnv = { OPENROUTER_API_KEY: pick('OPENROUTER_API_KEY'), OPENAI_API_KEY: pick('OPENAI_API_KEY') };

  const reporte = [];

  for (const texto of casos) {
    if (!soloJson) {
      console.log('\n ' + c.claude('❯') + ' ' + c.bold(c.num(`"${texto}"`)));
      console.log(' ' + c.darkGray('─'.repeat(W + 15)));
    }

    const casoRes = {
      consulta: texto,
      lexico: null,
      gatillo: { dispara: false, faltan: [] },
      embedding: { ok: false, ms: 0, error: null },
      vecinos: [],
      adopcion: { veredicto: 'NO_DISPARA', razon: '' },
    };

    // 1. Léxico
    const lex = JSON.parse(await runMatcher({ p_busqueda: texto }, n => (n === 'axios' ? axiosShim : require(n)), { OPENROUTER_API_KEY: '', OPENAI_API_KEY: '' }));
    const topLex = (lex.productos || [])[0];
    casoRes.lexico = topLex || null;
    if (!soloJson) {
      console.log(`  ${c.gray('1. Capa Léxica (Trigramas):')} ${topLex ? c.ok(topLex.nombre) : c.darkGray('(sin resultados)')}`);
    }

    // 2. Gatillo
    const qTok = L.expandir(texto).split(' ').filter(w => w.length > 2 && !/\d/.test(w));
    const d0 = topLex ? L.norm(topLex.nombre) : '';
    const faltan = qTok.filter(t => !L.aliasDe(t).some(a => d0.includes(a)));
    const dispara = faltan.length > 0;
    casoRes.gatillo = { dispara, faltan };

    if (!soloJson) {
      console.log(`  ${c.gray('2. Gatillo de Disparo:')}     ${dispara ? c.warn('DISPARA') + c.darkGray(` (faltan tokens en top-1: ${faltan.join(', ')})`) : c.ok('NO DISPARA') + c.darkGray(' (top-1 cubre la consulta)')}`);
    }

    if (!dispara) {
      casoRes.adopcion = { veredicto: 'NO_DISPARA', razon: 'El top-1 léxico ya contiene los términos principales de la consulta.' };
      reporte.push(casoRes);
      continue;
    }

    // 3. Embedding OpenAI
    const t0 = Date.now();
    const vecs = await embeder([texto]);
    const ms = Date.now() - t0;
    if (!vecs || !vecs[0]) {
      casoRes.embedding = { ok: false, ms, error: 'Fallo o timeout conectando a OpenAI' };
      casoRes.adopcion = { veredicto: 'ERROR_EMBEDDING', razon: 'No se pudo generar el vector de consulta' };
      if (!soloJson) {
        console.log(`  ${c.gray('3. Embedding OpenAI:')}       ${c.err('FALLÓ O TIMEOUT')} ${c.darkGray(`(${ms}ms)`)}`);
      }
      reporte.push(casoRes);
      continue;
    }
    casoRes.embedding = { ok: true, ms, dims: 1536 };
    if (!soloJson) {
      console.log(`  ${c.gray('3. Embedding OpenAI:')}       ${c.ok('OK')} ${c.darkGray(`(${ms}ms · 1.536 dims)`)}`);
    }

    // 4. Búsqueda semántica
    const resVec = await vecinos(vecs[0], 5);
    casoRes.vecinos = resVec;
    if (!resVec.length) {
      casoRes.adopcion = { veredicto: 'SIN_VECINOS', razon: 'La función buscar_semantico no devolvió registros' };
      if (!soloJson) {
        console.log(`  ${c.gray('4. Vecinos Semánticos:')}    ${c.err('(la RPC no devolvió vecinos)')}`);
      }
      reporte.push(casoRes);
      continue;
    }
    if (!soloJson) {
      console.log(`  ${c.gray('4. Vecinos Semánticos:')}`);
      for (const f of resVec) {
        const pasa = f.similitud >= UMBRAL_VECTOR;
        const simStr = f.similitud.toFixed(3);
        console.log(`      ${pasa ? c.ok(simStr) : c.darkGray(simStr)}  ${barraSim(f.similitud, 14)}  ${c.num(pad(f.descripcion.slice(0, 36), 38))} ${pasa ? c.ok('pasa umbral') : c.err('bajo umbral')}`);
      }
    }

    // 5. Adopción
    const sobreUmbral = resVec.filter(f => f.similitud >= UMBRAL_VECTOR);
    if (!sobreUmbral.length) {
      casoRes.adopcion = { veredicto: 'DESCARTA_UMBRAL', razon: `Ningún vecino superó el umbral mínimo (${UMBRAL_VECTOR})` };
      if (!soloJson) {
        console.log(`  ${c.gray('5. Veredicto Adopción:')}    ${c.err('DESCARTA')} ${c.darkGray(`(ningún vector superó el umbral de ${UMBRAL_VECTOR.toFixed(3)})`)}`);
      }
      reporte.push(casoRes);
      continue;
    }
    const vcat = L.norm(sobreUmbral[0].descripcion).split(' ')[0];
    const lcat = d0.split(' ')[0];
    const adopta = vcat !== lcat;
    casoRes.adopcion = {
      veredicto: adopta ? 'ADOPTA' : 'DESCARTA_CATEGORIA',
      categoria_vector: vcat,
      categoria_lexico: lcat,
      vector_ganador: sobreUmbral[0],
      razon: adopta ? 'Categorías distintas: el vector descubrió una intención no vista por el léxico.' : 'Misma categoría: se prefiere mantener la precisión de la capa léxica.',
    };

    if (!soloJson) {
      console.log(`  ${c.gray('5. Veredicto Adopción:')}    ${adopta ? c.bold(c.ok('ADOPTA VECTOR')) : c.bold(c.warn('DESCARTA (misma categoría)'))} ${c.darkGray(`(cat vector="${vcat}" vs cat léxico="${lcat}")`)}`);
    }
    reporte.push(casoRes);
  }

  // Guardar archivo JSON estructurado para auditoría y arreglo inmediato
  const rutaJson = path.join(ROOT, 'scratch_live', 'diagnostico_resultado.json');
  fs.writeFileSync(rutaJson, JSON.stringify({ fecha: new Date().toISOString(), total_casos: reporte.length, resultados: reporte }, null, 2), 'utf8');

  if (soloJson) {
    console.log(JSON.stringify(reporte, null, 2));
  } else {
    console.log('\n ' + c.ok('⏺') + ' ' + c.bold('Reporte JSON detallado guardado en:') + ' ' + c.cyan('scratch_live/diagnostico_resultado.json'));
    console.log('');
  }
  return 0;
}

// ───────────────────────────────────────────────────────────────────── buscar (Brainless / Claude Code style)
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
  spin.paso('ejecutando matcher…');
  const t0 = Date.now();
  let r;
  try { r = JSON.parse(await run({ p_busqueda: consulta }, n => (n === 'axios' ? ax : require(n)), fakeEnv)); }
  catch (x) { spin.fin(); console.log(' ' + GL.err + ' la búsqueda lanzó excepción: ' + x.message); return 1; }
  const ms = Date.now() - t0;
  spin.fin();

  // Turno de usuario estilo Claude Code:
  console.log('\n ' + c.claude('❯') + ' ' + c.bold(c.num(consulta)));
  
  // Tool-call header (Brainless):
  console.log(' ' + c.ok('⏺') + ' ' + c.bold('Supabase::buscar_productos') + c.darkGray(`(p_busqueda: "${consulta}")`));
  
  const marcas = [];
  if (r.rescate) marcas.push(c.warn('HIPÓTESIS → ' + r.rescate));
  if (r.parcial) marcas.push(c.warn('parcial'));
  if (r.aclarar) marcas.push(c.warn('consulta vaga'));
  if (r.no_vendido) marcas.push(c.warn('no vendido'));

  const nResultados = (r.productos || []).length;
  console.log('   ' + c.darkGray('⎿') + ' ' + c.gray(`${nResultados} producto(s) encontrado(s) en `) + c.cyan(`${ms} ms`) +
    (marcas.length ? '  ' + c.darkGray('·') + '  ' + marcas.join(c.darkGray(' · ')) : ''));
  console.log('');

  for (const p of (r.productos || [])) {
    const estadoDot = p.disponible ? c.ok('⏺') : c.err('⏺');
    const badge = p.disponible ? c.ok('[DISPONIBLE]') : c.err('[AGOTADO]');
    console.log('    ' + estadoDot + ' ' + c.bold(c.num(p.nombre)) + '  ' + badge);
    const precios = c.claude(pad(p.precio_divisas_texto || '$ —', 12)) + c.darkGray('│ ') + c.num(p.precio_bs_texto || 'Bs. —');
    console.log('      ' + c.darkGray('⎿ ') + precios);
  }
  if (!nResultados) console.log('    ' + c.darkGray('⎿ (sin resultados en el catálogo)'));

  if (r.instruccion) {
    console.log('\n   ' + c.claude('◆') + ' ' + c.bold(c.gray('Instrucción generada para el bot:')));
    console.log('   ' + c.darkGray('─'.repeat(W - 6)));
    for (const linea of String(r.instruccion).trim().split('\n')) {
      console.log('   ' + c.darkGray('│') + ' ' + c.gray(linea));
    }
    console.log('   ' + c.darkGray('╰' + '─'.repeat(W - 6)));
  }
  return 0;
}

// ───────────────────────────────────────────────────────────────────── suite
// Corre TODOS los harness de una y resume. Es la foto completa de la calidad de búsqueda.
async function suite(flags) {
  const rapida = flags.includes('--rapida');
  cabecera('SUITE DE TESTS Y REPRESIÓN', rapida ? 'modo rápido' : 'batería completa');
  if (!rapida) console.log(' ' + c.darkGray('el recall de 320 tarda ~15 min; usa --rapida para saltarlo'));

  const pasos = [
    { nombre: 'Regresión de Búsqueda', script: 'scripts/_test_busqueda_50.js', args: [], parse: s => {
      const m = s.match(/Total:\s*(\d+)[\s\S]*?FALSO-NEGATIVO sospechoso:\s*(\d+)[\s\S]*?excepciones:\s*(\d+)/);
      if (!m) return null;
      return { casos: +m[1], fallos: +m[2] + +m[3], detalle: `${m[2]} falsos negativos · ${m[3]} excepciones` };
    } },
    { nombre: 'Casos Reales Escalados', script: 'scripts/_test_fallos_reales.js', args: ['--prod'], parse: s => {
      const m = s.match(/evaluadas:\s*(\d+)\s*\|\s*con resultados:\s*(\d+)[\s\S]*?sin nada:\s*(\d+)/);
      if (!m) return null;
      return { casos: +m[1], fallos: +m[3], detalle: `${m[2]} encuentran · ${m[3]} sin nada` };
    } },
    { nombre: 'Margen Señal / Ruido', script: 'scripts/_test_vector.js', args: [], parse: s => {
      const m = s.match(/aciertos en el top-1:\s*(\d+)\/(\d+)[\s\S]*?MARGEN[^:]*:\s*([\d.]+)/);
      if (!m) return null;
      const margen = parseFloat(m[3]);
      return { casos: +m[2], fallos: +m[2] - +m[1], detalle: `margen ${margen.toFixed(3)} ${margen > 0.05 ? '(umbral óptimo)' : '(INSERVIBLE)'}` };
    } },
  ];
  if (!rapida) pasos.push({ nombre: 'Recall Coloquial (320)', script: 'scripts/_test_coloquial.js', args: [], parse: s => {
    const m = s.match(/casos:\s*(\d+)[\s\S]*?producto exacto en resultados\s*:\s*(\d+)\s*\(([\d.]+)%\)[\s\S]*?fallo total\s*:\s*(\d+)/);
    if (!m) return null;
    return { casos: +m[1], fallos: +m[4], detalle: `${m[2]} exactos (${m[3]}%) · ${m[4]} fallos` };
  } });

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('Ejecutando Arneses de Búsqueda:')));
  console.log(' ' + c.darkGray('─'.repeat(W + 15)));

  let totalCasos = 0, totalFallos = 0, rotos = 0;
  for (const p of pasos) {
    const spin = cargando();
    spin.paso(`evaluando ${p.nombre.toLowerCase()}…`);
    const t0 = Date.now();
    const { salida } = correrCapturando(p.script, p.args);
    spin.fin();

    const r = p.parse(salida);
    const seg = ((Date.now() - t0) / 1000).toFixed(1) + 's';
    p.resultado = r;
    p.seg = seg;
    p.salidaRaw = salida;

    if (!r) {
      console.log('  ' + GL.err + ' ' + pad(c.num(p.nombre), 28) + c.err('error al parsear salida') + c.darkGray('  ' + seg));
      rotos++;
      continue;
    }

    totalCasos += r.casos;
    totalFallos += r.fallos;
    const porcentaje = r.casos ? (((r.casos - r.fallos) / r.casos) * 100).toFixed(1) : '100';
    const g = r.fallos === 0 ? GL.ok : GL.warn;
    const tasaColor = r.fallos === 0 ? c.ok : c.warn;

    console.log(`  ${g} ${c.bold(c.num(pad(p.nombre, 26)))} ${padL(c.gray(r.casos + ' casos'), 10)}  ${c.darkGray('│')}  ${tasaColor(padL(porcentaje + '%', 6))}  ${c.darkGray('│')}  ${c.darkGray(r.detalle)}  ${c.darkGray('(' + seg + ')')}`);
  }

  console.log('\n ' + c.darkGray('─'.repeat(W + 15)));
  const sano = totalFallos === 0 && rotos === 0;
  const tasaTotal = totalCasos ? (((totalCasos - totalFallos) / totalCasos) * 100).toFixed(1) : '100';

  console.log(' ' + (sano ? c.ok('▎') : c.warn('▎')) + ' ' + c.bold(c.num(`${num(totalCasos)} casos evaluados`)) +
    c.darkGray('  ·  ') + (totalFallos ? c.warn(`${totalFallos} incidentes reportados`) : c.ok('cero incidentes')) +
    c.darkGray('  ·  ') + c.bold(c.cyan(`${tasaTotal}% efectividad global`)));

  // Guardar archivo JSON con el desglose detallado para análisis y corrección
  const rutaSuiteJson = path.join(ROOT, 'scratch_live', 'suite_resultado.json');
  const reporteSuite = {
    fecha: new Date().toISOString(),
    modo: rapida ? 'rapida' : 'completa',
    efectividad_global_pct: Number(tasaTotal),
    total_casos: totalCasos,
    total_fallos: totalFallos,
    arneses: pasos.map(p => ({
      nombre: p.nombre,
      script: p.script,
      casos: p.resultado ? p.resultado.casos : 0,
      fallos: p.resultado ? p.resultado.fallos : 0,
      detalle: p.resultado ? p.resultado.detalle : '',
      duracion_seg: p.seg || 0,
      salida_raw: p.salidaRaw || '',
    })),
  };
  fs.writeFileSync(rutaSuiteJson, JSON.stringify(reporteSuite, null, 2), 'utf8');

  if (flags.includes('--json')) {
    console.log(JSON.stringify(reporteSuite, null, 2));
  } else {
    console.log(' ' + c.ok('⏺') + ' ' + c.bold('Reporte JSON detallado guardado en:') + ' ' + c.cyan('scratch_live/suite_resultado.json'));
  }
  console.log('');
  return sano ? 0 : 1;
}

// ───────────────────────────────────────────────────────────────────── popularidad
async function popularidad() {
  cabecera('RANKING POR VENTAS', 'popularidad en vivo');
  const spin = cargando();
  spin.paso('recalculando ranking en base de datos…');

  const r = await fetch(`${SB}/rest/v1/rpc/refrescar_popularidad_reciente`, { method: 'POST', headers: H, body: '{}' });
  const t = await r.text();
  if (!r.ok) {
    spin.fin();
    console.log(' ' + GL.err + ' falló recálculo: ' + t.slice(0, 160));
    return 1;
  }

  spin.paso('consultando productos líderes en ventas…');
  // Consultar el top 10 productos con mayor score
  const rPop = await (await fetch(`${SB}/rest/v1/producto_popularidad?select=codigo_interno,score,facturas_90d,facturas_365d,ultima_venta&order=score.desc&limit=10`, { headers: H })).json();
  const codigos = rPop.map(p => p.codigo_interno);
  const rProd = await (await fetch(`${SB}/rest/v1/productos?select=codigo_interno,descripcion,existencia&codigo_interno=in.(${encodeURIComponent(codigos.join(','))})`, { headers: H })).json();
  spin.fin();

  const mapProd = new Map(rProd.map(p => [p.codigo_interno, p]));

  console.log(' ' + GL.ok + ' ' + c.bold('Ranking recalculado:') + ' ' + c.cyan(num(t)) + c.gray(' productos activos con historial de venta'));
  console.log(' ' + c.darkGray('Fórmula: score pondera facturas recientes (90d) sobre anuales (365d) para hundir stock fantasma.'));

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('Top 10 Productos Más Vendidos (Líderes de Popularidad):')));
  console.log(' ' + c.darkGray('─'.repeat(W + 20)));

  for (let i = 0; i < rPop.length; i++) {
    const pop = rPop[i];
    const prod = mapProd.get(pop.codigo_interno) || { descripcion: '—', existencia: 0 };
    const stockNum = Number(prod.existencia) || 0;
    const stockBadge = stockNum > 0 ? c.ok(`[STOCK: ${stockNum}]`) : c.err(`[STOCK: ${stockNum}]`);
    const numFmt = padL(String(i + 1), 2);

    console.log(`  ${c.cyan(numFmt + '.')} ${c.bold(c.num(pad((prod.descripcion || '').slice(0, 38), 40)))} ${stockBadge}`);
    console.log(`      ${c.darkGray('⎿')} ${c.gray('Score:')} ${c.claude(pop.score.toFixed(2))}  ${c.darkGray('│')}  ${c.gray('Facturas 90d:')} ${c.num(num(pop.facturas_90d))}  ${c.darkGray('│')}  ${c.gray('Facturas 365d:')} ${c.num(num(pop.facturas_365d))}  ${c.darkGray('│')}  ${c.darkGray('Código:')} ${pop.codigo_interno}`);
  }
  console.log('');
  return 0;
}

// ───────────────────────────────────────────────────────────────────── vocabulario (vista y explorador en vivo)
async function vocabulario(filtro) {
  cabecera('DICCIONARIO COLOQUIAL', 'términos y categorías');
  const spin = cargando();
  spin.paso('consultando catálogo de vocabulario…');

  const [rTotal, rCats, rMuestras] = await Promise.all([
    fetch(`${SB}/rest/v1/catalogo_vocabulario?select=categoria`, { headers: { ...H, Prefer: 'count=exact' } }),
    fetch(`${SB}/rest/v1/catalogo_vocab_categorias?select=categoria,productos,terminos&order=terminos.desc&limit=10`, { headers: H }),
    fetch(`${SB}/rest/v1/catalogo_vocabulario?select=termino,canonico,categoria,confianza${filtro ? `&categoria=ilike.*${filtro}*` : ''}&order=confianza.desc&limit=12`, { headers: H }),
  ]);

  const totalTerminos = (rTotal.headers.get('content-range') || '').split('/')[1] || '0';
  const categoriasTop = await rCats.json();
  const muestras = await rMuestras.json();
  spin.fin();

  console.log(' ' + GL.ok + ' ' + c.bold('Términos activos en Supabase:') + ' ' + c.cyan(num(totalTerminos)) + c.gray(' modismos, marcas y sinónimos coloquiales'));
  console.log(' ' + c.darkGray('Resuelve cómo habla el cliente (ej: "chapa", "perica", "foco") hacia palabras del catálogo.'));

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('Categorías con mayor cobertura de modismos:')));
  console.log(' ' + c.darkGray('─'.repeat(W + 20)));

  for (const cat of (categoriasTop || []).slice(0, 6)) {
    console.log(`  ${c.cyan('›')} ${c.bold(c.num(pad(cat.categoria, 18)))} ${c.gray(pad(`${cat.terminos} términos coloquiales`, 28))} ${c.darkGray(`(${cat.productos} productos en catálogo)`)}`);
  }

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num(filtro ? `Muestras encontradas para "${filtro}":` : 'Ejemplos de Mapeo Coloquial en Vivo (Cliente → Catálogo):')));
  console.log(' ' + c.darkGray('─'.repeat(W + 20)));

  for (const m of (muestras || [])) {
    const estrellas = '★'.repeat(m.confianza || 5);
    console.log(`  ${c.gray('Cliente:')} ${c.bold(c.claude(pad(`"${m.termino}"`, 24)))} ${c.darkGray('→')}  ${c.gray('Catálogo:')} ${c.bold(c.num(pad(`"${m.canonico}"`, 22)))} ${c.darkGray(`[${m.categoria}]`)} ${c.warn(estrellas)}`);
  }

  console.log('\n ' + c.darkGray('Para regenerar nuevos términos con IA usa: ') + c.cyan('node rag.js vocabulario --full') + c.darkGray(' o ') + c.cyan('--dry'));
  console.log('');
  return 0;
}

// ───────────────────────────────────────────────────────────────────── embeddings (estado y generador enriquecido)
async function embeddingsCmd(flags) {
  cabecera('ESPACIO VECTORIAL', 'OpenAI text-embedding-3-small');
  const spin = cargando();
  spin.paso('consultando estado de vectores…');

  const [rProds, rEmb, rVocab, rDesc] = await Promise.all([
    traerTodo('productos', 'codigo_interno,descripcion', 'codigo_interno.asc'),
    traerTodo('productos_embedding', 'codigo_interno,descripcion,actualizado_en', 'codigo_interno.asc'),
    traerTodo('catalogo_vocabulario', 'termino,categoria&activo=eq.true', 'categoria.asc'),
    sb('producto_descripcion?select=codigo_interno&limit=1', { Prefer: 'count=exact' }),
  ]);

  const prodsValidos = rProds.filter(p => p.descripcion && p.descripcion.trim());
  const porCodigo = new Map(rEmb.map(x => [x.codigo_interno, x]));
  const sinVector = prodsValidos.filter(p => !porCodigo.has(p.codigo_interno));
  const descsIA = Number((rDesc.headers.get('content-range') || '').split('/')[1] || 0);

  const cobertura = prodsValidos.length ? (((prodsValidos.length - sinVector.length) / prodsValidos.length) * 100).toFixed(1) : '0';
  spin.fin();

  console.log(' ' + GL.ok + ' ' + c.bold('Cobertura del Catálogo:') + ' ' + c.cyan(`${cobertura}%`) + c.gray(` (${num(rEmb.length)} de ${num(prodsValidos.length)} productos embebidos)`));
  console.log(' ' + c.darkGray('Modelo: text-embedding-3-small · 1.536 dimensiones · $0.02 USD por millón de tokens.'));

  console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('Capas de Enriquecimiento Semántico:')));
  console.log(' ' + c.darkGray('─'.repeat(W + 20)));
  console.log(`  ${c.cyan('›')} ${c.bold(c.num(pad('Términos coloquiales:', 24)))} ${c.num(num(rVocab.length))} ${c.darkGray('modismos integrados en el vector')}`);
  console.log(`  ${c.cyan('›')} ${c.bold(c.num(pad('Descripciones IA (Luna):', 24)))} ${c.num(num(descsIA))} ${c.darkGray('enriquecen productos con ventas recientes')}`);
  console.log(`  ${c.cyan('›')} ${c.bold(c.num(pad('Productos pendientes:', 24)))} ${sinVector.length ? c.warn(num(sinVector.length)) : c.ok('0')} ${c.darkGray(sinVector.length ? 'requieren generar vector' : 'al día')}`);

  if (sinVector.length > 0) {
    const tokensEst = Math.ceil(sinVector.length * 90);
    const costoEst = ((tokensEst / 1e6) * 0.02).toFixed(4);
    console.log('\n ' + c.warn('▲') + ' ' + c.bold(c.warn('Pendientes de vectorización:')) + c.gray(` ~${num(tokensEst)} tokens estimados ≈ $${costoEst} USD`));
    console.log(' ' + c.darkGray('Ejecutando generador en lote…'));
    correr('scripts/generar_embeddings.js', flags || []);
  } else if (flags && (flags.includes('--full') || flags.includes('--dry'))) {
    console.log('\n ' + c.darkGray('Lanzando generador con banderas: ' + flags.join(' ')));
    correr('scripts/generar_embeddings.js', flags);
  } else {
    console.log('\n ' + c.ok('▎') + ' ' + c.bold(c.ok('Todos los productos del catálogo cuentan con vector en pgvector.')));
    console.log(' ' + c.darkGray('Si deseas forzar la re-vectorización completa usa: ') + c.cyan('node rag.js embeddings --full') + c.darkGray(' o ') + c.cyan('--dry'));
  }
  console.log('');
  return 0;
}
function ayuda() {
  cabecera('RAG · Perucho', 'CLI de la capa de búsqueda');
  const g = (t, items) => {
    console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num(t)));
    for (const [cmd, desc, nota] of items) {
      console.log('   ' + c.cyan(pad(cmd, 26)) + c.gray(desc) + (nota ? ' ' + c.darkGray(nota) : ''));
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
  console.log('\n ' + c.darkGray('`medir` cachea sus consultas a propósito: comparar dos corridas con'));
  console.log(' ' + c.darkGray('preguntas distintas no mide nada.') + '\n');
  return 0;
}

// ───────────────────────────────────────────────────────────────────── TUI interactiva (Brainless / Claude Code REPL)
async function iniciarTUI() {
  console.clear();
  cabecera('RAG · Perucho', 'TUI Interactiva');

  const menu = () => {
    console.log('\n ' + c.claude('◆') + ' ' + c.bold(c.num('Comandos rápidos:')));
    console.log('   ' + c.cyan('[1]') + ' ' + c.num('Estado general') + '      ' +
                c.cyan('[2]') + ' ' + c.num('Coseno en vivo') + '     ' +
                c.cyan('[3]') + ' ' + c.num('Diagnóstico'));
    console.log('   ' + c.cyan('[4]') + ' ' + c.num('Generar embeddings') + '  ' +
                c.cyan('[5]') + ' ' + c.num('Vocabulario') + '        ' +
                c.cyan('[6]') + ' ' + c.num('Popularidad'));
    console.log('   ' + c.cyan('[7]') + ' ' + c.num('Suite de tests') + '      ' +
                c.cyan('[8]') + ' ' + c.num('Limpiar pantalla') + '   ' +
                c.cyan('[0]') + ' ' + c.num('Salir'));
    console.log('\n ' + c.darkGray('Escribe cualquier producto para buscarlo directamente, un número de opción o /comando.') + '\n');
  };

  menu();

  const comandosCompletar = ['/estado', '/buscar ', '/coseno', '/diag ', '/embeddings', '/vocabulario', '/descripciones', '/popularidad', '/suite', '/cls', '/salir', '/ayuda'];
  const completer = line => {
    const hits = comandosCompletar.filter(c => c.startsWith(line.trim()));
    return [hits.length ? hits : comandosCompletar, line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: ' ' + c.claude('❯') + ' ',
    completer,
  });

  rl.prompt();

  for await (const linea of rl) {
    const input = linea.trim();
    if (!input) { rl.prompt(); continue; }

    const partes = input.split(' ');
    const primero = partes[0].toLowerCase();
    const argumento = partes.slice(1).join(' ').trim();

    if (primero === '0' || primero === '/salir' || primero === 'exit' || primero === 'quit' || primero === 'q') {
      console.log('\n ' + c.ok('⏺') + ' ' + c.gray('Sesión finalizada. ¡Hasta luego!') + '\n');
      rl.close();
      return 0;
    }

    if (primero === '8' || primero === '/cls' || primero === 'clear') {
      console.clear();
      cabecera('RAG · Perucho', 'TUI Interactiva');
      menu();
      rl.prompt();
      continue;
    }

    if (primero === '1' || primero === '/estado' || primero === 'estado') {
      await estado();
    } else if (primero === '2' || primero === '/coseno' || primero === 'coseno') {
      await coseno(argumento || null);
    } else if (primero === '3' || primero === '/diag' || primero === 'diag') {
      const diagFlags = argumento && argumento.includes('--json') ? ['--json'] : [];
      const diagArg = argumento ? argumento.replace('--json', '').trim() : null;
      await diagnostico(diagArg, diagFlags);
    } else if (primero === '4' || primero === '/embeddings' || primero === 'embeddings') {
      await embeddingsCmd(argumento ? argumento.split(' ') : []);
    } else if (primero === '5' || primero === '/vocabulario' || primero === 'vocabulario') {
      if (argumento && (argumento.includes('--') || argumento.includes('generar'))) {
        correr('scripts/generar_vocabulario.js', argumento ? argumento.split(' ') : []);
      } else {
        await vocabulario(argumento || null);
      }
    } else if (primero === '6' || primero === '/popularidad' || primero === 'popularidad') {
      await popularidad();
    } else if (primero === '7' || primero === '/suite' || primero === 'suite') {
      const suiteFlags = argumento ? argumento.split(' ') : ['--rapida'];
      await suite(suiteFlags);
    } else if (primero === '/descripciones' || primero === 'descripciones') {
      correr('scripts/generar_descripciones.js', argumento ? [argumento] : []);
    } else if (primero === '/buscar' || primero === 'buscar') {
      await buscar(argumento);
    } else if (primero === '/ayuda' || primero === 'ayuda' || primero === '?') {
      ayuda();
      menu();
    } else {
      // Todo texto libre sin prefijo se asume como búsqueda instantánea inteligente
      await buscar(input);
    }

    menu();
    rl.prompt();
  }
  return 0;
}

// ───────────────────────────────────────────────────────────────────── despacho
const [cmd, ...rest] = process.argv.slice(2);
const resto = rest.filter(a => !a.startsWith('--'));
const flags = rest.filter(a => a.startsWith('--'));

(async () => {
  // Si no se especifica comando y estamos en una terminal interactiva (TTY), iniciar TUI interactiva
  if (!cmd && TTY) {
    return await iniciarTUI();
  }

  switch ((cmd || 'estado').toLowerCase()) {
    case 'tui': case 'interactivo': case 'i': return await iniciarTUI();
    case 'estado': case 'status':        return await estado();
    case 'buscar': case 'search':        return await buscar(resto.join(' '));
    case 'coseno': case 'vectores':      return await coseno(resto.join(' '));
    case 'diag':                         return await diagnostico(resto.join(' '), flags);
    case 'suite':                        return await suite(flags);
    case 'medir': case 'bench':          return correr('scripts/_test_coloquial.js', flags) ? 0 : 1;
    case 'regresion': case 'regression': return correr('scripts/_test_busqueda_50.js') ? 0 : 1;
    case 'vector':                       return correr('scripts/_test_vector.js') ? 0 : 1;
    case 'fallos':                       return correr('scripts/_test_fallos_reales.js', ['--prod']) ? 0 : 1;
    case 'auditar': case 'audit':        return correr('scripts/_audit_sin.js', flags) ? 0 : 1;
    case 'embeddings':                   return await embeddingsCmd(flags);
    case 'vocabulario':                  return flags.length || resto.length ? (correr('scripts/generar_vocabulario.js', rest) ? 0 : 1) : await vocabulario();
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

