// Corre el cuerpo EXACTO del nodo "Registrar Atencion Pendiente" (tal como quedó desplegado)
// contra Supabase real, con un payload de webhook simulado. Verifica insert + dedup.
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m) || [])[1].trim();
const H = { 'X-N8N-API-KEY': key, accept: 'application/json' };

const axiosShim = {
  async get(u, c) { const r = await fetch(u, { headers: (c && c.headers) || {} }); return { data: await r.json() }; },
  async post(u, b, c) { const r = await fetch(u, { method: 'POST', headers: { ...((c && c.headers) || {}) }, body: JSON.stringify(b) }); let d = null; try { d = await r.json(); } catch (e) {} return { data: d, status: r.status }; },
};
const req = n => n === 'axios' ? axiosShim : require(n);

const TEST_FROM = 'TESTNODE_58412@c.us';
const $ = (name) => ({ first: () => ({ json: { body: { payload: { from: TEST_FROM, body: 'necesito que me atienda un empleado por favor' } } } }) });
const $json = { output: 'Listo, [ESCALAR_HUMANO]' };

(async () => {
  const wf = await (await fetch('http://localhost:5678/api/v1/workflows/ugHOTQv3Vb6cuTct', { headers: H })).json();
  const node = wf.nodes.find(n => n.name === 'Registrar Atencion Pendiente');
  if (!node) { console.log('NO existe el nodo'); return; }
  const body = node.parameters.jsCode;
  const run = () => new Function('$', '$json', 'require', '"use strict"; return (async()=>{\n' + body + '\n})();')($, $json, req);

  await run();                       // 1ra escalación -> inserta
  await run();                       // 2da (reescala) -> NO debe duplicar (dedup)

  // leer lo que quedó (vía anon REST, como la app)
  const ANON = body.match(/const ANON = '([^']+)'/)[1];
  const AH = { apikey: ANON, Authorization: 'Bearer ' + ANON };
  const r = await fetch('https://rgniqjfooifchyctnbzu.supabase.co/rest/v1/atenciones_pendientes?telefono=eq.' + encodeURIComponent(TEST_FROM) + '&select=id,telefono,nombre,motivo,status,creado_en', { headers: AH });
  const rows = await r.json();
  console.log('filas para el telefono de prueba:', rows.length, '(debe ser 1 = insertó y dedup funcionó)');
  console.log(JSON.stringify(rows, null, 2));
})().catch(e => console.log('ERR', e.message));
