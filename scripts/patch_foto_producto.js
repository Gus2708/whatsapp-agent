// Arregla la identificación de productos por FOTO enviada por el cliente:
// 1) El prompt de visión (nodo "Transcribir Nota de Voz", rama isImage) pedía una
//    descripción demasiado genérica (3 oraciones, sin pedir marca/instalación/certeza).
// 2) El AI Agent no tenía ninguna regla para cuando esa descripción es débil: terminaba
//    listando toda la categoría ("Inodoro Firenze", "Inodoro Coronet"...) como si fuera
//    lo que el cliente pidió, en vez de escalar a un empleado que sí ve la foto real.
// Idempotente (igual que el resto de scripts/patch_*.js).
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

const VISION_OLD = "text: 'Eres el asistente de una ferretería venezolana llamada El Serrucho. Analiza esta imagen. Si muestra un producto de ferretería, construcción, plomería, electricidad o herramientas, identifícalo con nombre, medida y características visibles. Si es una lista de materiales o presupuesto escrito, léela completa. Si es algo diferente, descríbelo brevemente. Responde en español, conciso y directo, máximo 3 oraciones.'";
const VISION_NEW = "text: 'Eres el asistente de una ferretería venezolana llamada El Serrucho. Analiza esta imagen con el objetivo de identificar EXACTAMENTE qué producto es. Si muestra un producto de ferretería, construcción, plomería, electricidad o herramientas, menciona: tipo de producto, marca o texto visible en etiquetas/empaque/loza (transcribe el texto si se alcanza a leer), color, medida si es visible, y el tipo de instalación si aplica (pared, piso, empotrado, sobreponer). Si NO logras leer con certeza la marca, el modelo o algún detalle clave, dilo explícitamente (ej. \\'no logro leer la marca con claridad\\', \\'no se distingue si es de pared o de piso\\'). Si es una lista de materiales o presupuesto escrito, léela completa y textual. Si es algo diferente a ferretería, descríbelo brevemente. Responde en español, conciso y directo, máximo 4 oraciones.'";

const MAXTOK_OLD = 'max_tokens: 300,';
const MAXTOK_NEW = 'max_tokens: 450,';

const SM_ANCHOR = '- FOTOS: si el cliente pide fotos de un producto, NO uses [PEDIR_AYUDA] por eso: explícale amablemente que por este canal no manejas fotos y ofrécele en su lugar la descripción exacta, el precio y la disponibilidad (busca el producto si hace falta). SOLO si el cliente insiste en que necesita verlo en foto, emite [PEDIR_AYUDA] para que un empleado se la envíe.';
const SM_NEW_BULLET = '- CLIENTE ENVÍA UNA FOTO (identificar un producto): si el mensaje te llega como "[Imagen del cliente]: <descripción>", es la lectura automática de una foto que mandó el cliente; tú NO ves la imagen real, solo esa descripción, que puede quedarse corta en detalles finos (marca exacta, texto de una etiqueta, si es de pared o de piso/mesón). Busca con buscar_productos usando esa descripción tal cual. Si el resultado calza con un modelo/medida/marca específico de la descripción, ofrécelo normal. Pero si buscar_productos solo te devuelve una lista amplia de la categoría (varios modelos/marcas sin que ninguno calce con un detalle distintivo de la foto), o la descripción de la imagen dice que no se pudo leer algo con certeza, NO los presentes como "esto es lo que encontré parecido": es más honesto decir que por foto no puedes confirmar el modelo exacto y responder SOLO [PEDIR_AYUDA] para que un empleado compare la foto real con el catálogo.';

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const log = [];

  const img = wf.nodes.find(n => n.name === 'Transcribir Nota de Voz');
  if (!img) { console.log('ANCHOR NO ENCONTRADO: nodo Transcribir Nota de Voz'); process.exit(1); }
  let c = img.parameters.jsCode;
  if (c.includes('identificar EXACTAMENTE qué producto es')) { log.push('vision prompt: ya'); }
  else if (c.includes(VISION_OLD)) { c = c.replace(VISION_OLD, VISION_NEW); log.push('vision prompt: OK'); }
  else { log.push('vision prompt: ANCHOR NO ENCONTRADO'); }
  if (c.includes(MAXTOK_NEW)) { log.push('max_tokens: ya'); }
  else if (c.includes(MAXTOK_OLD)) { c = c.replace(MAXTOK_OLD, MAXTOK_NEW); log.push('max_tokens: OK'); }
  else { log.push('max_tokens: ANCHOR NO ENCONTRADO'); }
  img.parameters.jsCode = c;

  const ai = wf.nodes.find(n => n.name === 'AI Agent');
  if (!ai) { console.log('ANCHOR NO ENCONTRADO: nodo AI Agent'); process.exit(1); }
  let sm = ai.parameters.options.systemMessage;
  if (sm.includes('CLIENTE ENVÍA UNA FOTO (identificar un producto)')) { log.push('systemMessage: ya'); }
  else if (sm.includes(SM_ANCHOR)) { sm = sm.replace(SM_ANCHOR, SM_ANCHOR + '\n' + SM_NEW_BULLET); log.push('systemMessage: OK'); }
  else { log.push('systemMessage: ANCHOR NO ENCONTRADO'); }
  ai.parameters.options.systemMessage = sm;

  console.log(log.join('\n'));
  if (log.some(l => l.includes('ANCHOR NO ENCONTRADO'))) { console.log('Aborto: anchor faltante'); process.exit(1); }
  if (log.every(l => l.includes('ya'))) { console.log('Sin cambios.'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status, put.ok ? 'OK' : await put.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
