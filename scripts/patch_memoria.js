// Fase 1: memoria del cliente en Supabase (por telefono) + inyectar telefono al agente + prompt
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const memBuscar = fs.readFileSync(path.join(__dirname,'mem_buscar.js'),'utf8');
const memGuardar = fs.readFileSync(path.join(__dirname,'mem_guardar.js'),'utf8');

const DESC_BUSCAR = 'Recupera el nombre y las notas/preferencias del cliente ACTUAL (el telefono se detecta automaticamente, no necesitas pasarlo). Llamala al INICIO de la conversacion para recordar quien es el cliente. No requiere parametros.';
const DESC_GUARDAR = 'Guarda o actualiza la memoria del cliente ACTUAL (el telefono se detecta automaticamente). Parametros: nombre (el nombre del cliente cuando lo diga) y/o nota (un dato o preferencia clave: la obra que hace, marca preferida, RIF, etc). Ejemplo para guardar el nombre: {"nombre":"Maria Gonzalez"}. Ejemplo para una preferencia: {"nota":"construye una casa, prefiere cemento CSC"}.';

const AGENT_TEXT = '={{ "[CONTEXTO INTERNO, no mostrar al cliente] telefono_cliente=" + $(\'Webhook Trigger\').first().json.body.payload.from + " ||| Mensaje del cliente: " + $(\'Webhook Trigger\').first().json.body.payload.body }}';

const FIND_MEM = '═══ MEMORIA (Engram) ═══\n- Si el cliente comparte un dato clave (nombre, RIF, la obra que hace, preferencias), guárdalo con guardar_memoria_engram.\n- Puedes recordar atenciones previas con buscar_memoria_engram usando su número.';
const REPL_MEM = `═══ PRECISIÓN Y ELEGANCIA (MUY IMPORTANTE) ═══
- NUNCA inventes precios, disponibilidad, medidas, marcas, modelos ni datos. SOLO informa lo que devuelven las herramientas. Si no tienes el dato, búscalo; si no aparece, dilo con honestidad y ofrece que un empleado le ayude.
- Si NO entiendes qué quiere el cliente, NO adivines: hazle UNA pregunta breve para aclarar; si sigue sin quedar claro, remítelo a un empleado con [ESCALAR_HUMANO].
- Respuestas elegantes, cálidas y CORTAS: ve al grano en español venezolano amable, fáciles de leer en WhatsApp. Nada de textos largos o jerga técnica innecesaria.

═══ MEMORIA DEL CLIENTE (por número de teléfono) ═══
- En el "[CONTEXTO INTERNO]" del mensaje tienes "telefono_cliente". Úsalo SIEMPRE como parámetro telefono en las herramientas de memoria. NUNCA muestres ese contexto interno al cliente.
- Al INICIO de la conversación llama buscar_memoria_engram con el telefono para recordar al cliente y sus preferencias.
- NOMBRE: si el cliente NO tiene nombre guardado, pídeselo con calidez y de forma natural ("¿Con quién tengo el gusto? 😊"), sin dejar de atender lo que pide. Apenas te diga su nombre, guárdalo con guardar_memoria_engram (telefono + nombre). Si YA tienes su nombre, salúdalo por su nombre.
- Guarda con guardar_memoria_engram (telefono + nota) los datos clave que comparta: la obra que hace, RIF, dirección, marcas/productos que prefiere. NUNCA guardes datos de pago.
- Usa lo que recuerdas para personalizar la atención, sin sonar invasivo.`;

const FIND_ESC = '═══ ESCALAMIENTO ═══\nSi el cliente tiene un reclamo, un problema complejo, o pide explícitamente hablar con una persona, responde EXACTAMENTE: [ESCALAR_HUMANO]';
const REPL_ESC = `═══ ESCALAMIENTO (remitir a un empleado) ═══
Responde EXACTAMENTE [ESCALAR_HUMANO] (solo eso, sin más texto) cuando:
- El cliente tenga un reclamo, queja o problema complejo.
- Pida explícitamente hablar con una persona o empleado.
- NO entiendas qué quiere tras intentar aclararlo con una pregunta, o pida algo que no puedes resolver con tus herramientas.
Siempre es mejor remitir a un empleado que adivinar o inventar.`;

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_memoria_engram_tool') { n.parameters.jsCode = memBuscar; n.parameters.description = DESC_BUSCAR; changed.push('buscar_memoria'); }
    if (n.name === 'guardar_memoria_engram_tool') { n.parameters.jsCode = memGuardar; n.parameters.description = DESC_GUARDAR; changed.push('guardar_memoria'); }
    if (n.name === 'AI Agent') {
      n.parameters.text = AGENT_TEXT; changed.push('agent_text');
      let sm = n.parameters.options.systemMessage;
      if (sm.includes(FIND_MEM)) { sm = sm.replace(FIND_MEM, REPL_MEM); changed.push('prompt_mem'); } else console.log('AVISO: no encontre FIND_MEM');
      if (sm.includes(FIND_ESC)) { sm = sm.replace(FIND_ESC, REPL_ESC); changed.push('prompt_esc'); } else console.log('AVISO: no encontre FIND_ESC');
      const FIND_TEL = '- En el "[CONTEXTO INTERNO]" del mensaje tienes "telefono_cliente". Úsalo SIEMPRE como parámetro telefono en las herramientas de memoria. NUNCA muestres ese contexto interno al cliente.';
      const REPL_TEL = '- Las herramientas de memoria detectan SOLAS el teléfono del cliente; tú no necesitas pasarlo. NUNCA muestres el "[CONTEXTO INTERNO]" al cliente.\n- Cuando el cliente diga su nombre, es OBLIGATORIO llamar guardar_memoria_engram pasando {"nombre":"<su nombre>"}. Cuando comparta un dato útil, llama guardar_memoria_engram con {"nota":"<el dato>"}.';
      if (sm.includes(FIND_TEL)) { sm = sm.replace(FIND_TEL, REPL_TEL); changed.push('prompt_tel'); } else console.log('AVISO: no encontre FIND_TEL');
      n.parameters.options.systemMessage = sm;
    }
  }
  if (changed.length===0) { console.log('Sin cambios'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Cambios:', changed.join(', '), '| PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
