// Detección de [PEDIR_AYUDA]: cuando el bot no encuentra un producto o el cliente refuta el resultado,
// registra una solicitud_ayuda + manda un mensaje puente al cliente (no envía la respuesta normal).
// Se inserta en la rama FALSE de "Check Escalation" para no tocar la escalación ni romper la respuesta normal:
//   Check Escalation (false) -> Check Pedir Ayuda -> true: Registrar Solicitud Ayuda -> Send Bridge Message
//                                                   -> false: Send Agent Response (igual que antes)
// Idempotente y anclado.
const fs = require('fs');
const path = require('path');

const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';

const registrarCode = [
  "// Registra una solicitud de ayuda (el bot no encontro algo o el cliente refuto el resultado).",
  "// La app de empleados elige el/los producto(s) y n8n reenvia. Dedup: una solicitud 'pendiente' por telefono.",
  "const axios = require('axios');",
  "const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';",
  "const ANON = '" + ANON + "';",
  "const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };",
  "let telefono = null, consulta = null;",
  "try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}",
  "try { consulta = ($('Webhook Trigger').first().json.body.payload.body || '').toString().slice(0, 500) || null; } catch (e) {}",
  "try {",
  "  if (telefono) {",
  "    const ex = await axios.get(SB + '/rest/v1/solicitudes_ayuda?status=eq.pendiente&select=id&telefono=eq.' + encodeURIComponent(telefono), { headers: H });",
  "    if (!ex.data || ex.data.length === 0) {",
  "      let nombre = null;",
  "      try { const c = await axios.get(SB + '/rest/v1/clientes_chat?select=nombre&telefono=eq.' + encodeURIComponent(telefono), { headers: H }); nombre = (c.data && c.data[0] && c.data[0].nombre) || null; } catch (e) {}",
  "      await axios.post(SB + '/rest/v1/solicitudes_ayuda', { telefono, nombre, consulta, motivo: 'no_encontrado', status: 'pendiente' }, { headers: H });",
  "    }",
  "  }",
  "} catch (e) {}",
  "return [{ json: $json }];",
].join('\n');

const SM_ANCHOR = '═══ ESCALAMIENTO (remitir a un empleado) ═══';
const SM_NOTE = [
  '═══ PEDIR AYUDA A UN EMPLEADO (producto no hallado o cliente lo refuta) ═══',
  'Si DESPUÉS de buscar con la herramienta no encuentras el producto que el cliente pide, o si el cliente te dice que el resultado/producto que le diste está MAL o no es lo que quería, NO inventes ni insistas con algo dudoso: responde ÚNICAMENTE con el token [PEDIR_AYUDA] (solo eso, sin más texto). Un empleado verá tu solicitud, elegirá el/los producto(s) correcto(s) y el sistema le enviará al cliente la respuesta corregida; tú no haces nada más. Usa [PEDIR_AYUDA] SOLO para dudas de PRODUCTO (no lo encuentras o el cliente lo refuta) y SIEMPRE después de haber buscado. Para reclamos, quejas o si piden hablar con una persona, usa [ESCALAR_HUMANO].',
  '', '',
].join('\n');

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  const ce = wf.connections['Check Escalation'];
  if (!ce || !ce.main || !ce.main[1]) throw new Error('Check Escalation o su rama false no existe');
  const log = [];

  // --- nodos ---
  function addNode(node) { if (!wf.nodes.some(n => n.name === node.name)) { wf.nodes.push(node); log.push('nodo+ ' + node.name); } }
  addNode({
    parameters: { conditions: { combinator: 'and', conditions: [{ id: 'cond_pedir_ayuda', leftValue: '={{ $json.output }}', operator: { operation: 'contains', type: 'string' }, rightValue: '[PEDIR_AYUDA]' }], options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 } }, options: {} },
    id: 'if_pedir_ayuda_node', name: 'Check Pedir Ayuda', position: [1408, 656], type: 'n8n-nodes-base.if', typeVersion: 2.3,
  });
  addNode({ parameters: { jsCode: registrarCode }, id: 'code_registrar_solicitud_node', name: 'Registrar Solicitud Ayuda', position: [1620, 656], type: 'n8n-nodes-base.code', typeVersion: 2, onError: 'continueRegularOutput' });
  addNode({
    parameters: { method: 'POST', url: 'http://waha_serrucho:3000/api/sendText', sendHeaders: true, headerParameters: { parameters: [{ name: 'X-API-Key', value: '={{ $env.WAHA_API_KEY }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ session: 'default', chatId: $('Webhook Trigger').first().json.body.payload.from, text: 'Dame un momentico 👨🏻‍🔧, déjame confirmarlo con un compañero y te escribo enseguida 🪚' }) }}", options: {} },
    onError: 'continueRegularOutput', id: 'waha_bridge_node', name: 'Send Bridge Message', position: [1840, 656], type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4,
  });

  // --- conexiones ---
  const origFalse = ce.main[1];                                  // destino actual del FALSE (Send Agent Response)
  if (!(ce.main[1][0] && ce.main[1][0].node === 'Check Pedir Ayuda')) {
    wf.connections['Check Pedir Ayuda'] = wf.connections['Check Pedir Ayuda'] || { main: [[], []] };
    wf.connections['Check Pedir Ayuda'].main[1] = origFalse;     // false -> respuesta normal (preserva el destino original)
    wf.connections['Check Pedir Ayuda'].main[0] = [{ node: 'Registrar Solicitud Ayuda', type: 'main', index: 0 }];
    ce.main[1] = [{ node: 'Check Pedir Ayuda', type: 'main', index: 0 }];  // Check Escalation false -> Check Pedir Ayuda
    log.push('rewire Check Escalation.false -> Check Pedir Ayuda');
  }
  wf.connections['Registrar Solicitud Ayuda'] = wf.connections['Registrar Solicitud Ayuda'] || { main: [[]] };
  if (!(wf.connections['Registrar Solicitud Ayuda'].main[0] || []).some(c => c.node === 'Send Bridge Message')) {
    wf.connections['Registrar Solicitud Ayuda'].main[0] = [{ node: 'Send Bridge Message', type: 'main', index: 0 }];
    log.push('Registrar -> Send Bridge Message');
  }

  // --- prompt ---
  const ai = wf.nodes.find(n => n.name === 'AI Agent');
  let sm = (ai.parameters.options && ai.parameters.options.systemMessage) || '';
  if (!sm.includes('[PEDIR_AYUDA]')) {
    if (!sm.includes(SM_ANCHOR)) throw new Error('anchor del prompt (ESCALAMIENTO) no encontrado');
    ai.parameters.options.systemMessage = sm.replace(SM_ANCHOR, SM_NOTE + SM_ANCHOR);
    log.push('prompt: nota [PEDIR_AYUDA]');
  }

  if (log.length === 0) { console.log('Sin cambios (idempotente).'); return; }
  console.log(log.join('\n'));
  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }) });
  console.log('PUT status:', put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }
  console.log('OK desplegado.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
