// patch_captura_nombre.js
// El bot preguntaba "¿con quien tengo el gusto?" en 180 de 621 mensajes (29% de todo lo que
// dice) y solo capturaba 6 nombres en 115 chats (5%). Peor caso medido: 15 preguntas en 19
// mensajes. Causa: el regex de "Cliente Memoria" exige un preambulo ("me llamo X", "soy X"),
// pero a esa pregunta la gente responde "Pedro", a secas. Como el nombre nunca se guardaba,
// nombre_guardado seguia en 'desconocido' y el prompt ordenaba pedirlo otra vez, sin fin.
//
// Fix, en tres partes:
//   (b) aceptar la respuesta corta cuando el bot ACABA de preguntar   <- el arreglo de fondo
//   (c) adoptar el pushName de WhatsApp si parece un nombre de verdad
//   ( ) devolver pedir_nombre=no tras 2 intentos, para que el prompt corte solo
// Falso positivo evitado: si el cliente responde con un producto ("cemento gris"), se
// descarta contra catalogo_vocabulario (3.573 terminos coloquiales del catalogo).
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';

// String.raw: el codigo lleva regex con \s y no debe interpretarse como escape.
const NUEVO_CODIGO = String.raw`// Nodo de codigo "Cliente Memoria": recall determinista + guardado automatico del nombre.
// Corre en el flujo principal antes del AI Agent. Nunca rompe el flujo (todo en try/catch).
//
// 2026-08-20: el bot pedia el nombre en el 29% de sus mensajes y solo lo capturaba el 5% de
// las veces, porque el regex de abajo exige preambulo ("me llamo X") y a "¿con quien tengo el
// gusto?" la gente responde "Pedro". Sin nombre guardado, el prompt lo volvia a pedir, sin fin.
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
const PREGUNTA = 'con quién tengo el gusto';
const MAX_PREGUNTAS = 2;

let telefono = null, mensaje = '', nombre = null, notas = null, pushName = null;
try {
  const p = $('Transcribir Nota de Voz').first().json.body.payload;
  telefono = p && p.from;
  mensaje = (p && p.body) || '';
  pushName = (p && p._data && p._data.pushName) || (p && p.notifyName) || (p && p.pushName) || null;
} catch (e) {}

// 1) Cargar memoria existente (recall)
try {
  if (telefono) {
    const r = await axios.get(SB + '/rest/v1/clientes_chat?telefono=eq.' + encodeURIComponent(telefono) + '&select=nombre,notas', { headers: H });
    if (r.data && r.data[0]) { nombre = r.data[0].nombre || null; notas = r.data[0].notas || null; }
  }
} catch (e) {}

// 1b) ¿Cuantas veces le pedimos ya el nombre, y fue lo ultimo que dijimos?
let vecesPedido = 0, acabaDePreguntar = false;
try {
  if (telefono && !nombre) {
    const r = await axios.get(SB + '/rest/v1/mensajes_bot?chat_id=eq.' + encodeURIComponent(telefono) + '&select=texto_norm&order=created_at.desc&limit=20', { headers: H });
    const filas = (r.data || []).map(x => x.texto_norm || '');
    vecesPedido = filas.filter(t => t.includes(PREGUNTA)).length;
    acabaDePreguntar = !!filas[0] && filas[0].includes(PREGUNTA);
  }
} catch (e) {}

// Palabras que NUNCA son un nombre (saludos, muletillas, roles genericos).
const STOP = ['si','no','ok','ya','hola','buenas','buenos','dias','tardes','noches','gracias','nada','todo','bueno','buena','señor','señora','amigo','amiga','jefe','dios','empresa','cliente','casa','tienda','ferreteria','mama','papa','cuanto','cuanta','precio','precios','necesito','quiero','busco','tengo','estoy','ando','voy','dame','tiene','tienen','hay','disponible','me','mi','yo','el','la','de','del','para','por','con','ese','este','esa'];
function formaDeNombre(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 40) return null;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ' .]+$/.test(t)) return null; // sin digitos, emoji ni simbolos
  const w = t.replace(/[.']/g, ' ').split(' ').filter(Boolean);
  if (!w.length || w.length > 3) return null;
  for (const x of w) { if (x.length < 2 || x.length > 15) return null; }
  if (w.some(x => STOP.includes(x.toLowerCase()))) return null;
  return w.map(x => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join(' ');
}
// Un termino del catalogo no es un nombre: evita guardar "Cemento Gris" como cliente.
async function esDelCatalogo(cand) {
  try {
    const ws = cand.toLowerCase().split(' ').map(encodeURIComponent).join(',');
    const r = await axios.get(SB + '/rest/v1/catalogo_vocabulario?select=termino&limit=1&termino=in.(' + ws + ')', { headers: H });
    return Array.isArray(r.data) && r.data.length > 0;
  } catch (e) { return false; }
}

// 2) Detectar el nombre
let candidato = null;
if (telefono && !nombre && mensaje) {
  // (a) con preambulo explicito: "me llamo Pedro", "soy Pedro"
  const m = mensaje.match(/(?:me\s+llamo|mi\s+nombre\s+es|me\s+dicen|le\s+habla|habla|aqui|soy)\s+([A-Za-zÀ-ÖØ-öø-ÿ]{3,}(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]{2,})?)/i);
  if (m) candidato = formaDeNombre(m[1]);
  // (b) respuesta corta a NUESTRA pregunta: el mensaje entero es el nombre ("Pedro")
  if (!candidato && acabaDePreguntar) candidato = formaDeNombre(mensaje);
}
if (candidato && await esDelCatalogo(candidato)) candidato = null;
// (c) ultimo recurso: el pushName de WhatsApp, si parece un nombre de verdad
if (telefono && !nombre && !candidato && pushName) {
  const p = formaDeNombre(pushName);
  if (p && !(await esDelCatalogo(p))) candidato = p;
}
if (candidato) {
  nombre = candidato;
  try { await axios.post(SB + '/rest/v1/clientes_chat', { telefono, nombre, updated_at: new Date().toISOString() }, { headers: H }); } catch (e) {}
}

// 3) ¿El prompt debe pedir el nombre? No si ya lo tenemos, o si ya insistimos 2 veces.
const pedir_nombre = (nombre || vecesPedido >= MAX_PREGUNTAS) ? 'no' : 'si';

return [{ json: { cliente_nombre: nombre, cliente_notas: notas, telefono_cliente: telefono, pedir_nombre } }];`;

const TEXT_VIEJO = ` + " ||| Mensaje del cliente: "`;
const TEXT_NUEVO = ` + " | pedir_nombre=" + ($('Cliente Memoria').first().json.pedir_nombre || 'si') + " ||| Mensaje del cliente: "`;

(async () => {
  if (!API_KEY) throw new Error('N8N_API_KEY no esta en .env');
  const H = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };

  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, { headers: H });
  if (!res.ok) throw new Error(`GET fallo: ${res.status} ${await res.text()}`);
  const wf = await res.json();

  const mem = wf.nodes.find(n => n.name === 'Cliente Memoria');
  const ag = wf.nodes.find(n => n.name === 'AI Agent');
  if (!mem || !ag) throw new Error('No encontre "Cliente Memoria" o "AI Agent"');

  if (mem.parameters.jsCode.includes('pedir_nombre')) { console.log('Ya estaba parcheado.'); return; }
  // Reemplazo el nodo entero: solo si el vivo es el que audite, no una version que no vi.
  const viejo = mem.parameters.jsCode;
  if (!viejo.includes('recall determinista') || !viejo.includes('me\\s+llamo')) {
    throw new Error('"Cliente Memoria" no es la version esperada. Aborto sin tocar nada.');
  }
  mem.parameters.jsCode = NUEVO_CODIGO;

  const n = ag.parameters.text.split(TEXT_VIEJO).length - 1;
  if (n !== 1) throw new Error(`AI Agent.text: esperaba 1 coincidencia, encontre ${n}. Aborto.`);
  ag.parameters.text = ag.parameters.text.replace(TEXT_VIEJO, TEXT_NUEVO);

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings?.[k] !== undefined) cs[k] = wf.settings[k];
  if (!cs.executionOrder) cs.executionOrder = 'v1';

  const put = await fetch(`${N8N_URL}/workflows/${WF_ID}`, {
    method: 'PUT', headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs })
  });
  if (!put.ok) throw new Error(`PUT fallo: ${put.status} ${await put.text()}`);

  const upd = await put.json();
  const m2 = upd.nodes.find(x => x.name === 'Cliente Memoria').parameters.jsCode;
  const t2 = upd.nodes.find(x => x.name === 'AI Agent').parameters.text;
  const ok = m2.includes('acabaDePreguntar') && m2.includes('esDelCatalogo')
    && m2.includes('pedir_nombre') && t2.includes('pedir_nombre=');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
