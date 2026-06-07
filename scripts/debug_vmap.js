const SB='https://rgniqjfooifchyctnbzu.supabase.co';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H={apikey:ANON,Authorization:'Bearer '+ANON};
(async()=>{
  // 1) traer codes de cemento (no contacto)
  const pr = await (await fetch(SB+'/rest/v1/productos?select=codigo_interno,descripcion,existencia&descripcion=ilike.*cemento*&limit=30',{headers:H})).json();
  const codes = pr.filter(p=>!/contacto/i.test(p.descripcion)).map(p=>p.codigo_interno);
  console.log('codes ('+codes.length+'):', codes.join(', '));
  // 2) replicar el fetch de ventas tal cual la tool
  const cf = codes.map(c=>'"'+c+'"').join(',');
  const url = SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=4000';
  console.log('\nURL len:', url.length);
  let vMap={};
  try {
    const r = await fetch(url,{headers:H});
    console.log('status:', r.status);
    const data = await r.json();
    console.log('filas devueltas:', Array.isArray(data)?data.length:('NO-ARRAY: '+JSON.stringify(data).slice(0,200)));
    if (Array.isArray(data)) for(const v of data) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad);
  } catch(e){ console.log('THREW:', e.message); }
  console.log('\nvMap:'); for(const c of codes) console.log('  '+c+': '+(vMap[c]||0));
})();
