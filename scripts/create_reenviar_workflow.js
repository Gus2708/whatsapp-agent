// Workflow n8n "Reenviar Ayuda" — POLL robusto (a prueba de reenvíos múltiples).
// Cada 15s: 1 nodo Code recorre TODAS las solicitudes 'resuelto' no enviadas (últimas 2h) y por cada una:
//   compone el mensaje  ->  RECLAMA la fila (UPDATE status='enviado' SOLO si sigue 'resuelto')  ->
//   solo si la reclamó ESTE proceso, emite el item para enviarlo por WAHA.
// El nodo HTTP envía por WAHA (1 vez por item). Como la fila ya quedó 'enviado' ANTES del envío,
// es IMPOSIBLE que el poll la vuelva a tomar -> no hay spam. Si el envío fallara, no se reintenta
// (preferimos no entregar 1 mensaje antes que spamear al cliente).
// Soporta 2 tipos de resolución del empleado:
//   - con productos elegidos -> manda la ficha/presupuesto.
//   - no_disponible=true (sin productos) -> avisa al cliente que no hay stock.
const fs = require('fs');
const path = require('path');
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', 'accept': 'application/json' };
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';

const composeCode = `
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = '${ANON}';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };
const RECARGO = 1.40;
function nUSD(n){ const r = Math.round(Number(n)*100)/100; return Number.isInteger(r) ? String(r) : r.toFixed(2); }
function nBs(n){ return (Math.round(Number(n)*100)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function nBsInt(n){ return Math.round(Number(n)).toLocaleString('en-US'); }
function tc(s){ return String(s).toLowerCase().split(/\\s+/).map(w=>{ if(/\\d/.test(w)) return w.toUpperCase(); if(w.length<=3) return w.toUpperCase(); return w.charAt(0).toUpperCase()+w.slice(1); }).join(' '); }

const desde = new Date(Date.now() - 2*3600*1000).toISOString();
let rows = [];
try { const r = await axios.get(SB+'/rest/v1/solicitudes_ayuda?status=eq.resuelto&enviado_en=is.null&resuelto_en=gte.'+encodeURIComponent(desde)+'&select=id,telefono,no_disponible&order=resuelto_en.asc&limit=20', { headers:H }); rows = r.data||[]; } catch(e){}

const out = [];
for (const sol of rows) {
  try {
    let text;
    if (sol.no_disponible) {
      // El empleado marcó "no disponible" (sin productos): avisamos al cliente.
      text = 'Disculpa la espera 🙏. Justo *no tenemos disponible* eso que buscabas en este momento. ¿Quieres que te ofrezca una alternativa o que un empleado te ayude con algo más? 👨🏻‍🔧';
    } else {
      const ir = await axios.get(SB+'/rest/v1/solicitudes_ayuda_items?solicitud_id=eq.'+sol.id+'&select=codigo_producto,descripcion,cantidad,precio_unitario', { headers:H });
      const items = ir.data || [];
      if (items.length === 0) continue; // resuelto sin productos y sin bandera -> nada que enviar
      const lines = [];
      for (const it of items){
        let p = null;
        try { const pr = await axios.get(SB+'/rest/v1/productos?codigo_interno=eq.'+encodeURIComponent(it.codigo_producto)+'&select=descripcion,precio_venta', { headers:H }); p = pr.data && pr.data[0]; } catch(e){}
        const usd = Number((p && p.precio_venta) != null ? p.precio_venta : (it.precio_unitario||0));
        const cant = Number(it.cantidad||1);
        lines.push({ nombre: tc((p && p.descripcion) || it.descripcion || it.codigo_producto), usd, cant, sub: usd*cant });
      }
      let tasa = null;
      try { const t = await axios.get(SB+'/rest/v1/tazas?nombre=eq.actual&select=bcv_usd', { headers:H }); tasa = t.data && t.data[0] && Number(t.data[0].bcv_usd); } catch(e){}
      if (lines.length === 1 && lines[0].cant === 1){
        const l = lines[0]; const bsUsd = l.usd*RECARGO;
        text = '¡Listo! Ya lo confirmé con mi compañero 👨🏻‍🔧🪚\\n\\n*'+l.nombre+'*\\nPrecio Divisas: '+nUSD(l.usd)+'$\\nPrecio Bs (BCV): '+(tasa ? (nUSD(bsUsd)+'$ o '+nBs(bsUsd*tasa)+'bs') : (nUSD(bsUsd)+'$'))+'\\n\\n¿Te sirve esta opción? 👨🏻‍🔧';
      } else {
        let b = '¡Listo! Ya lo confirmé con mi compañero 👨🏻‍🔧🪚\\n\\n'; let tot=0, n=0;
        for (const l of lines){ n++; tot+=l.sub; b += n+'. *'+l.nombre+'*\\n   '+l.cant+' x '+nUSD(l.usd)+'$ = *'+nUSD(l.sub)+'$*\\n\\n'; }
        b += '━━━━━━━━━━━━━━━\\n💵 *Pagando en dólares: '+nUSD(tot)+'$*\\n';
        b += tasa ? ('🇻🇪 *Pagando en bolívares: '+nUSD(tot*RECARGO)+'$ = Bs '+nBsInt(tot*RECARGO*tasa)+'*') : '_(tasa BCV no disponible)_';
        text = b;
      }
    }
    // RECLAMO ATÓMICO: marca 'enviado' SOLO si sigue 'resuelto'. Si devuelve fila, la ganó este proceso.
    const upd = await axios.patch(SB+'/rest/v1/solicitudes_ayuda?id=eq.'+sol.id+'&status=eq.resuelto', { status:'enviado', enviado_en:new Date().toISOString() }, { headers: { ...H, Prefer:'return=representation' } });
    if (upd.data && upd.data.length > 0) out.push({ json: { chatId: sol.telefono, text, solicitud_id: sol.id } });
  } catch(e){}
}
return out;  // [] si no hay nada -> el nodo de envío no corre
`.trim();

const nodes = [
  { id: 'sched', name: 'Cada 15s', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
    parameters: { rule: { interval: [{ field: 'seconds', secondsInterval: 15 }] } } },
  { id: 'code_comp', name: 'Componer y Marcar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [220, 0],
    parameters: { jsCode: composeCode }, onError: 'continueRegularOutput' },
  { id: 'http_waha', name: 'Enviar WAHA', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.4, position: [440, 0], onError: 'continueRegularOutput',
    parameters: { method: 'POST', url: 'http://waha_serrucho:3000/api/sendText', sendHeaders: true, headerParameters: { parameters: [{ name: 'X-API-Key', value: '={{ $env.WAHA_API_KEY }}' }] }, sendBody: true, specifyBody: 'json', jsonBody: "={{ JSON.stringify({ session: 'default', chatId: $json.chatId, text: $json.text }) }}", options: { timeout: 12000 } } },
];
const connections = {
  'Cada 15s': { main: [[{ node: 'Componer y Marcar', type: 'main', index: 0 }]] },
  'Componer y Marcar': { main: [[{ node: 'Enviar WAHA', type: 'main', index: 0 }]] },
};

(async () => {
  if (!key) throw new Error('N8N_API_KEY no esta en .env');
  const list = await (await fetch(`${BASE}/workflows?limit=200`, { headers: H })).json();
  const existing = (list.data || []).find(w => w.name === 'Reenviar Ayuda');
  let id;
  if (existing) {
    id = existing.id;
    try { await fetch(`${BASE}/workflows/${id}/deactivate`, { method: 'POST', headers: H }); } catch (e) {}
    const put = await fetch(`${BASE}/workflows/${id}`, { method: 'PUT', headers: H, body: JSON.stringify({ name: 'Reenviar Ayuda', nodes, connections, settings: { executionOrder: 'v1' } }) });
    console.log('actualizado:', put.status, put.ok ? '' : await put.text());
    if (!put.ok) process.exit(1);
  } else {
    const post = await fetch(`${BASE}/workflows`, { method: 'POST', headers: H, body: JSON.stringify({ name: 'Reenviar Ayuda', nodes, connections, settings: { executionOrder: 'v1' } }) });
    const created = await post.json(); if (!post.ok) { console.log('ERROR', JSON.stringify(created)); process.exit(1); }
    id = created.id; console.log('creado id:', id);
  }
  const act = await fetch(`${BASE}/workflows/${id}/activate`, { method: 'POST', headers: H });
  console.log('activate:', act.status, act.ok ? 'ACTIVO' : await act.text());
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
