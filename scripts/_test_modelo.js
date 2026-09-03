const fs = require('fs');
const path = require('path');
const CRED = require('./_lib_credenciales');

// READ-ONLY(*): prueba end-to-end de un MODELO contra el agente real.
// Usa el systemMessage desplegado + el cuerpo EXACTO de buscar_productos /
// hacer_presupuesto contra Supabase real, y corre el bucle de tool-calling
// como lo hace n8n. Sirve para comparar modelos antes de cambiar el workflow.
//
//   node scripts/_test_modelo.js                      # el modelo desplegado
//   node scripts/_test_modelo.js openai/gpt-4.1-mini  # linea base
//
// (*) las tools de Engram van STUBEADAS: no escribe memoria de clientes reales.

const ROOT = path.join(__dirname, '..');
const wf = JSON.parse(fs.readFileSync(path.join(ROOT, 'n8n_workflow.json'), 'utf8'));
const nodeBy = n => wf.nodes.find(x => x.name === n);

const MODEL = process.argv[2] || nodeBy('OpenRouter Chat Model').parameters.model;
const TEMP = nodeBy('OpenRouter Chat Model').parameters.options.temperature;
const SYS = nodeBy('AI Agent').parameters.options.systemMessage;

// Fail loud and named if the key is absent, instead of a bare TypeError from
// indexing a failed regex match. Single source of truth: _lib_credenciales.
const OR_KEY = CRED.exigirCredenciales(['OPENROUTER_API_KEY']).OPENROUTER_API_KEY;

// --- ejecucion real de los nodos Code (mismo shim que _verify_cable_rollo.js) ---
const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); return { data: await r.json() }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: { ...((cfg && cfg.headers) || {}) }, body: JSON.stringify(body) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d }; },
};
const fakeRequire = n => (n === 'axios' ? axiosShim : require(n));
const runner = body => new Function('query', 'require', '$env', '"use strict"; return (async () => {\n' + body + '\n})();');
const read = f => fs.readFileSync(path.join(ROOT, 'scratch_live', f), 'utf8');
const BUSCAR = read('live_buscar.js');
const PRESUP = read('live_presupuesto.js');

// $env: el nodo Code de n8n lo expone; sin él el rescate semántico no se ejecuta.
const $ENV = CRED.construirEnv();
const TOOLS_IMPL = {
  buscar_productos: q => runner(BUSCAR)(q, fakeRequire, $ENV),
  hacer_presupuesto: q => runner(PRESUP)(q, fakeRequire, $ENV),
  obtener_tasa_bcv: async () => {
    const r = await fetch('https://rgniqjfooifchyctnbzu.supabase.co/rest/v1/tazas?select=*&order=fecha.desc&limit=1',
      { headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } });
    const d = await r.json();
    return JSON.stringify({ bcv_usd: d[0] && (d[0].bcv || d[0].tasa_bcv || d[0].valor) });
  },
  // STUBS: no tocar la memoria real de clientes
  buscar_memoria_engram: async () => JSON.stringify({ encontrado: false, nota: 'cliente nuevo' }),
  guardar_memoria_engram: async () => JSON.stringify({ ok: true, stub: true }),
};
const ANON = (BUSCAR.match(/const ANON = '([^']+)'/) || [])[1];

// --- esquemas de las tools, tal como los ve el agente ---
function toolDefs() {
  const out = [];
  for (const n of wf.nodes.filter(x => /toolCode/.test(x.type || ''))) {
    const p = n.parameters;
    let params;
    // inputSchema es el JSON Schema explicito y es el mas fiel; jsonSchemaExample
    // es el ejemplo del que n8n lo infiere. Preferimos el explicito cuando existe.
    if (p.inputSchema) {
      try { const s = JSON.parse(p.inputSchema); if (s && s.type === 'object') params = s; } catch (e) {}
    }
    if (!params && p.jsonSchemaExample) {
      // n8n infiere el schema del ejemplo: replicamos como objeto de strings
      let ex = {};
      try { ex = JSON.parse(p.jsonSchemaExample); } catch (e) {}
      const props = {};
      for (const k of Object.keys(ex)) props[k] = { type: 'string' };
      params = { type: 'object', properties: props, required: Object.keys(ex) };
    }
    out.push({ type: 'function', function: { name: p.name, description: p.description, parameters: params || { type: 'object', properties: {} } } });
  }
  return out;
}
const TOOLS = toolDefs();

async function chat(messages) {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OR_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: TEMP, messages, tools: TOOLS }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 300));
  return j;
}

// El guardia real del workflow: ¿la salida parece una tool-call filtrada o un bucle?
function looksCorrupt(t) {
  if (!t || typeof t !== 'string') return false;
  if (t.length > 4000) return true;
  if (/Calling\s+[\w-]+\s+with input\s*:/i.test(t)) return true;
  if (/"id"\s*:\s*"call_/.test(t)) return true;
  if (/(.{1,4})\1{20,}/s.test(t.slice(0, 4000))) return true;
  return false;
}

async function conversar(turnos) {
  const msgs = [{ role: 'system', content: SYS }];
  const usadas = [];
  let final = '', inTok = 0, outTok = 0, ms = 0;
  for (const t of turnos) {
    msgs.push({ role: 'user', content: t });
    for (let paso = 0; paso < 5; paso++) {
      const t0 = Date.now();
      const j = await chat(msgs);
      ms += Date.now() - t0;
      inTok += j.usage.prompt_tokens; outTok += j.usage.completion_tokens;
      const m = j.choices[0].message;
      msgs.push(m);
      if (!m.tool_calls || !m.tool_calls.length) { final = m.content || ''; break; }
      for (const c of m.tool_calls) {
        const fn = TOOLS_IMPL[c.function.name];
        usadas.push(c.function.name + '(' + String(c.function.arguments).slice(0, 90) + ')');
        let res;
        try { res = fn ? await fn(JSON.parse(c.function.arguments || '{}')) : JSON.stringify({ error: 'tool desconocida' }); }
        catch (e) { res = JSON.stringify({ error: e.message }); }
        msgs.push({ role: 'tool', tool_call_id: c.id, content: String(res).slice(0, 12000) });
      }
    }
  }
  return { final, usadas, inTok, outTok, ms };
}

const CASOS = [
  { n: 'catálogo normal', turnos: ['epa buenas, tienen cemento gris?'] },
  { n: 'venta por rollo', turnos: ['buenas, cuanto cuesta el rollo de cable numero 12?'] },
  { n: 'no existe → [PEDIR_AYUDA]', turnos: ['tienes turbina de avion boeing 747?'] },
  { n: 'consulta vaga → preguntar', turnos: ['hola, necesito algo para la casa'] },
  { n: 'presupuesto', turnos: ['hazme un presupuesto de 2 sacos de cemento gris y 4 cabillas de 3/8'] },
  { n: 'confirma compra → [RESERVA:]', turnos: ['tienen cemento gris?', 'perfecto, apartame 2 sacos que paso mañana a buscarlos'] },
  // Seguimientos: el 43% de los fallos reales (solicitudes_ayuda) eran mensajes
  // cortos que continuaban el tema y el bot los buscó sueltos o escaló.
  { n: 'follow-up medida', turnos: ['buenas, tienen lamina arquitectonica?', 'de la de 3.60'] },
  { n: 'follow-up saco', turnos: ['tienen cemento?', 'y el saco cuanto sale'] },
  { n: 'follow-up medida suelta', turnos: ['buenas, tienen tubo de herreria?', '2/1  1mm. Cuanto cuesta'] },
  // Rescate semántico: el cliente describe la FUNCIÓN, no el producto. La búsqueda
  // devuelve una HIPÓTESIS y el bot DEBE preguntar antes de darla por buena.
  { n: 'rescate acertado', turnos: ['buenas, que me vende para pegar los bloques?'] },
  { n: 'rescate dudoso (debe preguntar)', turnos: ['Varón Pistón de guadaña de 53cc o 45mm tienes?'] },
  { n: 'rescate refutado → [PEDIR_AYUDA]', turnos: ['aparato para medir la corriente', 'no, eso no es lo que busco'] },
];

(async () => {
  console.log(`MODELO: ${MODEL} | temp ${TEMP} | prompt ${SYS.length} chars | ${TOOLS.length} tools\n`);
  let tIn = 0, tOut = 0, tMs = 0;
  for (const c of CASOS) {
    process.stdout.write(`── ${c.n}\n`);
    try {
      const r = await conversar(c.turnos);
      tIn += r.inTok; tOut += r.outTok; tMs += r.ms;
      console.log(`   tools: ${r.usadas.join(' → ') || '(ninguna)'}`);
      console.log(`   ${r.ms} ms | in ${r.inTok} / out ${r.outTok}${looksCorrupt(r.final) ? '  ⚠️ SALIDA CORRUPTA (el guardia la bloquearía)' : ''}`);
      console.log('   ' + (r.final || '(vacío)').replace(/\n/g, '\n   ').slice(0, 700) + '\n');
    } catch (e) { console.log(`   ✗ ERROR: ${e.message}\n`); }
  }
  const P = { 'openai/gpt-5.6-luna': [0.10, 0.60], 'openai/gpt-4.1-mini': [0.40, 1.60] }[MODEL];
  console.log(`TOTAL: ${tMs} ms | in ${tIn} / out ${tOut}` +
    (P ? ` | costo ${(tIn / 1e6 * P[0] + tOut / 1e6 * P[1]).toFixed(4)} USD (${CASOS.length} conversaciones)` : ''));
})().catch(e => { console.error('ERROR', e.message, e.stack); process.exit(1); });
