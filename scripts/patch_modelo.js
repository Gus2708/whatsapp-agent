// Cambia el modelo del nodo "OpenRouter Chat Model" en el workflow vivo.
//
// 2026-08-01: openai/gpt-4.1-mini -> openai/gpt-5.6-luna.
//   Luna es de la serie GPT-5.6, pensada por OpenAI para "high-volume,
//   latency-sensitive chat y agentic workflows ligeros" — justo lo de Perucho.
//   Es más nuevo Y más barato: $0.10/$0.60 por millón vs $0.40/$1.60 de 4.1-mini
//   (4x menos en input). Sonda contra la API real: tool-call correcta en español,
//   acepta temperature, 400-750 ms (igual que 4.1-mini).
//
//   Si Luna se queda corto en las reglas difíciles (recargo, venta por rollo,
//   marcadores [ESCALAR]/[PEDIR_AYUDA]/[RESERVA:]), existe openai/gpt-5.6-luna-pro:
//   MISMO modelo y MISMO precio por token, servido con reasoning.mode=pro. Se
//   sube de calidad cambiando solo el slug de abajo (pagas más tokens de
//   razonamiento, no una tarifa mayor).
//
// Uso:  node scripts/patch_modelo.js [slug]      (por defecto el MODELO de abajo)
const fs = require('fs');
const path = require('path');

const MODELO = process.argv[2] || 'openai/gpt-5.6-luna';

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();

  const model = wf.nodes.find(n => n.name === 'OpenRouter Chat Model');
  if (!model) { console.error('ERROR: no encontré el nodo "OpenRouter Chat Model"'); process.exit(1); }

  model.parameters = model.parameters || {};
  const anterior = model.parameters.model;
  if (anterior === MODELO) {
    console.log(`· Ya estaba en ${MODELO}. Sin cambios.`);
    return;
  }
  model.parameters.model = MODELO;
  console.log(`✓ modelo: ${anterior} -> ${MODELO}`);

  // La temperatura 0.3 se queda: fue el fix del bucle de repetición degenerativa
  // que filtró una tool-call cruda al cliente (temp 0 = decodificación greedy).
  // Verificado que Luna la acepta sin error.
  const temp = model.parameters.options && model.parameters.options.temperature;
  console.log(`· temperature se mantiene en ${temp}`);

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK — workflow actualizado en n8n.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
