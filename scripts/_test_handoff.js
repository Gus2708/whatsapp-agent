// _test_handoff.js — compara la deteccion de relevo humano VIEJA vs NUEVA contra datos reales.
//
// El nodo "Detectar Handoff Empleado" decide si un mensaje SALIENTE lo escribio el bot
// o un empleado. Si se equivoca y dice "bot", el chat nunca pasa a 'manual' y Perucho
// sigue respondiendo encima del empleado. Si se equivoca al reves, calla al bot 30 min.
//
// Este harness mide las dos direcciones sobre los mensajes reales de mensajes_bot:
//   FALSO "es bot"  -> el empleado escribe y no se detecta el relevo  (bug que arreglamos)
//   FALSO "empleado" -> un texto propio del bot se lee como humano   (regresion a evitar)
const fs = require('fs');
const path = require('path');

const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.+)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
if (!SB || !ANON) throw new Error('Faltan SUPABASE_URL / SUPABASE_ANON_KEY en .env');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };

const norm = (t) => String(t || '').toLowerCase().replace(/\*/g, '').replace(/\s+/g, ' ').trim().slice(0, 300);

// --- Plantillas fijas, tal cual salen de los nodos Send*/Reply* del workflow vivo ---
const T_HANDOVER = 'En un momento uno de nuestros asesores comerciales continuará atendiéndote de forma personalizada. ¡Muchas gracias por tu paciencia!';
const T_BRIDGE = 'Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚';
const T_NONTEXT = '👨🏻‍🔧 ¡Hola! Soy *Perucho*, el bot de Ferretería El Serrucho 🪚. Solo respondo mensajes de *texto*, 🎤 *notas de voz* e 🖼️ *imágenes*. Si enviaste un video o documento, por favor escríbeme lo que necesitas 📝';

const PLANTILLAS_VIEJAS = [norm(T_HANDOVER), norm(T_BRIDGE)];
const PLANTILLAS_NUEVAS = [norm(T_HANDOVER), norm(T_BRIDGE), norm(T_NONTEXT)];

// --- Logica VIEJA: inclusion suelta en ambas direcciones ---
const matchViejo = (a, b) => !!a && !!b && (a === b || a.includes(b) || b.includes(a));

// --- Logica NUEVA: igualdad exacta, o inclusion solo si el texto es largo e inequivoco ---
const MIN_INCL = 40;
const matchNuevo = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) && b.length >= MIN_INCL) return true;
  if (b.includes(a) && a.length >= MIN_INCL) return true;
  return false;
};

function esBot(ntext, pool, plantillas, match) {
  for (const tpl of plantillas) if (match(ntext, tpl)) return true;
  for (const s of pool) if (match(s, ntext)) return true;
  return false;
}

// Respuestas cortas tipicas de un empleado que toma el chat.
const EMPLEADO = ['no', 'si', 'ok', 'ya', 'hola', 'listo', 'buenas', 'gracias', 'claro', 'dale',
  'perfecto', 'correcto', 'si hay', 'no hay', 'ya voy', 'buenas tardes', 'epa', 'si señor',
  'te lo aparto', 'pasa por la tienda', 'lo tenemos disponible amigo mio'];

(async () => {
  const url = `${SB}/rest/v1/mensajes_bot?select=chat_id,texto_norm,created_at&order=created_at.desc&limit=1000`;
  const rows = await (await fetch(url, { headers: H })).json();
  if (!Array.isArray(rows)) throw new Error('Supabase: ' + JSON.stringify(rows).slice(0, 200));

  // Pool por chat = los ultimos 20 mensajes del bot (lo que consulta el nodo real).
  const porChat = new Map();
  for (const r of rows) {
    if (!porChat.has(r.chat_id)) porChat.set(r.chat_id, []);
    const p = porChat.get(r.chat_id);
    if (p.length < 20) p.push(r.texto_norm);
  }
  const chats = [...porChat.entries()].filter(([, p]) => p.length);
  console.log(`Corpus: ${rows.length} mensajes del bot en ${chats.length} chats\n`);

  // ---- Direccion 1: el empleado escribe -> deberia detectarse relevo (esBot === false) ----
  console.log('--- 1. EMPLEADO escribe (esperado: relevo detectado en los 100% de los chats) ---');
  let peorViejo = 0;
  const filas = [];
  for (const texto of EMPLEADO) {
    const nt = norm(texto);
    let vFall = 0, nFall = 0;
    for (const [, pool] of chats) {
      if (esBot(nt, pool, PLANTILLAS_VIEJAS, matchViejo)) vFall++;
      if (esBot(nt, pool, PLANTILLAS_NUEVAS, matchNuevo)) nFall++;
    }
    peorViejo = Math.max(peorViejo, vFall);
    if (vFall || nFall) filas.push([texto, vFall, nFall]);
  }
  if (!filas.length) console.log('  (ningun caso problematico)');
  for (const [t, v, n] of filas) {
    const pv = ((v / chats.length) * 100).toFixed(0), pn = ((n / chats.length) * 100).toFixed(0);
    console.log(`  "${t}"`.padEnd(34) + `viejo: ${String(v).padStart(3)}/${chats.length} (${pv}%) ignorado   ->   nuevo: ${n}/${chats.length} (${pn}%)`);
  }

  // ---- Direccion 2: el bot escribe -> NO debe leerse como empleado (regresion = mutear) ----
  console.log('\n--- 2. El BOT escribe (esperado: reconocido como bot, sin mutear) ---');
  let regr = 0;
  for (const [chat, pool] of chats) {
    const propio = pool[0]; // su propio ultimo mensaje, tal cual vuelve por el echo fromMe
    if (!esBot(propio, pool, PLANTILLAS_NUEVAS, matchNuevo)) {
      regr++;
      if (regr <= 3) console.log(`  ✗ NO reconocido en ${chat}: "${propio.slice(0, 70)}..."`);
    }
  }
  console.log(`  mensajes propios del bot no reconocidos: ${regr}/${chats.length}`);

  console.log('\n--- 3. Plantillas fijas (esperado: reconocidas -> el bot no se autosilencia) ---');
  for (const [nombre, txt] of [['Send Handover', T_HANDOVER], ['Send Bridge', T_BRIDGE], ['Reply Non-Text', T_NONTEXT]]) {
    const nt = norm(txt);
    const v = esBot(nt, [], PLANTILLAS_VIEJAS, matchViejo);
    const n = esBot(nt, [], PLANTILLAS_NUEVAS, matchNuevo);
    console.log(`  ${nombre.padEnd(16)} viejo: ${v ? 'ok' : '✗ SE AUTOSILENCIA'}   nuevo: ${n ? 'ok' : '✗ SE AUTOSILENCIA'}`);
  }

  console.log(`\nResumen: el peor caso viejo ignoraba el relevo en ${peorViejo}/${chats.length} chats.`);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
