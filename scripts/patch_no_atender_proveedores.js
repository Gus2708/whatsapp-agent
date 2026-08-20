// patch_no_atender_proveedores.js
// Perucho es un bot de VENTAS, pero el WhatsApp de la tienda tambien se usa para pedirle
// a los proveedores. El 2026-08-19 la tienda emitio la compra #38 a BELMENY GROUP C.A
// (21:34) y el sistema del proveedor confirmo el pedido a las 21:40; Perucho le contesto
// "¡Pedido procesado correctamente! Total registrado: $727.28 ... ¿con quien tengo el
// gusto?" — es decir, le hablo a un proveedor como si le estuviera comprando a la tienda.
//
// No se puede detectar al proveedor por telefono: de los 37 en la tabla `proveedores`
// ninguno tiene numero usable (uno solo trae el literal "TEST"), y los chat_id llegan
// como @lid, que oculta el numero real.
//
// Fix: marca por chat en chat_sessions.no_atender (columna nueva, ver migracion
// chat_sessions_no_atender). Es ORTOGONAL a `estado` a proposito: 'manual' se reactiva
// solo a los 30 min y "Detectar Handoff Empleado" lo reescribe, asi que marcar al
// proveedor como 'manual' lo dejaria desprotegido. Ningun otro camino toca esta columna.
//
//   Check Chat Session   -> lee y propaga no_atender
//   Is Manual Handover?  -> ahora enruta a silencio si estado='manual' O no_atender=true
const fs = require('fs');
const path = require('path');

const N8N_URL = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const API_KEY = process.env.N8N_API_KEY || fs.readFileSync(path.join(__dirname, '../.env'), 'utf8')
  .split('\n').find(l => l.startsWith('N8N_API_KEY='))?.split('=').slice(1).join('=').trim();
const WF_ID = 'ugHOTQv3Vb6cuTct';

// ---------- Check Chat Session ----------
const S_SELECT_VIEJO = `&select=estado,msg_count,window_start,manual_since'`;
const S_SELECT_NUEVO = `&select=estado,msg_count,window_start,manual_since,no_atender'`;

const S_ROW_VIEJO = `    if (row) {
      estado = row.estado || 'automatico';`;
const S_ROW_NUEVO = `    if (row) {
      no_atender = row.no_atender === true;
      estado = row.estado || 'automatico';`;

const S_DECL_VIEJO = `let estado = 'automatico', msg_count = 1;`;
const S_DECL_NUEVO = `let estado = 'automatico', msg_count = 1;
// Chats que el bot NO debe atender (proveedores, cuentas internas). Sticky: no se
// reactiva sola como 'manual', y los upserts de este nodo y del handoff no la pisan
// porque nunca mandan la columna.
let no_atender = false;`;

const S_RET_VIEJO = `return [{ json: { estado, msg_count, telefono } }];`;
const S_RET_NUEVO = `return [{ json: { estado, msg_count, telefono, no_atender } }];`;

// ---------- Is Manual Handover? ----------
const COND_NO_ATENDER = {
  id: 'cond_no_atender',
  leftValue: '={{ $json.no_atender }}',
  rightValue: true,
  operator: { type: 'boolean', operation: 'equals' },
};

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

  const sesion = wf.nodes.find(n => n.name === 'Check Chat Session');
  const ifNode = wf.nodes.find(n => n.name === 'Is Manual Handover?');
  if (!sesion || !ifNode) throw new Error('No encontre alguno de los dos nodos');

  if (sesion.parameters.jsCode.includes('no_atender')) {
    console.log('Ya estaba parcheado — nada que hacer.');
    return;
  }

  let code = sesion.parameters.jsCode;
  code = reemplazar(code, S_DECL_VIEJO, S_DECL_NUEVO, 'declaracion');
  code = reemplazar(code, S_SELECT_VIEJO, S_SELECT_NUEVO, 'select');
  code = reemplazar(code, S_ROW_VIEJO, S_ROW_NUEVO, 'lectura de la fila');
  code = reemplazar(code, S_RET_VIEJO, S_RET_NUEVO, 'return');
  sesion.parameters.jsCode = code;

  // El IF pasa de "estado === 'manual'" a "estado === 'manual' OR no_atender === true".
  const conds = ifNode.parameters.conditions.conditions;
  if (conds.some(c => c.id === 'cond_no_atender')) throw new Error('El IF ya tenia la condicion');
  conds.push(COND_NO_ATENDER);
  ifNode.parameters.conditions.combinator = 'or';

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
  const s = upd.nodes.find(n => n.name === 'Check Chat Session').parameters.jsCode;
  const i = upd.nodes.find(n => n.name === 'Is Manual Handover?').parameters.conditions;
  const ok = s.includes('telefono, no_atender } }]')
    && s.includes('manual_since,no_atender')
    && i.combinator === 'or'
    && i.conditions.some(c => c.id === 'cond_no_atender');
  console.log(ok ? '✓ Desplegado y verificado en el workflow vivo.' : '✗ El workflow vivo NO refleja el parche!');
  if (!ok) process.exit(1);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
