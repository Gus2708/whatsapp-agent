// Saca el ranking real de productos más vendidos (ventas_detalle) cruzado con
// productos (stock + precio). Devuelve los top con existencia > 0.
const https = require('https');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const HOST = 'rgniqjfooifchyctnbzu.supabase.co';

function api(path) {
  return new Promise((res, rej) => {
    https.get({ hostname: HOST, path: '/rest/v1/' + path, headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e){ rej(e); } });
    }).on('error', rej);
  });
}

(async () => {
  // 1. Paginar ventas_detalle y agregar por código
  const ventas = {};
  for (let off = 0; off < 30000; off += 1000) {
    const page = await api(`ventas_detalle?select=codigo_producto,cantidad&limit=1000&offset=${off}`);
    if (!page.length) break;
    for (const v of page) ventas[v.codigo_producto] = (ventas[v.codigo_producto] || 0) + Number(v.cantidad);
  }
  // 2. Ordenar por más vendidos
  const ranking = Object.entries(ventas).sort((a, b) => b[1] - a[1]).map(([c, q]) => ({ codigo: c, vendido: q }));
  // 3. Traer datos de productos para los top 80 (para filtrar por stock)
  const top = ranking.slice(0, 80);
  const codes = top.map(t => '"' + t.codigo + '"').join(',');
  const prods = await api(`productos?select=codigo_interno,descripcion,precio_venta,existencia&codigo_interno=in.(${codes})`);
  const pmap = {};
  for (const p of prods) pmap[p.codigo_interno] = p;
  // 4. Cruzar y filtrar por stock > 0
  const conStock = top
    .map(t => ({ ...t, ...(pmap[t.codigo] || {}) }))
    .filter(t => t.existencia > 0)
    .map(t => ({ codigo: t.codigo, desc: t.descripcion, precio: Number(t.precio_venta), stock: Math.floor(Number(t.existencia)), vendido: Math.round(t.vendido) }));

  console.log('TOP', conStock.length, 'PRODUCTOS ESTRELLA CON STOCK:\n');
  conStock.slice(0, 25).forEach((p, i) => {
    console.log(`${(i+1).toString().padStart(2)}. [${p.codigo}] ${p.desc}`);
    console.log(`    $${p.precio} | stock ${p.stock} | vendidos ${p.vendido}`);
  });

  // Guardar para los scripts de prueba
  require('fs').writeFileSync('C:/Proyect/whatsapp-agent/_estrella.json', JSON.stringify(conStock.slice(0, 25), null, 2));
})().catch(e => console.error('ERR', e));
