// patch_handoff_substring.js
// Arregla "Detectar Handoff Empleado", que decidia si un saliente lo escribio el bot
// con una inclusion de subcadena suelta (a.includes(b) || b.includes(a)).
//
// Efecto del bug (medido con scripts/_test_handoff.js sobre 620 mensajes reales):
//   - Empleado responde "no" o "gracias" -> se lee como mensaje del bot en 115/115 chats,
//     el chat nunca pasa a 'manual' y Perucho sigue respondiendo encima del empleado.
//     ("no" vive dentro de "u-no", "gracias" dentro de casi toda respuesta del bot.)
//   - La plantilla de Reply Non-Text no estaba en PLANTILLAS_BOT ni se registra en
//     mensajes_bot, asi que el propio bot se leia como empleado y se autosilenciaba 30 min
//     cada vez que un cliente mandaba un video o un documento.
//
// Fix: igualdad exacta, o inclusion solo cuando el texto comparado es largo (>= 40 chars)
// y por tanto inequivoco; + la plantilla de Reply Non-Text agregada a la lista.
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';
const NODE = 'Detectar Handoff Empleado';

const NONTEXT = '👨🏻‍🔧 ¡Hola! Soy *Perucho*, el bot de Ferretería El Serrucho 🪚. Solo respondo mensajes de *texto*, 🎤 *notas de voz* e 🖼️ *imágenes*. Si enviaste un video o documento, por favor escríbeme lo que necesitas 📝';

const VIEJO_PLANTILLAS = `  norm('Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚'),
].filter(Boolean);`;

const NUEVO_PLANTILLAS = `  norm('Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚'),
  norm(${JSON.stringify(NONTEXT).replace(/'/g, "\\'")}),
].filter(Boolean);

// Coincidencia INEQUIVOCA. Antes bastaba una inclusion en cualquier direccion, asi que
// una respuesta corta del empleado ("no", "si", "gracias") aparecia dentro de casi
// cualquier mensaje del bot y el relevo humano no se detectaba nunca. La inclusion solo
// se acepta si el texto contenido es largo (tolera truncado a 300 y ediciones menores).
const MIN_INCL = 40;
const coincide = (a, b) => {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) && b.length >= MIN_INCL) return true;
  if (b.includes(a) && a.length >= MIN_INCL) return true;
  return false;
};`;

const VIEJO_TPL_LOOP = `    if (ntext === tpl || ntext.includes(tpl) || tpl.includes(ntext)) { esBot = true; break; }`;
const NUEVO_TPL_LOOP = `    if (coincide(ntext, tpl)) { esBot = true; break; }`;

const VIEJO_DB_LOOP = `        if (s && (s === ntext || s.includes(ntext) || ntext.includes(s))) { esBot = true; break; }`;
const NUEVO_DB_LOOP = `        if (coincide(s, ntext)) { esBot = true; break; }`;

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

  const node = wf.nodes.find(n => n.name === NODE);
  if (!node) throw new Error(`Nodo "${NODE}" no encontrado`);

  if (node.parameters.jsCode.includes('const coincide =')) {
    console.log('Ya estaba parcheado — nada que hacer.');
    return;
  }

  // La plantilla que embebemos DEBE ser identica a la que envia Reply Non-Text,
  // o el bot se seguiria autosilenciando. Si alguien la edito, abortamos.
  const rnt = wf.nodes.find(n => n.name === 'Reply Non-Text');
  if (!rnt || !(rnt.parameters.jsonBody || '').includes(NONTEXT)) {
    throw new Error('El texto de "Reply Non-Text" cambio en el workflow vivo; actualiza NONTEXT en este script antes de desplegar.');
  }
  console.log('✓ Plantilla de Reply Non-Text verificada contra el nodo vivo.');

  let code = node.parameters.jsCode;
  code = reemplazar(code, VIEJO_PLANTILLAS, NUEVO_PLANTILLAS, 'lista de plantillas + helper');
  code = reemplazar(code, VIEJO_TPL_LOOP, NUEVO_TPL_LOOP, 'loop de plantillas');
  code = reemplazar(code, VIEJO_DB_LOOP, NUEVO_DB_LOOP, 'loop de mensajes_bot');
  node.parameters.jsCode = code;

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
  const live = upd.nodes.find(n => n.name === NODE).parameters.jsCode;
  const ok = live.includes('const coincide =')
    && live.includes('Solo respondo mensajes de')
    && !live.includes('ntext.includes(tpl)')
    && !live.includes('s.includes(ntext)');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
