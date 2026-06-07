// Ejecuta el jsCode REAL de la tool buscar_productos del workflow vivo contra Supabase
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'accept':'application/json' };

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const node = wf.nodes.find(n => n.name === 'buscar_productos_tool');
  const jsCode = node.parameters.jsCode;
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const axiosShim = {
    get: async (url, cfg={}) => { const r = await fetch(url, { headers: cfg.headers||{} }); const data = await r.json().catch(()=>null); if(!r.ok) throw new Error('HTTP '+r.status); return { data }; },
    post: async (url, body, cfg={}) => { const r = await fetch(url, { method:'POST', headers: cfg.headers||{}, body: JSON.stringify(body) }); const data = await r.json().catch(()=>null); if(!r.ok) throw new Error('HTTP '+r.status); return { data }; }
  };
  const fakeRequire = (m) => m === 'axios' ? axiosShim : require(m);
  const fn = new AsyncFunction('query','require', jsCode);
  for (const term of ['cemento','cemento gris','cemento contacto']) {
    const out = await fn({ p_busqueda: term }, fakeRequire);
    const parsed = JSON.parse(out);
    console.log('\n=== buscar_productos("'+term+'") ===');
    console.log('encontrados:', parsed.encontrados, '| tasa:', parsed.tasa_bcv);
    (parsed.productos||[]).forEach((p,i)=> console.log(`  ${i+1}. ${p.nombre} | ${p.precio_divisas_texto}`));
  }
})().catch(e=>{ console.error('ERROR', e.stack); process.exit(1); });
