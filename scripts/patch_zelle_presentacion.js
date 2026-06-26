// Fix 1: No re-presentarse a mitad de conversación (ni si el contexto fue reiniciado)
// Fix 2: Zelle = USD = Precio Divisas aplica (bot decía erróneamente que no incluía Zelle)
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };

// FIX 1: Reemplazar la regla débil de presentación con una regla absoluta
const OLD_PRESENTACION = 'Si la conversación ya empezó, NO te vuelvas a presentar; responde directo.';
const NEW_PRESENTACION = 'REGLA ABSOLUTA: Si la conversación ya tiene mensajes anteriores (del cliente o del bot), JAMÁS incluyas el saludo de presentación. Ni siquiera si tu contexto fue reiniciado, ni si pasaron horas, ni si cambiaste de tema. Responde DIRECTO sin saludo, sin "Hola Soy Perucho", sin ninguna presentación. Violar esta regla confunde al cliente.';

// FIX 2: Agregar sección ZELLE Y DIVISAS después de PROHIBIDO — DATOS DE PAGO
const ANCHOR_PAGO = '¿Te ayudo con algo más?"';
const ZELLE_SECTION = `¿Te ayudo con algo más?"

═══ ZELLE Y DIVISAS ═══
*Precio Divisas* = precio en dólares (USD). Zelle es un método de pago en USD, por lo tanto SÍ aplica el *Precio Divisas* para pagos con Zelle. NUNCA digas que "las divisas no incluyen Zelle" ni que el precio divisas "no aplica" a Zelle: eso es FALSO y confunde al cliente.
Si el cliente pregunta "¿divisas incluye Zelle?", "¿puedo pagar con Zelle?", "¿el precio en divisas es para Zelle?", o cualquier variante: confirma que sí, el Precio Divisas aplica para Zelle, pero NUNCA compartas los datos de pago (número, cuenta, etc.). Responde EXACTAMENTE así:
"Sí, el *Precio Divisas* es el precio en USD y aplica para Zelle. Para coordinar el pago con gusto un empleado te atiende enseguida 👨🏻‍🔧, o si prefieres puedes pasar por la tienda. ¿Te ayudo con algo más?"`;

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`, { headers: H })).json();
  let changed = false;

  for (const n of wf.nodes) {
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;

      // Fix 1: presentación
      if (sm.includes(OLD_PRESENTACION)) {
        sm = sm.replace(OLD_PRESENTACION, NEW_PRESENTACION);
        console.log('✓ Fix 1 aplicado: regla de presentación reforzada');
        changed = true;
      } else if (sm.includes(NEW_PRESENTACION)) {
        console.log('· Fix 1 ya estaba aplicado');
      } else {
        console.log('AVISO: no encontré el anchor de presentación');
      }

      // Fix 2: sección Zelle
      if (sm.includes('═══ ZELLE Y DIVISAS ═══')) {
        console.log('· Fix 2 ya estaba aplicado');
      } else if (sm.includes(ANCHOR_PAGO)) {
        sm = sm.replace(ANCHOR_PAGO, ZELLE_SECTION);
        console.log('✓ Fix 2 aplicado: sección ZELLE Y DIVISAS agregada');
        changed = true;
      } else {
        console.log('AVISO: no encontré el anchor de datos de pago');
      }

      n.parameters.options.systemMessage = sm;
      console.log('systemMessage length:', sm.length);
    }
  }

  if (!changed) { console.log('Sin cambios que aplicar.'); return; }

  const allowed = ['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder'];
  const cs = {};
  for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method: 'PUT', headers: H, body: JSON.stringify(body) });
  console.log('PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK — workflow actualizado en n8n.');
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
