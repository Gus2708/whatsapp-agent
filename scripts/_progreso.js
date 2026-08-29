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

const e = (n, s) => (TTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const dim = s => e(2, s);
const verde = s => e(32, s);
const cian = s => e(36, s);
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
    // La estimación necesita algo de historia. Con menos de 3s o 2 lotes el ritmo es ruido
    // y salía "faltan 0s" nada más arrancar, que parece un error.
    const fiable = transcurrido >= 3 && hechos > 0;
    const restante = hechos < total
      ? (fiable ? 'faltan ' + tiempo((total - hechos) / ritmo) : 'calculando…')
      : tiempo(transcurrido);

    const barra = verde('█'.repeat(llenos)) + dim('░'.repeat(ANCHO - llenos));
    const linea = '  ' + cian(CUADROS[cuadro % CUADROS.length]) + '  ' + barra +
      '  ' + num(hechos) + dim('/') + num(total) +
      '  ' + pct.toFixed(1).padStart(5) + '%' +
      dim('  ' + restante) +
      (extra ? dim('  ' + extra) : '');
    // limpiar hasta el final de línea, no solo volver al inicio: si la línea anterior era
    // más larga quedaban restos
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
      if (resumen) console.log('  ' + verde('✓') + ' ' + resumen + dim('  ·  ' + tiempo(seg)));
    },
  };
};
