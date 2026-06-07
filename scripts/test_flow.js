const http = require('http');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// Payload estilo WAHA. chatId de PRUEBA.
// Por defecto usa un número ALEATORIO por corrida → memoria de conversación limpia
// (evita que el bot imite respuestas viejas). Pasa un 2º arg para fijar el número
// (útil para probar continuidad de conversación: misma memoria entre mensajes).
const FIXED_FROM = process.argv[3];
const RANDOM_FROM = FIXED_FROM || ('5849' + Math.floor(Math.random()*1e8).toString().padStart(8,'0') + '@c.us');
function makePayload(text) {
  return JSON.stringify({
    id: 'evt_test_' + Date.now(),
    timestamp: Math.floor(Date.now()/1000),
    event: 'message',
    session: 'default',
    me: { id: '584227898847@c.us', pushName: 'Gustavo Reyes' },
    payload: {
      id: 'test_' + Date.now(),
      timestamp: Math.floor(Date.now()/1000),
      from: RANDOM_FROM,
      fromMe: false,
      source: 'app',
      body: text,
      hasMedia: false,
      _data: { pushName: 'Cliente Prueba' }
    },
    engine: 'NOWEB'
  });
}

async function listExec() {
  const r = await req({ hostname:'localhost', port:5678, path:'/api/v1/executions?limit=1&includeData=false', method:'GET', headers:{ 'X-N8N-API-KEY': N8N_KEY } });
  return JSON.parse(r.body).data[0];
}

async function getExec(id) {
  const r = await req({ hostname:'localhost', port:5678, path:`/api/v1/executions/${id}?includeData=true`, method:'GET', headers:{ 'X-N8N-API-KEY': N8N_KEY } });
  return JSON.parse(r.body).data;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function run() {
  const text = process.argv[2] || 'Buenas, cuanto cuesta un martillo y tienen en stock?';
  const baseline = await listExec();
  const baseId = baseline ? Number(baseline.id) : 0;
  console.log('>>> Enviando al webhook:', text, '(baseline exec', baseId + ')');
  const body = makePayload(text);
  const r = await req({ hostname:'localhost', port:5678, path:'/webhook/whatsapp/inbound', method:'POST', headers:{ 'Content-Type':'application/json', 'Content-Length': Buffer.byteLength(body) } }, body);
  console.log('Webhook respondió:', r.status);

  // Esperar a que aparezca y termine una ejecución NUEVA (id > baseline)
  let exec = null;
  for (let i = 0; i < 25; i++) {
    await sleep(1500);
    const e = await listExec();
    if (e && Number(e.id) > baseId && (e.finished || e.status === 'error' || e.status === 'success')) { exec = e; break; }
  }
  if (!exec) { console.log('No terminó a tiempo.'); return; }

  console.log('\n=== EJECUCIÓN', exec.id, '| status:', exec.status, '===');
  const full = await getExec(exec.id);
  const rd = full.resultData.runData;
  console.log('Último nodo:', full.resultData.lastNodeExecuted);
  if (full.resultData.error) console.log('ERROR:', full.resultData.error.message, '| nodo:', full.resultData.error.node && full.resultData.error.node.name);

  // Salida del AI Agent
  if (rd['AI Agent']) {
    const out = rd['AI Agent'][0];
    if (out.error) console.log('\n[AI Agent ERROR]:', out.error.message);
    else {
      const data = out.data && out.data.main && out.data.main[0] && out.data.main[0][0];
      console.log('\n[AI Agent OUTPUT]:', data && data.json && data.json.output);
    }
  }
  // ¿Llamó herramientas?
  for (const tool of ['buscar_productos_tool','obtener_tasa_bcv_tool','buscar_memoria_engram_tool','guardar_memoria_engram_tool']) {
    if (rd[tool]) {
      const t = rd[tool][0];
      const o = t.data && t.data.ai_tool && t.data.ai_tool[0] && t.data.ai_tool[0][0];
      console.log(`[TOOL ${tool}] llamada. salida:`, o && JSON.stringify(o.json).slice(0,200));
    }
  }
  // Send Agent Response
  if (rd['Send Agent Response']) {
    const s = rd['Send Agent Response'][0];
    console.log('\n[Send Agent Response]', s.error ? 'ERROR: '+s.error.message : 'status: '+ JSON.stringify((s.data&&s.data.main&&s.data.main[0]&&s.data.main[0][0]&&s.data.main[0][0].json)||{}).slice(0,200));
  }
}
run().catch(e => console.error('FATAL', e));
