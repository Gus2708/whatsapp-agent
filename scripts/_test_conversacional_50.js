// Harness conversacional: 50 flujos fieles a los chats guardados, probando AMBAS tools
// (buscar_productos_tool y hacer_presupuesto_tool) con la consulta ya CONTEXTUALIZADA que
// un agente competente armaría en el turno clave (follow-ups, correcciones, listas).
// Compara OLD (scratch_live/*.bak.js) vs NEW (actual) contra Supabase real.
const fs = require('fs');
const AF = Object.getPrototypeOf(async function () {}).constructor;
const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json().catch(() => null) }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: (c && c.headers) || {}, body: JSON.stringify(b) }); return { data: await r.json().catch(() => null) }; },
};
const req = n => n === 'axios' ? axiosShim : require(n);
const load = f => new AF('require', 'query', fs.readFileSync(f, 'utf8'));
const loadOr = (f, alt) => load(fs.existsSync(f) ? f : alt);
const OLD = { buscar: loadOr('scratch_live/live_buscar.bak.js', 'scratch_live/live_buscar.js'), pres: loadOr('scratch_live/live_presupuesto.bak.js', 'scratch_live/live_presupuesto.js') };
const NEW = { buscar: load('scratch_live/live_buscar.js'), pres: load('scratch_live/live_presupuesto.js') };

// t = tool ('b'=buscar | 'p'=presupuesto); ctx = turnos previos (doc); in = input contextualizado;
// exp = substring esperado en el top (lowercase) o 'escalate'
const T = [
  // ---- A) Lámina arquitectónica (patrón real #1) ----
  { f: 'lamina-arq', t: 'b', ctx: 'tienen laminas arquitectonicas?', in: 'lamina arquitectonica', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: '...de 6 metros calibre 30', in: 'lamina arquitectonica 6 metros calibre 30', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: '...calibre 0.30', in: 'lamina arquitectonica calibre 0.30', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: 'cliente escribe coma: 0,30', in: 'lamina arquitectonica 0,30 mts', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: 'follow-up "Y de 1.1" tras lamina', in: 'lamina arquitectonica 1.1', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: 'follow-up "Esas son de 0,30 ml"', in: 'lamina arquitectonica 0,30', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'p', ctx: 'cierra presupuesto', in: 'lamina arquitectonica 6 metros calibre 30:2', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'p', ctx: 'presupuesto medida explícita', in: 'lamina arquitectonica 1.10 x 6 mts:1', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: 'pide color', in: 'lamina techo arquitectonica azul', exp: 'arquitectonica' },
  { f: 'lamina-arq', t: 'b', ctx: 'genérico de 6m', in: 'lamina de techo de 6 metros', exp: 'lamina' },
  // ---- B) Zinc ----
  { f: 'zinc', t: 'b', ctx: 'inicio', in: 'lamina de zinc', exp: 'zinc' },
  { f: 'zinc', t: 'b', ctx: 'typo sinz', in: 'sinz', exp: 'zinc' },
  { f: 'zinc', t: 'b', ctx: '12 pies', in: 'lamina zinc 12 pies', exp: 'zinc' },
  { f: 'zinc', t: 'b', ctx: 'calibre decimal', in: 'lamina zinc calibre 0.20', exp: 'zinc' },
  { f: 'zinc', t: 'b', ctx: 'ondulado color', in: 'zinc ondulado azul', exp: 'zinc' },
  { f: 'zinc', t: 'p', ctx: 'presupuesto', in: 'lamina zinc 12 pies:3', exp: 'zinc' },
  { f: 'zinc', t: 'b', ctx: 'sinz de 6 metros (real)', in: 'sinz de 6 metros', exp: 'lamina' },
  // ---- C) Tubo herrería (chat pegado) ----
  { f: 'tubo-herr', t: 'b', ctx: 'inicio', in: 'tubo herreria 2x2', exp: 'tubo' },
  { f: 'tubo-herr', t: 'b', ctx: 'otra medida', in: 'tubo 2x1', exp: 'tubo' },
  { f: 'tubo-herr', t: 'p', ctx: 'INPUT EXACTO del chat pegado', in: 'tubo 2x2:2, tubo 1x2:1', exp: 'tubo' },
  { f: 'tubo-herr', t: 'p', ctx: 'nombres completos', in: 'Tubo Herreria 2X2 0.90MM 6MTS:2, Tubo Herrería 2X1X0.80X6MTS:1', exp: 'tubo' },
  { f: 'tubo-herr', t: 'b', ctx: 'typo "Hereroa"->herreria', in: 'herreria', exp: 'tubo' },
  { f: 'tubo-herr', t: 'b', ctx: '4x4 no existe (real)', in: 'tubo estructural 4x4', exp: 'escalate' },
  { f: 'tubo-herr', t: 'b', ctx: 'cuadrado 1x1', in: 'tubo cuadrado 1x1', exp: 'tubo' },
  // ---- D) Cabilla ----
  { f: 'cabilla', t: 'b', ctx: 'inicio', in: 'cabilla', exp: 'estriada' },
  { f: 'cabilla', t: 'b', ctx: 'follow "de media"->1/2', in: 'cabilla 1/2', exp: 'estriada' },
  { f: 'cabilla', t: 'b', ctx: '3/8', in: 'cabilla 3/8', exp: 'estriada' },
  { f: 'cabilla', t: 'b', ctx: 'cuadrada explícita', in: 'cabilla cuadrada', exp: 'cuadrada' },
  { f: 'cabilla', t: 'p', ctx: 'presupuesto 2 medidas', in: 'cabilla 1/2:10, cabilla 3/8:5', exp: 'estriada' },
  // ---- E) Cemento ----
  { f: 'cemento', t: 'b', ctx: 'genérico=gris', in: 'cemento', exp: 'gris' },
  { f: 'cemento', t: 'b', ctx: 'blanco', in: 'cemento blanco', exp: 'blanco' },
  { f: 'cemento', t: 'p', ctx: 'presupuesto', in: 'cemento:5', exp: 'gris' },
  { f: 'cemento', t: 'b', ctx: 'follow "el gris"', in: 'cemento gris', exp: 'gris' },
  // ---- F) Fragmentos reales / ruido (deben escalar limpio, sin crash) ----
  { f: 'ruido', t: 'b', ctx: 'real', in: 'Tiene pipas de agua de 200', exp: 'escalate' },
  { f: 'ruido', t: 'b', ctx: 'real', in: 'tienen tabelones', exp: 'escalate' },
  { f: 'ruido', t: 'b', ctx: 'real', in: 'malla truckson', exp: 'escalate' },
  { f: 'ruido', t: 'b', ctx: 'confirmación suelta', in: 'Si', exp: 'escalate' },
  { f: 'ruido', t: 'b', ctx: 'cortesía suelta', in: 'Por favor', exp: 'escalate' },
  { f: 'ruido', t: 'b', ctx: 'real fragmento', in: 'Esas son de 0,30 ml', exp: 'any' },
  // ---- G) Presupuestos mixtos (agotado/alts) ----
  { f: 'presup-mix', t: 'p', ctx: 'tornillos (agotado->disp)', in: 'tornillos:1', exp: 'tornillos' },
  { f: 'presup-mix', t: 'p', ctx: '3 renglones', in: 'tubo 2x2:5, cemento:2, cabilla 1/2:10', exp: 'any' },
  { f: 'presup-mix', t: 'p', ctx: 'cable', in: 'cable thwn 12:1', exp: 'cable' },
  // ---- H) Otras categorías (guardia anti-regresión) ----
  { f: 'otros', t: 'b', ctx: '', in: 'teipe negro', exp: 'teipe' },
  { f: 'otros', t: 'b', ctx: '', in: 'codo 1/2', exp: 'codo' },
  { f: 'otros', t: 'b', ctx: '', in: 'disco de corte', exp: 'disco' },
  { f: 'otros', t: 'b', ctx: '', in: 'silicon transparente', exp: 'silicon' },
  { f: 'otros', t: 'b', ctx: '', in: 'pega para pvc', exp: 'pega' },
  { f: 'otros', t: 'b', ctx: '', in: 'llave de paso', exp: 'llave' },
  { f: 'otros', t: 'b', ctx: '', in: 'tubo de luz de 1/2', exp: 'electricidad' },
  { f: 'otros', t: 'p', ctx: 'granel', in: 'arena fina:1', exp: 'arena' },
];

function summarize(set, inp, t) {
  // devuelve {status:'PEDIR'|'no'|'ok', top:''}
  return (async () => {
    try {
      if (t === 'b') {
        const r = JSON.parse(await set.buscar(req, { p_busqueda: inp }));
        const pe = r.instruccion && /PEDIR_AYUDA/.test(r.instruccion);
        const top = (r.productos && r.productos[0]) ? r.productos[0].nombre : '';
        if (r.encontrados === 0 || pe) return { status: 'PEDIR', top: top };
        if (r.instruccion && /NO coincide/.test(r.instruccion)) return { status: 'DEBIL', top };
        return { status: 'ok', top };
      } else {
        const r = JSON.parse(await set.pres(req, { some_input: inp }));
        if (!r.ok) return { status: 'PEDIR', top: r.mensaje || '' };
        const first = (r.presupuesto_texto || '').split('\n')[0].replace(/[*0-9.]/g, '').trim();
        return { status: 'ok', top: first };
      }
    } catch (e) { return { status: 'CRASH', top: e.message }; }
  })();
}

(async () => {
  let pass = 0, fail = 0, fixed = 0, regress = 0;
  const fails = [];
  for (let i = 0; i < T.length; i++) {
    const c = T[i];
    const o = await summarize(OLD, c.in, c.t);
    const n = await summarize(NEW, c.in, c.t);
    // ¿NEW cumple expectativa?
    const tl = (n.top || '').toLowerCase();
    let ok;
    if (c.exp === 'escalate') ok = (n.status === 'PEDIR' || n.status === 'DEBIL');
    else if (c.exp === 'any') ok = (n.status !== 'CRASH');
    else ok = (n.status === 'ok' && tl.includes(c.exp));
    if (ok) pass++; else { fail++; fails.push(c.in + '  [exp:' + c.exp + '] -> ' + n.status + ' ' + n.top.slice(0, 40)); }
    const changed = (o.status !== n.status) || ((o.top || '').slice(0, 30) !== (n.top || '').slice(0, 30));
    if (changed && ok && (o.status === 'PEDIR' || o.status === 'DEBIL' || o.status === 'CRASH') && n.status === 'ok') fixed++;
    if (changed && !ok && o.status === 'ok') regress++;
    const mark = ok ? '✓' : '✗';
    const ch = changed ? ' ➤' : '  ';
    console.log(`${String(i + 1).padStart(2)}.${ch}${mark} [${c.t}|${c.f}] "${c.in.slice(0, 44)}"`);
    if (changed) console.log(`       OLD[${o.status}] ${(o.top || '').slice(0, 38)}  ==>  NEW[${n.status}] ${(n.top || '').slice(0, 38)}`);
    else console.log(`       [${n.status}] ${(n.top || '').slice(0, 50)}`);
  }
  console.log('\n================ RESUMEN ================');
  console.log('Total', T.length, '| PASS', pass, '| FAIL', fail, '| arreglados (OLD fallaba, NEW ok)', fixed, '| regresiones', regress);
  if (fails.length) { console.log('\n-- FAILS --'); fails.forEach(x => console.log('  ✗', x)); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
