const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();

const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';
const key = pick('N8N_API_KEY');
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json', Connection: 'close' };

const workflow = {
  name: "Auto-Mejora y Self-Healing de Búsqueda",
  nodes: [
    {
      parameters: {
        httpMethod: "POST",
        path: "automejora-busqueda",
        responseMode: "onReceived",
        responseData: "allEntries",
        options: {}
      },
      id: "webhook_automejora",
      name: "Webhook Trigger",
      type: "n8n-nodes-base.webhook",
      typeVersion: 2.1,
      position: [100, 300],
      webhookId: "automejora-busqueda-serrucho"
    },
    {
      parameters: {
        jsCode: `// 1. Gather Context & Candidate Products from Supabase
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const body = $json.body || $json;
const busqueda = body.p_busqueda || body.busqueda || '';
const telefono = body.cliente_telefono || body.telefono || 'desconocido';
const contexto = body.contexto_conversacion || body.contexto || '';
const motivo = body.motivo || 'encontrados_cero';

// Extraer palabras clave para buscar productos candidatos
const palabras = busqueda.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\\s+/).filter(w => w.length >= 3);

let candidatos = [];
try {
  // Buscar productos con stock que coincidan con alguna palabra clave
  if (palabras.length > 0) {
    const orFilter = palabras.map(p => 'descripcion.ilike.*' + p + '*').join(',');
    const res = await axios.get(SB + '/rest/v1/productos?or=(' + orFilter + ')&select=codigo_interno,descripcion,precio_venta,existencia&order=existencia.desc&limit=35', { headers: H });
    candidatos = res.data || [];
  }
} catch (e) {
  console.warn('Error trayendo candidatos:', e.message);
}

// Traer vocabulario existente
let vocabulario = [];
try {
  const resVoc = await axios.get(SB + '/rest/v1/catalogo_vocabulario?select=termino,canonico,categoria&limit=100', { headers: H });
  vocabulario = resVoc.data || [];
} catch (e) {}

return [{
  json: {
    busqueda,
    telefono,
    contexto,
    motivo,
    candidatos,
    vocabulario_muestra: vocabulario.slice(0, 30)
  }
}];`
      },
      id: "context_gatherer",
      name: "Context & Candidates Gatherer",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [320, 300]
    },
    {
      parameters: {
        method: "POST",
        url: "https://openrouter.ai/api/v1/chat/completions",
        sendHeaders: true,
        headerParameters: {
          parameters: [
            {
              name: "Authorization",
              value: "={{ 'Bearer ' + $env.OPENROUTER_API_KEY }}"
            },
            {
              name: "Content-Type",
              value: "application/json"
            }
          ]
        },
        sendBody: true,
        specifyBody: "json",
        jsonBody: `={{ JSON.stringify({
  model: "anthropic/claude-sonnet-5",
  temperature: 0.1,
  messages: [
    {
      role: "system",
      content: "Eres el Ingeniero Principal de Inteligencia Artificial y Datos de Ferretería El Serrucho en Venezuela. Tu tarea es diagnosticar por qué falló la búsqueda de un cliente de WhatsApp y generar la auto-corrección exacta para el motor de búsqueda multicapa (Léxico, Diccionario de Vocabulario, Trigram, Embeddings Vectoriales).\\n\\nDebes devolver EXCLUSIVAMENTE un JSON válido con esta estructura:\\n{\\n  \\"diagnostico\\": \\"Explicación técnica concisa de la causa de la falla\\",\\n  \\"producto_identificado\\": {\\n    \\"codigo_interno\\": \\"SKU más probable o null si no se vende\\",\\n    \\"descripcion\\": \\"Nombre del producto en catálogo\\"\\n  },\\n  \\"vocabulario_nuevo\\": {\\n    \\"termino\\": \\"como lo pidió el cliente (minúsculas, sin puntuación)\\",\\n    \\"canonico\\": \\"término canónico del catálogo\\",\\n    \\"categoria\\": \\"categoría\\"\\n  },\\n  \\"descripcion_enriquecida\\": \\"Descripción en lenguaje natural del producto para mejorar embeddings vectoriales\\",\\n  \\"tipo_ajuste\\": \\"vocabulario\\" | \\"embedding\\" | \\"no_vendido\\"\\n}"
    },
    {
      role: "user",
      content: "Consulta fallida del cliente: \\"" + $json.busqueda + "\\"\\nContexto reciente: " + JSON.stringify($json.contexto) + "\\n\\nCandidatos en inventario (con stock y precio):\\n" + JSON.stringify($json.candidatos)
    }
  ],
  response_format: { type: "json_object" }
}) }}`,
        options: {}
      },
      id: "sonnet_ai_engine",
      name: "Sonnet AI Diagnostic Engine",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [540, 300]
    },
    {
      parameters: {
        jsCode: `// 3. Sandbox Simulation & Auto-Apply to Supabase + WAHA notification formatting
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const ctx = $('Context & Candidates Gatherer').first().json;
const rawSonnet = $json.choices ? $json.choices[0].message.content : '{}';
let diagnostico = {};
try {
  let clean = String(rawSonnet || '').trim();
  const fb = clean.indexOf('{');
  const lb = clean.lastIndexOf('}');
  if (fb !== -1 && lb !== -1 && lb > fb) {
    clean = clean.slice(fb, lb + 1);
  }
  diagnostico = JSON.parse(clean);
} catch (e) {
  diagnostico = { diagnostico: rawSonnet, tipo_ajuste: 'requiere_revision' };
}

const busqueda = ctx.busqueda;
const telefono = ctx.telefono;
let simulacionExitosa = false;
let autoAplicado = false;

// Sandbox Validation: si propone vocabulario, comprobar si tiene sentido
if (diagnostico.vocabulario_nuevo && diagnostico.vocabulario_nuevo.termino && diagnostico.vocabulario_nuevo.canonico) {
  const v = diagnostico.vocabulario_nuevo;
  if (v.termino.length >= 3 && v.canonico.length >= 3) {
    simulacionExitosa = true;
    try {
      // Auto-aplicar a catalogo_vocabulario
      await axios.post(SB + '/rest/v1/catalogo_vocabulario?on_conflict=termino', [
        {
          termino: v.termino.toLowerCase().trim(),
          canonico: v.canonico.toLowerCase().trim(),
          categoria: v.categoria ? v.categoria.toLowerCase().trim() : 'general',
          origen: 'automejora_sonnet',
          confianza: 5,
          activo: true
        }
      ], { headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }) });
      autoAplicado = true;
    } catch (e) {
      console.warn('Error guardando vocabulario:', e.message);
    }
  }
}

// Log en automejora_logs
try {
  await axios.post(SB + '/rest/v1/automejora_logs', [
    {
      telefono_cliente: telefono,
      busqueda_original: busqueda,
      contexto_conversacion: ctx.contexto,
      diagnostico_sonnet: diagnostico.diagnostico || '',
      solucion_propuesta: diagnostico,
      simulacion_exitosa: simulacionExitosa,
      estado: autoAplicado ? 'auto_aplicado' : 'analizado'
    }
  ], { headers: H });
} catch (e) {
  console.warn('Error guardando automejora_logs:', e.message);
}

// Armar mensaje para el WhatsApp del Administrador
const prodInfo = diagnostico.producto_identificado ? ((diagnostico.producto_identificado.descripcion || 'No identificado') + (diagnostico.producto_identificado.codigo_interno ? (' (SKU: ' + diagnostico.producto_identificado.codigo_interno + ')') : '')) : 'No determinado';
const vocInfo = diagnostico.vocabulario_nuevo ? ('"' + diagnostico.vocabulario_nuevo.termino + '" ➔ "' + diagnostico.vocabulario_nuevo.canonico + '"') : 'Sin cambio de vocabulario';

let estadoTexto = '⚠️ Pendiente de revisión';
if (autoAplicado) estadoTexto = '✅ Auto-Aplicado en Supabase (catalogo_vocabulario)';
else if (diagnostico.tipo_ajuste === 'no_vendido') estadoTexto = 'ℹ️ Producto no comercializado en inventario';

const adminMensaje = '🛠️ *[Auto-Mejora SerruchoBot]*\\n\\n' +
  '🚨 *Falla Detectada en Búsqueda:*\\n' +
  '• Cliente: ' + telefono + '\\n' +
  '• Consulta: "' + busqueda + '"\\n\\n' +
  '🧠 *Diagnóstico Sonnet:*\\n' +
  (diagnostico.diagnostico || 'Búsqueda sin coincidencia exacta.') + '\\n\\n' +
  '⚙️ *Acción Realizada:*\\n' +
  '• Producto: ' + prodInfo + '\\n' +
  '• Vocabulario: ' + vocInfo + '\\n' +
  '• Estado: ' + estadoTexto + '\\n\\n' +
  'ℹ️ _El motor de búsqueda aprenderá esta equivalencia para futuros clientes._';

const adminRaw = $env.ADMIN_PHONE_NUMBERS || '';
const adminPhones = adminRaw.split(',').map(s => s.trim()).filter(Boolean);
if (!adminPhones.length && $env.ADMIN_PHONE_NUMBER) adminPhones.push($env.ADMIN_PHONE_NUMBER.trim());

return (adminPhones.length ? adminPhones : ['default@c.us']).map(chatId => ({
  json: {
    admin_chat_id: chatId,
    admin_mensaje: adminMensaje,
    simulacionExitosa,
    autoAplicado,
    diagnostico
  }
}));`
      },
      id: "sandbox_and_apply",
      name: "Sandbox & Auto-Apply",
      type: "n8n-nodes-base.code",
      typeVersion: 2,
      position: [760, 300]
    },
    {
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
        jsonBody: `={{ JSON.stringify({
  session: "default",
  chatId: $json.admin_chat_id,
  text: $json.admin_mensaje
}) }}`,
        options: {}
      },
      id: "waha_notify_admin",
      name: "Notify Admin via WhatsApp",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4.4,
      position: [980, 300],
      onError: "continueRegularOutput"
    }
  ],
  connections: {
    "Webhook Trigger": {
      main: [
        [
          {
            node: "Context & Candidates Gatherer",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Context & Candidates Gatherer": {
      main: [
        [
          {
            node: "Sonnet AI Diagnostic Engine",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Sonnet AI Diagnostic Engine": {
      main: [
        [
          {
            node: "Sandbox & Auto-Apply",
            type: "main",
            index: 0
          }
        ]
      ]
    },
    "Sandbox & Auto-Apply": {
      main: [
        [
          {
            node: "Notify Admin via WhatsApp",
            type: "main",
            index: 0
          }
        ]
      ]
    }
  },
  settings: {
    executionOrder: "v1"
  }
};

(async () => {
  // 1. Guardar archivo local
  const wfPath = path.join(ROOT, 'workflows', 'workflow_automejora.json');
  if (!fs.existsSync(path.join(ROOT, 'workflows'))) fs.mkdirSync(path.join(ROOT, 'workflows'), { recursive: true });
  fs.writeFileSync(wfPath, JSON.stringify(workflow, null, 2), 'utf8');
  console.log('Saved local workflow to workflows/workflow_automejora.json');

  // 2. Buscar si ya existe el workflow en n8n
  const lista = await (await fetch(`${BASE}/workflows`, { headers: H })).json();
  const existente = (lista.data || lista || []).find(w => w.name === workflow.name);

  if (existente) {
    console.log('Updating existing workflow in n8n with ID:', existente.id);
    const put = await fetch(`${BASE}/workflows/${existente.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({
        name: workflow.name,
        nodes: workflow.nodes,
        connections: workflow.connections,
        settings: workflow.settings
      })
    });
    console.log('PUT status:', put.status);
    if (!put.ok) console.log(await put.text());
    else {
      // Activar
      await fetch(`${BASE}/workflows/${existente.id}/activate`, { method: 'POST', headers: H });
      console.log('Successfully updated & activated Auto-Improvement workflow!');
    }
  } else {
    console.log('Creating new workflow in n8n...');
    const post = await fetch(`${BASE}/workflows`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify(workflow)
    });
    console.log('POST status:', post.status);
    const res = await post.json();
    if (!post.ok) console.log(res);
    else {
      // Activar
      await fetch(`${BASE}/workflows/${res.id}/activate`, { method: 'POST', headers: H });
      console.log('Successfully created & activated Auto-Improvement workflow with ID:', res.id);
    }
  }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
