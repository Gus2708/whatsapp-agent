const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';
const key = pick('N8N_API_KEY');
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json', Connection: 'close' };

const wfPath = path.join(ROOT, 'n8n_workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// Código del procesador de comandos Admin
const adminCode = `// Procesador de Comandos de Administrador (/feedback, /corregir, /status)
const axios = require('axios');
const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || (typeof process !== 'undefined' && process.env.SUPABASE_URL) || '';
const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || (typeof process !== 'undefined' && process.env.SUPABASE_ANON_KEY) || '';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const sender = ($json.body.payload ? $json.body.payload.from : $json.body.from) || '';
const text = ($json.body.payload ? ($json.body.payload.body || $json.body.payload.caption || '') : ($json.body.body || '')) || '';
const trimmed = text.trim();

let reply = '';

try {
  const isStatus = /^\\/(status|estado|tasa|ayuda|help)\\b/i.test(trimmed);
  const match = trimmed.match(/^\\/(?:feedback|corregir|aprender)\\s+([a-zA-Z0-9_\\-]+)(?:\\s+(.+))?$/i);

  if (isStatus) {
    let tasa = 'N/A';
    try {
      const resT = await axios.get(SB + '/rest/v1/tazas?id=eq.1&select=monto', { headers: H });
      if (resT.data && resT.data[0]) tasa = resT.data[0].monto;
    } catch (e) {}

    let ultimosFallos = [];
    try {
      const resF = await axios.get(SB + '/rest/v1/automejora_logs?order=creado_en.desc&limit=3&select=consulta,estado', { headers: H });
      ultimosFallos = resF.data || [];
    } catch (e) {}

    reply = '📊 *[Estado del Sistema - SerruchoBot]*\\n\\n' +
      '💵 *Tasa BCV:* ' + tasa + ' Bs/$\\n' +
      '🤖 *Motor:* GPT-5.6 Luna / Claude Sonnet 5\\n\\n' +
      '🚨 *Últimas Búsquedas con Falla:*\\n' +
      (ultimosFallos.length > 0
        ? ultimosFallos.map((f, i) => (i + 1) + '. "' + f.consulta + '" (' + (f.estado || 'sin_resolver') + ')').join('\\n')
        : '• Ninguna falla reciente registrada.') +
      '\\n\\n💡 *Comandos disponibles:*\\n' +
      '• \`/feedback <SKU> <consulta>\` ➔ Vincula un producto a una búsqueda.\\n' +
      '• \`/feedback <SKU>\` ➔ Vincula al último cliente con falla.';
  } else if (match) {
    const sku = match[1].trim();
    let consulta = (match[2] || '').trim();
    let logId = null;

    if (!consulta) {
      try {
        const resLog = await axios.get(SB + '/rest/v1/automejora_logs?order=creado_en.desc&limit=1', { headers: H });
        if (resLog.data && resLog.data[0]) {
          consulta = resLog.data[0].consulta || '';
          logId = resLog.data[0].id;
        }
      } catch (e) {}
    }

    if (!consulta) {
      reply = '⚠️ No se encontró una búsqueda reciente para asociar al SKU *' + sku + '*. Indica la consulta completa:\\n\\nEjemplo:\\n\`/feedback ' + sku + ' nombre del producto que pidio el cliente\`';
    } else {
      let prod = null;
      try {
        const resP = await axios.get(SB + '/rest/v1/productos?or=(codigo_interno.eq.' + encodeURIComponent(sku) + ',codigo_barras.eq.' + encodeURIComponent(sku) + ')&select=*', { headers: H });
        if (resP.data && resP.data[0]) prod = resP.data[0];
      } catch (e) {}

      if (!prod) {
        reply = '❌ No se encontró ningún producto con SKU *' + sku + '* en Supabase. Verifica el código e intenta nuevamente.';
      } else {
        // Upsert en catalogo_vocabulario con maxima confianza (10)
        try {
          const payloadVoc = {
            termino: consulta.toLowerCase().trim(),
            canonico: prod.descripcion.toLowerCase().trim(),
            categoria: 'feedback_admin_whatsapp',
            origen: 'admin_whatsapp',
            confianza: 10,
            activo: true
          };
          await axios.post(SB + '/rest/v1/catalogo_vocabulario', payloadVoc, {
            headers: { ...H, Prefer: 'resolution=merge-duplicates' }
          });
        } catch (eVoc) {}

        // Actualizar automejora_logs
        if (logId) {
          try {
            await axios.patch(SB + '/rest/v1/automejora_logs?id=eq.' + logId, {
              estado: 'corregido_por_admin',
              solucion_propuesta: {
                sku_corregido: prod.codigo_interno,
                descripcion: prod.descripcion,
                origen: 'admin_whatsapp_command'
              }
            }, { headers: H });
          } catch (eLog) {}
        }

        reply = '🛠️ *[Feedback Aplicado por Admin]*\\n\\n' +
          '✅ *Producto Vinculado:*\\n' +
          '• SKU: *' + prod.codigo_interno + '*\\n' +
          '• Descripción: ' + prod.descripcion + '\\n' +
          '• Precio: $' + prod.precio_venta + ' | Stock: ' + prod.existencia + ' unid.\\n\\n' +
          '📝 *Regla de Búsqueda Aprendida:*\\n' +
          '• Consulta: "' + consulta + '"\\n' +
          '• Equivalencia: "' + prod.descripcion.toLowerCase() + '"\\n' +
          '• Confianza: 10/10 ⭐ (Prioridad Máxima Admin)\\n\\n' +
          'El motor de búsqueda ya responderá automáticamente con este producto. 🪚';
      }
    }
  } else {
    reply = '⚠️ Comando no reconocido. Usa \`/feedback <SKU> [consulta]\` o \`/status\`.';
  }
} catch (err) {
  reply = '❌ Error procesando feedback: ' + err.message;
}

return [{
  json: {
    sender,
    reply,
    session: 'default'
  }
}];`;

// Eliminar nodos anteriores si ya existían para evitar duplicados
wf.nodes = wf.nodes.filter(n => !['¿Es Comando Admin?', 'Procesar Comando Admin', 'Send Admin Reply'].includes(n.name));

// 1. Nodo IF: ¿Es Comando Admin?
const ifAdminNode = {
  parameters: {
    conditions: {
      options: {
        caseSensitive: true,
        leftValue: "",
        typeValidation: "loose",
        version: 2
      },
      combinator: "and",
      conditions: [
        {
          id: "is_admin_check",
          leftValue: "={{ ((typeof $env !== 'undefined' && $env.ADMIN_PHONE_NUMBERS) || '').split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean).some(adm => (($json.body.payload ? $json.body.payload.from : $json.body.from) || '').replace(/[^0-9]/g, '').endsWith(adm)) && (($json.body.payload ? ($json.body.payload.body || '') : ($json.body.body || '')).trim().startsWith('/')) }}",
          operator: {
            type: "boolean",
            operation: "true",
            singleValue: true
          },
          rightValue: ""
        }
      ]
    }
  },
  id: "if_admin_node",
  name: "¿Es Comando Admin?",
  type: "n8n-nodes-base.if",
  typeVersion: 2.3,
  position: [ 260, 480 ]
};

// 2. Nodo Code: Procesar Comando Admin
const codeAdminNode = {
  parameters: {
    jsCode: adminCode
  },
  id: "process_admin_command_node",
  name: "Procesar Comando Admin",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [ 480, 560 ],
  onError: "continueRegularOutput"
};

// 3. Nodo HTTP: Send Admin Reply
const sendAdminReplyNode = {
  parameters: {
    method: "POST",
    url: "http://waha_serrucho:3000/api/sendText",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        {
          name: "X-API-Key",
          value: "={{ $env.WAHA_API_KEY }}"
        }
      ]
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify({ session: 'default', chatId: $json.sender, text: $json.reply }) }}",
    options: {}
  },
  id: "send_admin_reply_node",
  name: "Send Admin Reply",
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.4,
  position: [ 700, 560 ],
  onError: "continueRegularOutput"
};

wf.nodes.push(ifAdminNode, codeAdminNode, sendAdminReplyNode);

// Actualizar conexiones
// ¿Mensaje Saliente? [FALSE] (1) -> ¿Es Comando Admin?
wf.connections["¿Mensaje Saliente?"] = {
  main: [
    [
      { node: "Detectar Handoff Empleado", type: "main", index: 0 }
    ],
    [
      { node: "¿Es Comando Admin?", type: "main", index: 0 }
    ]
  ]
};

// ¿Es Comando Admin?
// [TRUE] (0) -> Procesar Comando Admin -> Send Admin Reply
// [FALSE] (1) -> Es Cliente Real?
wf.connections["¿Es Comando Admin?"] = {
  main: [
    [
      { node: "Procesar Comando Admin", type: "main", index: 0 }
    ],
    [
      { node: "Es Cliente Real?", type: "main", index: 0 }
    ]
  ]
};

wf.connections["Procesar Comando Admin"] = {
  main: [
    [
      { node: "Send Admin Reply", type: "main", index: 0 }
    ]
  ]
};

fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2), 'utf8');
console.log('Saved patched n8n_workflow.json with WhatsApp Admin Feedback capability.');

(async () => {
  const lista = await (await fetch(`${BASE}/workflows`, { headers: H })).json();
  const targetWf = (lista.data || lista || []).find(w => w.name === wf.name || w.id === wf.id);
  const wfId = targetWf ? targetWf.id : 'ugHOTQv3Vb6cuTct';

  console.log('Updating live workflow in n8n with ID:', wfId);
  const put = await fetch(`${BASE}/workflows/${wfId}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({
      name: wf.name,
      nodes: wf.nodes,
      connections: wf.connections,
      settings: { executionOrder: "v1" }
    })
  });
  console.log('PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('Admin WhatsApp Feedback successfully deployed to live n8n!');
})().catch(e => { console.error('Error deploying:', e.message); process.exit(1); });
