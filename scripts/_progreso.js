// Barra de progreso animada para los generadores (embeddings, vocabulario, descripciones).
//
// Dos cosas que parecen detalle y no lo son:
//   · La animación va con su propio temporizador, no con las actualizaciones. Un lote de
//     embeddings tarda segundos; si el spinner solo girase al avanzar, parecería colgado
//     justo cuando más importa saber que sigue vivo.
//   · Si la salida NO es una terminal, el \r queda literal y ensucia los logs (ya pasó con
//     el CLI). En ese caso se imprimen líneas sueltas cada 10%.
//
//   const P = progreso(total, { etiqueta: 'embebiendo' });
//   P.avance(n, { extra: '$0.0031' });
//   P.fin('7.688 embebidos');
const TTY = process.stdout.isTTY;
const ANCHO = 28;
const CUADROS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const COLORTERM = process.env.COLORTERM || '';
const TRUECOLOR = TTY && (COLORTERM === 'truecolor' || COLORTERM === '24bit' || process.env.TERM_PROGRAM === 'vscode' || process.env.WT_SESSION);

const e = (n, s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const rgb = (r, g, b, s) => (TTY ? (TRUECOLOR ? `\x1b[38;2;${r};${g};${b}m${s}\x1b[0m` : e(36, s)) : s);

const c = {
  dim: s => e(2, s),
  bold: s => e(1, s),
  claude: s => rgb(205, 105, 74, s),       // Terracota Serrucho (#cd694a)
  cyan: s => rgb(125, 207, 255, s),         // Azul claro cian (#7dcfff)
  ok: s => rgb(78, 169, 111, s),           // Verde suave (#4ea96f)
  err: s => rgb(247, 118, 142, s),         // Rojo suave (#f7768e)
  warn: s => rgb(224, 175, 104, s),        // Amarillo/Ocre (#e0af68)
  gray: s => rgb(139, 143, 163, s),        // Gris medio (#8b8fa3)
  darkGray: s => rgb(86, 95, 137, s),      // Gris azulado (#565f89)
  num: s => rgb(192, 202, 245, s),         // Blanco suave (#c0caf5)
};
const num = n => Number(n).toLocaleString('es-VE');

function tiempo(seg) {
  if (!isFinite(seg) || seg < 0) return '—';
  if (seg < 60) return Math.round(seg) + 's';
  const m = Math.floor(seg / 60);
  return m + 'm ' + String(Math.round(seg % 60)).padStart(2, '0') + 's';
}

module.exports = function progreso(total, opciones) {
  const op = opciones || {};
  const etiqueta = op.etiqueta || 'procesando';
  const t0 = Date.now();
  let hechos = 0, extra = '', cuadro = 0, ultimoHito = -1, cerrado = false;

  function pintar() {
    if (cerrado) return;
    const pct = total ? Math.min(100, (hechos / total) * 100) : 0;
    const llenos = Math.round((pct / 100) * ANCHO);
    const transcurrido = (Date.now() - t0) / 1000;
    const ritmo = hechos / Math.max(transcurrido, 0.001);
    const fiable = transcurrido >= 3 && hechos > 0;
    const restante = hechos < total
      ? (fiable ? 'faltan ' + tiempo((total - hechos) / ritmo) : 'calculando…')
      : tiempo(transcurrido);

    const barra = c.cyan('█'.repeat(llenos)) + c.darkGray('░'.repeat(ANCHO - llenos));
    const linea = '  ' + c.claude(CUADROS[cuadro % CUADROS.length]) + '  ' + barra +
      '  ' + c.num(num(hechos)) + c.darkGray('/') + c.num(num(total)) +
      '  ' + c.num(pct.toFixed(1).padStart(5) + '%') +
      c.darkGray('  ·  ' + restante) +
      (extra ? '  ' + c.claude(extra) : '');
    process.stdout.write('\r\x1b[2K' + linea);
  }

  // el spinner gira solo; unref() para no impedir que el proceso termine
  let reloj = null;
  if (TTY) {
    reloj = setInterval(() => { cuadro++; pintar(); }, 90);
    if (reloj.unref) reloj.unref();
  }

  return {
    avance(n, datos) {
      hechos = n;
      if (datos && datos.extra !== undefined) extra = datos.extra;
      if (TTY) { pintar(); return; }
      // sin terminal: una línea por cada 10% para no inundar el log
      const hito = total ? Math.floor((hechos / total) * 10) : 0;
      if (hito !== ultimoHito) {
        ultimoHito = hito;
        console.log(`  ${etiqueta} ${num(hechos)}/${num(total)} (${((hechos / total) * 100).toFixed(0)}%)`);
      }
    },
    // se llama también al fallar, para no dejar la barra a medias en la terminal
    fin(resumen) {
      if (cerrado) return;
      cerrado = true;
      if (reloj) clearInterval(reloj);
      const seg = (Date.now() - t0) / 1000;
      if (TTY) process.stdout.write('\r\x1b[2K');
      if (resumen) console.log('  ' + c.ok('⏺') + ' ' + c.bold(c.num(resumen)) + c.darkGray('  ·  ' + tiempo(seg)));
    },
  };
};
