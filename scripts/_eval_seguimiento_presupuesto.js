// Eval: after a quote is sent, a follow-up question about it ("con el flete cuanto seria",
// "precios en bolivares y divisas") must be answered on its own, not by re-sending the
// whole quote. Real case 2026-10-30: the customer got the same quote three times.
//
// Runs the deployed system prompt and the real tool bodies against the live model.
// The model is not deterministic (temperature 0.3), so the case repeats N times.
//
//   REPS=5 node scripts/_eval_seguimiento_presupuesto.js [modelo]
// (the first argument is the model, read by _test_modelo; repetitions go through REPS)
const { chat, TOOLS_IMPL, SYS, MODEL } = require('./_test_modelo');

const LISTA = '15 Cabilla de 10 milimetro. 10 cabillas 12 milimtro 8 cabillia de 5 milim. 3 tubo de 2x2 de 80mm. 6 tubo de 3x1. 2 tubo 1x1 x6metros';
// recotizar: whether this turn SHOULD call hacer_presupuesto again (the control case changes quantities).
const SEGUIMIENTOS = [
  { texto: 'Con el flete cuanto seria', recotizar: false },
  { texto: 'Si puede ponerme los precios en bolívares y en divisas', recotizar: false },
  { texto: 'Mejor que sean 10 tubos de 3x1 en vez de 6', recotizar: true },
];
const REPS = Number(process.env.REPS) || 3;

// A re-sent quote carries its numbered lines and totals block again.
const reenviaLista = t => /veamos si entiendo|Pagando en d[oó]lares/i.test(t) && /\n\s*1\.\s/.test(t);

async function turno(msgs, texto) {
  msgs.push({ role: 'user', content: texto });
  const tools = [];
  for (let paso = 0; paso < 5; paso++) {
    const m = (await chat(msgs)).choices[0].message;
    msgs.push(m);
    if (!m.tool_calls || !m.tool_calls.length) return { final: m.content || '', tools };
    for (const c of m.tool_calls) {
      tools.push(c.function.name);
      const fn = TOOLS_IMPL[c.function.name];
      let res;
      try { res = fn ? await fn(JSON.parse(c.function.arguments || '{}')) : '{"error":"tool desconocida"}'; }
      catch (e) { res = JSON.stringify({ error: e.message }); }
      msgs.push({ role: 'tool', tool_call_id: c.id, content: String(res).slice(0, 12000) });
    }
  }
  return { final: '', tools };
}

(async () => {
  console.log(`MODELO: ${MODEL} | ${REPS} repeticiones\n`);
  let fallos = 0, total = 0;
  for (let r = 1; r <= REPS; r++) {
    const msgs = [{ role: 'system', content: SYS }];
    const t0 = await turno(msgs, LISTA);
    if (!t0.tools.includes('hacer_presupuesto')) { console.log(`#${r} ✗ el primer turno no cotizó (${t0.tools.join(',') || 'sin tools'})`); fallos++; continue; }
    for (const s of SEGUIMIENTOS) {
      total++;
      const t = await turno(msgs, s.texto);
      const recotiza = t.tools.includes('hacer_presupuesto');
      const repite = reenviaLista(t.final);
      const mal = s.recotizar ? !recotiza : (recotiza || repite);
      if (mal) fallos++;
      console.log(`#${r} ${mal ? '✗' : '✓'} "${s.texto}" tools=[${t.tools.join(',')}] reenvia_lista=${repite}`);
      console.log('     ' + t.final.replace(/\n/g, ' ').slice(0, 220));
    }
  }
  console.log(`\n${fallos ? fallos + ' FALLO(S)' : 'Todo OK'} (${total} seguimientos)`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error('ERROR', e.message); process.exit(2); });
