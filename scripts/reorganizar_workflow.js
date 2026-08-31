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

// 1. Mapeo de Posiciones Limpias y Alineadas en Grid
const POSITIONS = {
  // --- ZONA 1: Ingesta, Seguridad & Comandos Admin (x: -240 .. 800) ---
  "Webhook Trigger": [ -200, 260 ],
  "¿Mensaje Saliente?": [ 20, 260 ],
  "Detectar Handoff Empleado": [ 240, 140 ],
  "Descartar": [ 460, 140 ],
  "¿Es Comando Admin?": [ 240, 380 ],
  "Procesar Comando Admin": [ 460, 520 ],
  "Send Admin Reply": [ 680, 520 ],
  "Es Cliente Real?": [ 460, 380 ],
  "Filtro Anti-Duplicado": [ 680, 380 ],

  // --- ZONA 2: Pre-Procesamiento, Transcripción & Sesión (x: 840 .. 2320) ---
  "Debounce Ráfaga": [ 900, 380 ],
  "Transcribir Nota de Voz": [ 1120, 380 ],
  "Is Text Message?": [ 1340, 380 ],
  "Reply Non-Text": [ 1340, 160 ],
  "Check Chat Session": [ 1560, 380 ],
  "Rate Limited?": [ 1780, 380 ],
  "Rate Limit Drop": [ 1780, 160 ],
  "Is Manual Handover?": [ 2000, 380 ],
  "Manual Handover Active": [ 2000, 160 ],
  "Cliente Memoria": [ 2220, 380 ],

  // --- ZONA 3: Agente de IA & Herramientas Especializadas (x: 2360 .. 3140) ---
  "AI Agent": [ 2460, 380 ],
  "Sanitize Agent Output": [ 2720, 380 ],
  // Sub-nodos del AI Agent
  "OpenRouter Chat Model": [ 2240, 580 ],
  "Simple Memory": [ 2380, 580 ],
  "buscar_productos_tool": [ 2520, 580 ],
  "hacer_presupuesto_tool": [ 2660, 580 ],
  "obtener_tasa_bcv_tool": [ 2800, 580 ],
  "buscar_memoria_engram_tool": [ 2520, 740 ],
  "guardar_memoria_engram_tool": [ 2660, 740 ],

  // --- ZONA 4: Enrutamiento de Salida & Despacho WAHA (x: 3180 .. 4060) ---
  "Check Escalation": [ 3240, 380 ],
  // Rama Escalación
  "Set Chat Manual": [ 3480, 200 ],
  "Send Handover Message": [ 3720, 140 ],
  "Registrar Atencion Pendiente": [ 3720, 260 ],
  // Rama Ayuda / Normal
  "Check Pedir Ayuda": [ 3480, 480 ],
  "Registrar Solicitud Ayuda": [ 3720, 420 ],
  "Send Bridge Message": [ 3940, 420 ],
  "Send Agent Response": [ 3720, 560 ]
};

// 2. Sanitizar credenciales en nodos de código
const cleanSupabaseVars = (code) => {
  if (typeof code !== 'string') return code;
  let c = code;
  c = c.replace(/const SB = '[^']+';/g, "const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';");
  c = c.replace(/const ANON = '[^']+';/g, "const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';");
  return c;
};

// 3. Aplicar posiciones y sanitización a los nodos existentes
wf.nodes.forEach(node => {
  if (POSITIONS[node.name]) {
    node.position = POSITIONS[node.name];
  }
  if (node.parameters && node.parameters.jsCode) {
    node.parameters.jsCode = cleanSupabaseVars(node.parameters.jsCode);
  }
  // En HTTP request nodes, asegurar que usen $env
  if (node.parameters && node.parameters.headerParameters && node.parameters.headerParameters.parameters) {
    node.parameters.headerParameters.parameters.forEach(p => {
      if (p.name === 'X-API-Key' && !p.value.startsWith('={{')) {
        p.value = "={{ $env.WAHA_API_KEY }}";
      }
    });
  }
});

// 4. Crear Sticky Notes de Documentación y Arquitectura
const stickyNotes = [
  {
    parameters: {
      content: "## 🟣 ZONA 1: Ingesta, Seguridad & Comandos Admin\n**Propósito:** Recepción de Webhook desde WAHA.\n- Filtro de mensajes salientes (fromMe) para detectar handoff humano.\n- 🛠️ **Comandos WhatsApp Admin:** `/feedback <SKU>`, `/corregir`, `/status`.\n- Detección de chats de clientes válidos (ignora grupos y estados).\n- Filtro anti-duplicados por ID de mensaje.",
      height: 600,
      width: 1040,
      color: 4
    },
    id: "sticky_zona_1",
    name: "Sticky Note - Ingesta",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ -240, 60 ]
  },
  {
    parameters: {
      content: "## 🟡 ZONA 2: Pre-Procesamiento & Sesión\n**Propósito:** Preparación y normalización del mensaje.\n- Debounce de ráfagas rápidas de mensajes del cliente.\n- Transcripción de notas de voz con **Groq Whisper**.\n- Verificación de sesión de chat, control de tasa (10 msg/min) y reactivación tras 30 min.\n- Carga de memoria del cliente desde Supabase y Engram.",
      height: 600,
      width: 1480,
      color: 2
    },
    id: "sticky_zona_2",
    name: "Sticky Note - Preprocesamiento",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ 840, 60 ]
  },
  {
    parameters: {
      content: "## 🔵 ZONA 3: Agente de IA & Herramientas\n**Propósito:** Razonamiento del asistente experto 'Perucho'.\n- **Modelo:** OpenAI / OpenRouter (Luna / Sonnet)\n- **Memoria de Sesión:** Buffer de ventana de conversación\n- **Herramientas de Negocio:**\n  1. `buscar_productos`: Motor multicapa con medidas y equivalencias\n  2. `hacer_presupuesto`: Cotización multi-item con cálculo de recargo y BCV\n  3. `obtener_tasa_bcv`: Tasa oficial de cambio al día\n  4. `buscar_memoria_engram` / `guardar_memoria_engram`: Persistencia a largo plazo\n- **Sanitización:** Prevención de tool-calls corruptas o repeticiones.",
      height: 840,
      width: 780,
      color: 5
    },
    id: "sticky_zona_3",
    name: "Sticky Note - Agente IA",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ 2360, 60 ]
  },
  {
    parameters: {
      content: "## 🟢 ZONA 4: Enrutamiento & Despacho WAHA\n**Propósito:** Clasificación de respuesta y envío por WhatsApp.\n- `[ESCALAR_HUMANO]` ➔ Notifica al cliente y registra en `atenciones_pendientes`.\n- `[PEDIR_AYUDA]` ➔ Envía mensaje puente y registra en `solicitudes_ayuda`.\n- **Respuesta Directa** ➔ Envía la cotización / respuesta formateada al cliente.",
      height: 640,
      width: 880,
      color: 6
    },
    id: "sticky_zona_4",
    name: "Sticky Note - Despacho",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ 3180, 60 ]
  }
];

// Quitar sticky notes viejas y agregar las nuevas
wf.nodes = wf.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
wf.nodes.push(...stickyNotes);

// 5. Guardar archivo local
fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2), 'utf8');
console.log('Saved reorganized n8n_workflow.json locally.');

// 6. Desplegar al n8n vivo
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
  else console.log('Workflow successfully reorganized, documented with Sticky Notes and deployed in n8n!');
})().catch(e => { console.error('Error deploying to n8n:', e.message); process.exit(1); });
