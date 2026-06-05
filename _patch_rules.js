/**
 * PATCH: Aplica 3 reglas de negocio al workflow:
 * 1. buscar_productos_tool: filtra existencia=0, ordena más vendidos primero,
 *    limita a 5 mejores resultados.
 * 2. obtener_tasa_bcv_tool: devuelve también el precio con +40% para pagos en Bs.
 * 3. System prompt: instrucción clara sobre +40% al pagar en Bs.
 */
const http = require('http');
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const WF_ID = 'ugHOTQv3Vb6cuTct';
const ANON = 'REDACTED_SUPABASE_ANON_KEY';
const SUPABASE = 'https://rgniqjfooifchyctnbzu.supabase.co';

function get() { return new Promise((res,rej)=>{ http.get({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,headers:{'X-N8N-API-KEY':API_KEY}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);}); }
function put(p){ return new Promise((res,rej)=>{ const b=JSON.stringify(p); const r=http.request({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,method:'PUT',headers:{'X-N8N-API-KEY':API_KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));}); r.on('error',rej); r.write(b); r.end(); }); }

// ── 1. buscar_productos_tool: sin stock=0, ordenado por ventas, max 5 ──────
const BUSCAR_CODE = `
// Busca productos. SOLO muestra los que tienen existencia > 0. Ordena por más vendidos.
const axios = require('axios');
const { p_busqueda } = query;
const SUPABASE = '${SUPABASE}';
const ANON = '${ANON}';
const apiHeaders = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// 1. Buscar candidatos via RPC fuzzy
const rpcResp = await axios.post(SUPABASE + '/rest/v1/rpc/buscar_productos', { p_busqueda }, { headers: apiHeaders });
const candidatos = rpcResp.data || [];

// 2. Filtrar: SOLO productos con stock real
const conStock = candidatos.filter(p => Number(p.existencia) > 0);
if (conStock.length === 0) {
  return 'No encontré "' + p_busqueda + '" con stock disponible en este momento.';
}

// 3. Ordenar por más vendidos: consultar ventas_detalle para los códigos encontrados
const codes = conStock.map(p => p.codigo_interno);
let ventasMap = {};
try {
  const codesFilter = codes.map(c => '"' + c + '"').join(',');
  const vResp = await axios.get(SUPABASE + '/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.(' + codesFilter + ')&limit=2000', { headers: apiHeaders });
  for (const v of (vResp.data || [])) {
    ventasMap[v.codigo_producto] = (ventasMap[v.codigo_producto] || 0) + Number(v.cantidad);
  }
} catch(e) { /* si falla, usamos orden original */ }

// 4. Ordenar por unidades vendidas desc
conStock.sort((a, b) => (ventasMap[b.codigo_interno] || 0) - (ventasMap[a.codigo_interno] || 0));

// 5. Tomar máximo 5 (mejores opciones)
const top5 = conStock.slice(0, 5).map(p => ({
  nombre: p.descripcion,
  precio_usd: Number(p.precio_venta),
  existencia: Math.floor(Number(p.existencia)),
  vendidos: ventasMap[p.codigo_interno] || 0
}));

return JSON.stringify(top5);
`.trim();

// ── 2. obtener_tasa_bcv_tool: incluye precio base + recargo 40% ──────────
const TASA_CODE = `
// Obtiene tasa BCV. Incluye factor de pago en Bs (precio USD * 1.40 * tasa).
const axios = require('axios');
const url = '${SUPABASE}/rest/v1/tazas?nombre=eq.actual&select=bcv_usd';
const resp = await axios.get(url, { headers: { apikey: '${ANON}', Authorization: 'Bearer ${ANON}' } });
const tasa = resp.data && resp.data[0] && Number(resp.data[0].bcv_usd);
return JSON.stringify({
  bcv_usd: tasa,
  nota: 'Para calcular precio en Bs al cliente: precio_usd * 1.40 * bcv_usd (incluye recargo del 40% por pago en efectivo/transferencia Bs)'
});
`.trim();

// ── 3. Instrucción +40% en el system prompt ───────────────────────────────
const REGLA_BS = `\n\nREGLA DE PRECIOS EN BOLÍVARES (OBLIGATORIO):\nCuando el cliente pregunte el precio en bolívares (Bs), DEBES aplicar siempre un recargo del 40% al precio en USD y luego multiplicar por la tasa BCV. Fórmula: Precio Bs = precio_usd × 1.40 × tasa_bcv. Muestra ambos: el precio base en USD y el equivalente en Bs con el recargo. Ejemplo: "Precio: $11.00 USD · En Bs: Bs 8,624.40 (tasa BCV × precio + 40% recargo)".\n\nREGLA DE STOCK:\nNUNCA muestres productos con existencia 0 o agotados. Si no hay stock, informa al cliente claramente y ofrece alternativas si las hay.`;

(async () => {
  const wf = await get();
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = BUSCAR_CODE; console.log('✓ buscar_productos_tool actualizado'); }
    if (n.name === 'obtener_tasa_bcv_tool') { n.parameters.jsCode = TASA_CODE; console.log('✓ obtener_tasa_bcv_tool actualizado'); }
    if (n.name === 'AI Agent') {
      const sm = n.parameters.options.systemMessage;
      // Quitar regla anterior si existe, para no duplicar
      const cleaned = sm.replace(/\nREGLA DE PRECIOS EN BOLÍVARES[\s\S]*?(?=\n\n═══|\n\nREGLA|$)/, '').replace(/\nREGLA DE STOCK[\s\S]*?(?=\n\n═══|\n\nREGLA|$)/, '');
      n.parameters.options.systemMessage = cleaned + REGLA_BS;
      console.log('✓ System prompt actualizado con reglas Bs +40% y sin-stock');
    }
  }
  const r = await put({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: { executionOrder: (wf.settings&&wf.settings.executionOrder)||'v1' } });
  console.log('PUT', r.status, r.status>=300 ? r.body.slice(0,400) : 'OK');
})();
