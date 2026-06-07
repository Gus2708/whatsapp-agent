/**
 * Prueba 5 presupuestos con productos estrella y VERIFICA fidelidad:
 *  - Cada precio mostrado debe existir DE VERDAD en la BD (no alucinado)
 *  - Línea = cantidad × precio_unitario
 *  - Total USD = suma de líneas
 *  - Pago en Bs = total × 1.40 (recargo) y × tasa BCV
 * Reporta PASS/FAIL por presupuesto con el detalle de cualquier discrepancia.
 */
const http = require('http');
const https = require('https');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const SBHOST = 'rgniqjfooifchyctnbzu.supabase.co';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 5 presupuestos con productos estrella (alta rotación / que sí se venden)
const PRESUPUESTOS = [
  { id: 'P1 Construcción', q: 'presupuesto: 5 cemento gris csc, 10 cabilla 12mm, 50 clavos' },
  { id: 'P2 Techo',        q: 'presupuesto: 8 lamina zinc azul, 4 cercha 10x6, 6 gancho para techo' },
  { id: 'P3 Electricidad', q: 'presupuesto: 10 codo pvc 1/2, 6 cajetin 4x2, 8 curva pvc 3/4' },
  { id: 'P4 Estructura',   q: 'presupuesto: 6 tubo herreria 2x1, 12 disco de corte metal, 3 alambre gh' },
  { id: 'P5 Mixto',        q: 'presupuesto: 20 cemento csc, 15 cabilla 10mm, 8 lamina zinc azul' },
];

function sb(path) {
  return new Promise((res, rej) => {
    https.get({ hostname: SBHOST, path: '/rest/v1/' + path, headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } }, r => {
      let d = ''; r.on('data', c => d += c); r.on('end', () => { try { res(JSON.parse(d)); } catch(e){ res([]); } });
    }).on('error', () => res([]));
  });
}
function n8n(opts, body) {
  return new Promise((res, rej) => {
    const r = http.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res({status:resp.statusCode,body:d})); });
    r.on('error', rej); if(body) r.write(body); r.end();
  });
}
async function latestExec(){ const r = await n8n({hostname:'localhost',port:5678,path:'/api/v1/executions?limit=1',method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}}); return JSON.parse(r.body).data[0]; }
async function execData(id){ const r = await n8n({hostname:'localhost',port:5678,path:`/api/v1/executions/${id}?includeData=true`,method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}}); return JSON.parse(r.body).data; }
function payload(text){
  const from = '5849'+Math.floor(Math.random()*1e8).toString().padStart(8,'0')+'@c.us';
  return JSON.stringify({ id:'evt_'+Date.now(), timestamp:Math.floor(Date.now()/1000), event:'message', session:'default',
    me:{id:'584227898847@c.us',pushName:'Perucho'}, engine:'NOWEB',
    payload:{ id:'m'+Date.now(), timestamp:Math.floor(Date.now()/1000), from, fromMe:false, source:'app', body:text, hasMedia:false, _data:{pushName:'Tester'} } });
}

// Verifica que un precio mostrado exista de verdad para un producto parecido
async function precioEsReal(nombre, precio) {
  const palabras = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').split(/\s+/).filter(w=>w.length>=3).slice(0,4);
  const q = palabras.map(w=>'descripcion=ilike.*'+encodeURIComponent(w)+'*').join('&');
  const rows = await sb('productos?select=descripcion,precio_venta,existencia&'+q+'&limit=10');
  return rows.some(r => Math.abs(Number(r.precio_venta) - precio) < 0.01);
}

async function getTasa(){ const r = await sb('tasas?nombre=eq.actual&select=bcv_usd'); return r[0] && Number(r[0].bcv_usd); }

async function unaCorrida(text) {
  const base = await latestExec(); const baseId = base?Number(base.id):0;
  const body = payload(text);
  await n8n({hostname:'localhost',port:5678,path:'/webhook/whatsapp/inbound',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, body);
  let exec=null;
  for(let i=0;i<25;i++){ await sleep(2000); const e=await latestExec(); if(e && Number(e.id)>baseId && (e.finished||e.status==='success'||e.status==='error')){ exec=e; break; } }
  if(!exec) return '';
  const full = await execData(exec.id);
  return full.resultData.runData['AI Agent']?.[0]?.data?.main?.[0]?.[0]?.json?.output || '';
}

async function correr(pres, tasa) {
  let out = await unaCorrida(pres.q);
  // Reintento si el formato no trae el bloque esperado
  if (!/\d+\.\s*\*?[^\r\n]+[\r\n]+\s*\d+\s*[x×]/.test(out)) { await sleep(2500); out = await unaCorrida(pres.q); }

  // Parsear líneas — tolerante a: */sin asterisco, x/×, comas, espacios, saltos
  const lineas = [];
  const re = /\d+\.\s*\*?([^*\r\n]+?)\*?\s*[\r\n]+\s*(\d+)\s*[x×]\s*([\d.,]+)\s*\$?\s*=\s*\*?\$?\s*([\d.,]+)\s*\$/g;
  let m;
  while ((m = re.exec(out)) !== null) {
    lineas.push({ nombre:m[1].trim(), cant:Number(m[2]), unit:Number(m[3].replace(/,/g,'')), sub:Number(m[4].replace(/,/g,'')) });
  }
  // Totales (tolerante)
  const mUsd = out.match(/[Pp]agando en d[oó]lares[:\s]*\*?\$?\s*([\d,]+(?:\.\d+)?)\s*\$/);
  const mBs  = out.match(/Bs\s*([\d,]+)/);
  const totUsd = mUsd ? Number(mUsd[1].replace(/,/g,'')) : null;
  const totBs  = mBs ? Number(mBs[1].replace(/,/g,'')) : null;

  // ── Verificaciones ──
  const issues = [];
  if (lineas.length === 0) issues.push('No se pudieron parsear líneas (¿formato cambió o no usó la herramienta?)');
  let sumaCalc = 0;
  for (const l of lineas) {
    sumaCalc += l.unit * l.cant;
    // aritmética de línea
    if (Math.abs(l.unit*l.cant - l.sub) > 0.02) issues.push(`${l.nombre}: ${l.cant}×${l.unit}=${(l.unit*l.cant).toFixed(2)} pero muestra ${l.sub}`);
    // precio real en BD
    const real = await precioEsReal(l.nombre, l.unit);
    if (!real) issues.push(`${l.nombre}: precio $${l.unit} NO coincide con ningún producto real en la BD (posible alucinación)`);
  }
  if (totUsd !== null && Math.abs(sumaCalc - totUsd) > 0.02) issues.push(`Total USD ${totUsd} ≠ suma de líneas ${sumaCalc.toFixed(2)}`);
  if (totUsd !== null && totBs !== null && tasa) {
    const esperadoBs = Math.round(totUsd * 1.40 * tasa);
    if (Math.abs(esperadoBs - totBs) > Math.max(2, esperadoBs*0.001)) issues.push(`Total Bs ${totBs} ≠ esperado ${esperadoBs} (USD×1.40×tasa)`);
  }

  return { ...pres, ok: issues.length===0, lineas, totUsd, totBs, issues, out };
}

(async () => {
  const tasa = await getTasa();
  console.log('Tasa BCV:', tasa, '\n');
  const resultados = [];
  for (const p of PRESUPUESTOS) {
    await sleep(3000);
    const r = await correr(p, tasa);
    resultados.push(r);
    console.log('═══════════════════════════════════════');
    console.log((r.ok?'✅ FIEL':'❌ REVISAR') + ' — ' + p.id);
    console.log('Pregunta: ' + p.q);
    if (r.lineas) r.lineas.forEach(l => console.log(`   • ${l.nombre}: ${l.cant} × $${l.unit} = $${l.sub}`));
    console.log(`   TOTAL: $${r.totUsd}  |  Bs ${r.totBs?.toLocaleString('en-US')}`);
    if (r.issues && r.issues.length) r.issues.forEach(i => console.log('   ⚠ ' + i));
    console.log('');
  }
  const ok = resultados.filter(r=>r.ok).length;
  console.log(`\n📊 RESULTADO: ${ok}/${resultados.length} presupuestos 100% fieles`);
})().catch(e => console.error('FATAL', e));
