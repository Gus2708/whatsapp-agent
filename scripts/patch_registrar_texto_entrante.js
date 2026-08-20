// patch_registrar_texto_entrante.js
// Registra el TEXTO de los mensajes entrantes del cliente en mensajes_procesados.
//
// Hasta ahora solo existia mensajes_bot (lo que RESPONDE el bot); del cliente se guardaba
// unicamente message_id/chat_id para dedup. Es decir: se podia auditar el monologo del bot
// pero no que le preguntaron. Esto lo arregla sin cambiar ningun comportamiento del flujo.
//
// 1) "Filtro Anti-Duplicado": agrega texto+tipo al INSERT que ya hace de candado de dedup.
//    Un solo write, cero llamadas nuevas. La compuerta de frescura queda intacta: los
//    mensajes viejos siguen SIN insertarse, para no envenenar el dedup del catchup.
// 2) "Transcribir Nota de Voz": completa con PATCH el texto de notas de voz e imagenes,
//    que en el paso 1 todavia no eran texto.
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';

// ---------- 1. Filtro Anti-Duplicado ----------
const F_VIEJO = `  // Dedup por ID de mensaje: nunca responder dos veces el mismo mensaje.
  if (msgId) {
    try {
      const r = await axios.post(SB + '/rest/v1/mensajes_procesados', { message_id: String(msgId), chat_id: chatId }, { headers: H });`;

const F_NUEVO = `  // Texto del cliente, para poder auditar la conversacion completa despues (mensajes_bot
  // solo guarda el lado del bot). En notas de voz e imagenes el body todavia NO es texto:
  // lo rellena por PATCH el nodo "Transcribir Nota de Voz", que corre justo despues.
  const mime = ((payload.media && payload.media.mimetype) || '').toLowerCase();
  const msgType = (payload.type || '').toLowerCase();
  const esAudio = payload.hasMedia === true && (mime.includes('audio') || msgType === 'ptt' || msgType === 'audio');
  const esImagen = payload.hasMedia === true && mime.includes('image/');
  const tipo = esAudio ? 'ptt' : esImagen ? 'image' : (payload.hasMedia === true ? 'otro' : 'texto');
  let texto = typeof payload.body === 'string' ? payload.body : '';
  if (texto.startsWith('data:')) texto = ''; // media en base64, no es texto
  texto = texto.slice(0, 4000) || null;
  // Dedup por ID de mensaje: nunca responder dos veces el mismo mensaje.
  if (msgId) {
    try {
      const r = await axios.post(SB + '/rest/v1/mensajes_procesados', { message_id: String(msgId), chat_id: chatId, texto, tipo }, { headers: H });`;

// ---------- 2. Transcribir Nota de Voz ----------
const T_VIEJO = `if (!resultText) { return [$input.first()]; }

const modified = JSON.parse(JSON.stringify(item));`;

const T_NUEVO = `// Completar el registro del entrante: al pasar por "Filtro Anti-Duplicado" esto era
// media sin texto. Ahora si hay transcripcion (voz) o descripcion (foto), se guarda.
try {
  const _id = payload.id || wBody.id || null;
  if (_id && resultText) {
    const _SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
    const _ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
    await axios.patch(
      _SB + '/rest/v1/mensajes_procesados?message_id=eq.' + encodeURIComponent(String(_id)),
      { texto: String(resultText).slice(0, 4000), tipo: isImage ? 'image' : 'ptt' },
      { headers: { apikey: _ANON, Authorization: 'Bearer ' + _ANON, 'Content-Type': 'application/json' }, timeout: 3000 }
    );
  }
} catch (e) {}

if (!resultText) { return [$input.first()]; }

const modified = JSON.parse(JSON.stringify(item));`;

function reemplazar(code, viejo, nuevo, etiqueta) {
  const n = code.split(viejo).length - 1;
  if (n !== 1) throw new Error(`"${etiqueta}": esperaba 1 coincidencia, encontre ${n}. Aborto sin tocar nada.`);
  return code.replace(viejo, nuevo);
}

(async () => {
  if (!API_KEY) throw new Error('N8N_API_KEY no esta en .env');
  const H = { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json' };

  const res = await fetch(`${N8N_URL}/workflows/${WF_ID}`, { headers: H });
  if (!res.ok) throw new Error(`GET fallo: ${res.status} ${await res.text()}`);
  const wf = await res.json();

  const filtro = wf.nodes.find(n => n.name === 'Filtro Anti-Duplicado');
  const trans = wf.nodes.find(n => n.name === 'Transcribir Nota de Voz');
  if (!filtro || !trans) throw new Error('No encontre alguno de los dos nodos');

  if (filtro.parameters.jsCode.includes('chat_id: chatId, texto, tipo')) {
    console.log('Ya estaba parcheado — nada que hacer.');
    return;
  }

  filtro.parameters.jsCode = reemplazar(filtro.parameters.jsCode, F_VIEJO, F_NUEVO, 'insert de dedup');
  trans.parameters.jsCode = reemplazar(trans.parameters.jsCode, T_VIEJO, T_NUEVO, 'patch post-transcripcion');

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
  const f = upd.nodes.find(n => n.name === 'Filtro Anti-Duplicado').parameters.jsCode;
  const t = upd.nodes.find(n => n.name === 'Transcribir Nota de Voz').parameters.jsCode;
  const ok = f.includes('chat_id: chatId, texto, tipo')
    && f.includes("if (!catchup && ageSec > GATE) { continue; }")   // compuerta intacta
    && t.includes('mensajes_procesados?message_id=eq.');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
