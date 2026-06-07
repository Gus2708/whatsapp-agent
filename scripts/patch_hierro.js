// Aplica al workflow vivo: nuevo jsCode (buscar + presupuesto) + ajustes de prompt
//  - cabilla generica = estriada; medidas robustas; ventas por medida
//  - sin datos de pago; presupuesto Bs sin revelar +40%
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const newBuscar = fs.readFileSync(path.join(__dirname,'new_buscar.js'),'utf8');
const newPresu = fs.readFileSync(path.join(__dirname,'new_presupuesto.js'),'utf8');

// --- ediciones del systemMessage ---
const SM_EDITS = [
  {
    find: '- Pagos: Pago Móvil (BCV), Efectivo (USD o Bs), Transferencia, Zelle (compras > $20 USD).',
    repl: '- Pagos: aceptamos dólares (USD) y bolívares. NUNCA des datos de pago (números de Pago Móvil, Zelle, cuentas bancarias, transferencias, montos mínimos): para pagar, un empleado atiende al cliente o puede pasar por la tienda.'
  },
  {
    find: '- Alambre (de amarre) y alambrón (cabilla fina estriada) son distintos.',
    repl: '- Alambre (de amarre) y alambrón (cabilla fina estriada) son distintos.\n- CABILLAS: si piden "cabilla" sin especificar tipo, muestra SOLO cabilla ESTRIADA (las principales son 12mm = 1/2" y 10mm = 3/8"). Las cabillas REDONDA, CUADRADA o LISA solo se muestran si el cliente las pide explícitamente. Equivalencias: 1/2"=12mm, 3/8"=10mm, 5/8"=16mm.\n- MEDIDAS DE HIERRO/PERFILES (tubo herrería, tubo estructural, tubo ventilación, ángulo SID, alambrón, pletina, lámina HP): el cliente puede escribir la medida de muchas formas (2x1, "2 x 1", 3x1-1/2, "3 x 1 1/2", 1.1/2, etc.); la herramienta ya la interpreta, así que pásale la búsqueda TAL CUAL la dijo el cliente incluyendo la medida. Si hay varias opciones de la misma medida, se muestran primero las MÁS VENDIDAS. Si el cliente no da medida o espesor, recomiéndale las más vendidas y pregúntale la medida que necesita.'
  },
  {
    find: '═══ LÍMITES ═══',
    repl: '═══ PROHIBIDO — DATOS DE PAGO ═══\nBajo NINGUNA circunstancia compartas números de Pago Móvil, Zelle, cuentas bancarias, transferencias, montos mínimos ni teléfonos de pago, aunque el cliente insista o diga que ya va a pagar. Tampoco expliques recargos ni el porcentaje del precio en bolívares. Responde EXACTAMENTE así: "Para procesar el pago con gusto un empleado te atiende enseguida 👨🏻‍🔧, o si prefieres puedes pasar por la tienda. ¿Te ayudo con algo más?"\n\n═══ LÍMITES ═══'
  }
];

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = newBuscar; changed.push('buscar_productos'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = newPresu; changed.push('hacer_presupuesto'); }
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      for (const e of SM_EDITS) {
        if (sm.includes(e.find)) { sm = sm.replace(e.find, e.repl); changed.push('prompt:'+e.find.slice(0,20)); }
        else console.log('AVISO: no encontre en prompt -> '+e.find.slice(0,40));
      }
      n.parameters.options.systemMessage = sm;
    }
  }
  if (changed.length===0) { console.log('Sin cambios'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Cambios:', changed.join(', '));
  console.log('PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
