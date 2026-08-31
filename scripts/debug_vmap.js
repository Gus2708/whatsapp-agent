const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

const SB=pick('SUPABASE_URL');
const ANON=pick('SUPABASE_ANON_KEY');
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
