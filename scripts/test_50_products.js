const http = require('http');
const fs   = require('fs');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const TARGET_PHONE = '584227898847@c.us'; // El propio número del usuario
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ESCENARIOS = [
  // ── CEMENTO ──
  { id: '1', tipo: 'cemento', espera: { palabras: ['cemento', 'gris'] }, pregunta: 'tienen saco de cemento gris?' },
  { id: '2', tipo: 'cemento', espera: { palabras: ['cemento', 'blanco'] }, pregunta: 'precio de cemento blanco' },
  // ── CABILLAS ──
  { id: '3', tipo: 'cabilla', espera: { palabras: ['cabilla', '12mm'] }, pregunta: 'cuanto vale una cabilla de media?' },
  { id: '4', tipo: 'cabilla', espera: { palabras: ['cabilla', '10mm'] }, pregunta: 'tienen cabilla de 10mm?' },
  { id: '5', tipo: 'cabilla', espera: { palabras: ['cabilla', '12mm'] }, pregunta: 'precio de varilla estriada de 12' },
  // ── TUBOS ──
  { id: '6', tipo: 'tubo', espera: { palabras: ['tubo', '2x1'] }, pregunta: 'precio de tubo de herreria 2x1?' },
  { id: '7', tipo: 'tubo', espera: { palabras: ['tubo', 'agua'] }, pregunta: 'venden tubo de agua negra?' },
  // ── PVC ──
  { id: '8', tipo: 'pvc', espera: { palabras: ['codo', 'pvc'] }, pregunta: 'codo pvc de 1/2 a como sale?' },
  { id: '9', tipo: 'pvc', espera: { palabras: ['codo'] }, pregunta: 'necesito codo para agua fria de media' },
  { id: '10', tipo: 'pvc', espera: { palabras: ['valvula', 'pvc'] }, pregunta: 'tienen valvula pvc de media?' },
  // ── ACCESORIOS DE CONSTRUCCIÓN ──
  { id: '11', tipo: 'construccion', espera: { palabras: ['teflon'] }, pregunta: 'precio de teflon de media' },
  { id: '12', tipo: 'construccion', espera: { palabras: ['malla', 'pollito'] }, pregunta: 'tienen malla pollito?' },
  { id: '13', tipo: 'construccion', espera: { palabras: ['gato'] }, pregunta: 'venden gato hidraulico?' },
  { id: '14', tipo: 'construccion', espera: { palabras: ['brocha'] }, pregunta: 'precio de brocha de una pulgada' },
  { id: '15', tipo: 'electricidad', espera: { palabras: ['curva', 'electric'] }, pregunta: 'curva electrica de media' },
  { id: '16', tipo: 'manguera', espera: { palabras: ['manguera', 'gas'] }, pregunta: 'tienen manguera de gas negra?' },
  { id: '17', tipo: 'electricidad', espera: { palabras: ['toma', 'corriente'] }, pregunta: 'precio de tomacorriente doble' },
  { id: '18', tipo: 'electricidad', espera: { palabras: ['cajera', 'octagonal'] }, pregunta: 'cajera octagonal de plastico' },
  { id: '19', tipo: 'electricidad', espera: { palabras: ['tapa', 'marfil'] }, pregunta: 'tapa ciega de marfil' },
  // ── MECHAS Y CEPILLOS ──
  { id: '20', tipo: 'herramientas', espera: { palabras: ['mecha', 'metal'] }, pregunta: 'mecha para metal de un octavo' },
  { id: '21', tipo: 'plomeria', espera: { palabras: ['niple', 'galvanizado'] }, pregunta: 'niple galvanizado de media por dos' },
  { id: '22', tipo: 'herramientas', espera: { palabras: ['cepillo', 'alambre'] }, pregunta: 'cepillo de alambre circular' },
  // ── HERRAMIENTAS Y PINTURA ──
  { id: '23', tipo: 'herramientas', espera: { palabras: ['machete'] }, pregunta: 'tienen machete bellota?' },
  { id: '24', tipo: 'herramientas', espera: { palabras: ['alicate', 'tenaza'] }, pregunta: 'cuanto sale un alicate de presion?' },
  { id: '25', tipo: 'pintura', espera: { palabras: ['pintura', 'aerosol'] }, pregunta: 'pintura aerosol blanca' },
  { id: '26', tipo: 'pintura', espera: { palabras: ['spray', 'plata'] }, pregunta: 'tienen spray plata?' },
  { id: '27', tipo: 'pintura', espera: { palabras: ['spray', 'neon', 'verde'] }, pregunta: 'precio de spray neon verde' },
  // ── ELECTRICIDAD Y COMPONENTES ──
  { id: '28', tipo: 'electricidad', espera: { palabras: ['breaker'] }, pregunta: 'breaker de 2x50' },
  { id: '29', tipo: 'herramientas', espera: { palabras: ['disco', 'covo'] }, pregunta: 'disco de corte 4 y medio' },
  { id: '30', tipo: 'electricidad', espera: { palabras: ['regleta'] }, pregunta: 'venden regleta de 6 tomas?' },
  { id: '31', tipo: 'herramientas', espera: { palabras: ['mecha', 'metal'] }, pregunta: 'mecha de un cuarto para hierro' },
  { id: '32', tipo: 'construccion', espera: { palabras: ['grifo', 'termo'] }, pregunta: 'grifo para termo precio' },
  // ── BISAGRAS Y SILICÓN ──
  { id: '33', tipo: 'bisagra', espera: { palabras: ['bisagra'] }, pregunta: 'tienen bisagra de 4x4?' },
  { id: '34', tipo: 'herramientas', espera: { palabras: ['pistola', 'calor'] }, pregunta: 'precio de pistola de calor' },
  { id: '35', tipo: 'pilas', espera: { palabras: ['baterias', 'aa'] }, pregunta: 'venden baterias aa?' },
  { id: '36', tipo: 'pilas', espera: { palabras: ['baterias', 'aaa'] }, pregunta: 'baterias aaa precio' },
  { id: '37', tipo: 'bisagra', espera: { palabras: ['bisagra', 'soldar'] }, pregunta: 'bisagra para soldar' },
  { id: '38', tipo: 'herramientas', espera: { palabras: ['pistola', 'silicon'] }, pregunta: 'pistola de silicon gruesa' },
  { id: '39', tipo: 'construccion', espera: { palabras: ['cinta', 'doble'] }, pregunta: 'precio de cinta doble faz' },
  { id: '40', tipo: 'seguridad', espera: { palabras: ['faja', 'lumbar'] }, pregunta: 'tienen faja lumbar l?' },
  // ── OTROS ──
  { id: '41', tipo: 'plomeria', espera: { palabras: ['llave', 'bola'] }, pregunta: 'llave de paso de bola de tres cuartos' },
  { id: '42', tipo: 'herramientas', espera: { palabras: ['cadena', 'motosierra'] }, pregunta: 'cadena para motosierra' },
  { id: '43', tipo: 'pesca', espera: { palabras: ['nylon'] }, pregunta: 'nylon de pescar' },
  { id: '44', tipo: 'construccion', espera: { palabras: ['flotador'] }, pregunta: 'flotador electrico' },
  { id: '45', tipo: 'electricidad', espera: { palabras: ['tablero'] }, pregunta: 'tablero de 6 circuitos' },
  { id: '46', tipo: 'electricidad', espera: { palabras: ['enchufe'] }, pregunta: 'enchufe amarillo' },
  { id: '47', tipo: 'pvc', espera: { palabras: ['manguera', 'culebra'] }, pregunta: 'manguera culebra' },
  { id: '48', tipo: 'laminas', espera: { palabras: ['lamina', 'zinc'] }, pregunta: 'cuanto cuestan las laminas de zinc?' },
  // ── FUERA DE CATÁLOGO / SINÓNIMOS A PRUEBA ──
  { id: '49', tipo: 'sinonimo', espera: { palabras: ['teipe'] }, pregunta: 'tienen tepe negro?' },
  { id: '50', tipo: 'sin_catalogo', espera: { noProducto: true }, pregunta: 'venden lavadora o secadora?' } // fuera de catalogo
];

function apiReq(opts, body) {
  return new Promise((res, rej) => {
    const r = http.request(opts, resp => {
      let d = '';
      resp.on('data', c => d += c);
      resp.on('end', () => res({ status: resp.statusCode, body: d }));
    });
    r.on('error', rej);
    if (body) r.write(body);
    r.end();
  });
}

async function latestExec() {
  const r = await apiReq({
    hostname: 'localhost',
    port: 5678,
    path: '/api/v1/executions?limit=1&includeData=false',
    method: 'GET',
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  });
  return JSON.parse(r.body).data[0];
}

async function execData(id) {
  const r = await apiReq({
    hostname: 'localhost',
    port: 5678,
    path: `/api/v1/executions/${id}?includeData=true`,
    method: 'GET',
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  });
  return JSON.parse(r.body).data;
}

function mkPayload(text) {
  return JSON.stringify({
    id: 'evt_test50_' + Date.now(),
    timestamp: Math.floor(Date.now() / 1000),
    event: 'message',
    session: 'default',
    me: { id: TARGET_PHONE, pushName: 'Perucho Bot' },
    payload: {
      id: 'msg_test50_' + Date.now(),
      timestamp: Math.floor(Date.now() / 1000),
      from: TARGET_PHONE,
      fromMe: false,
      source: 'app',
      body: text,
      hasMedia: false,
      _data: { pushName: 'Gustavo Reyes (Tester)' }
    },
    engine: 'NOWEB'
  });
}

function validar(resp, espera) {
  const r = (resp || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ok = [], fail = [];

  if (espera.palabras) {
    const encontradas = espera.palabras.filter(p => r.includes(p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')));
    if (encontradas.length > 0) ok.push(`Mencionó: ${encontradas.join(', ')}`);
    else fail.push(`No mencionó: ${espera.palabras.join('/')}`);
  }

  if (espera.noProducto) {
    const tieneNegacion = r.includes('no tenemos') || r.includes('no contamos') || r.includes('no se encontr') || r.includes('no encontr') || r.includes('no vendemos') || r.includes('no disponible') || r.includes('no manejamos') || r.includes('no trabajamos') || r.includes('especializamos') || r.includes('no ofrecemos');
    const tieneProductosErroneos = r.includes('$') && (r.includes('lavadora') || r.includes('secadora') || r.includes('tepe'));
    if (tieneNegacion && !tieneProductosErroneos) ok.push('Detectó correctamente que no tiene el producto');
    else if (!tieneNegacion) fail.push('Debió indicar no tener ese producto');
    if (tieneProductosErroneos) fail.push('Mostró un producto incorrecto');
  }

  return { ok, fail, veredicto: fail.length === 0 ? '✅ PASS' : '❌ FAIL' };
}

async function run() {
  let prevContent = '';
  try {
    prevContent = fs.readFileSync('C:/Proyect/whatsapp-agent/ESTUDIO_AGENTE.md', 'utf8');
  } catch (e) {}
  const runNum = (prevContent.match(/^## Corrida #/mg) || []).length + 1;

  console.log(`\n🔬 Iniciando Prueba de 50 Productos — Corrida #${runNum}`);
  console.log(`📱 Destinatario real: ${TARGET_PHONE}`);
  console.log(`⚠️ Para evitar Rate Limiting (10 msg/min), habrá un delay de 8 segundos entre consultas.`);
  console.log(`⏳ Duración estimada: ~7 minutos.\n`);

  const resultados = [];

  for (let i = 0; i < ESCENARIOS.length; i++) {
    const esc = ESCENARIOS[i];
    console.log(`[${i + 1}/50] Enviando consulta: "${esc.pregunta}"...`);

    const baseline = await latestExec();
    const baseId = baseline ? Number(baseline.id) : 0;

    const body = mkPayload(esc.pregunta);
    await apiReq({
      hostname: 'localhost',
      port: 5678,
      path: '/webhook/whatsapp/inbound',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, body);

    // Esperar a que la ejecución termine en n8n
    let exec = null;
    for (let attempts = 0; attempts < 15; attempts++) {
      await sleep(1500);
      const e = await latestExec();
      if (e && Number(e.id) > baseId && (e.finished || e.status === 'error' || e.status === 'success')) {
        exec = e;
        break;
      }
    }

    let respuesta = '(timeout)', toolCalls = [];
    if (exec) {
      try {
        const full = await execData(exec.id);
        const rd = full.resultData.runData;
        if (rd['AI Agent'] && rd['AI Agent'][0].data && rd['AI Agent'][0].data.main) {
          const d = rd['AI Agent'][0].data.main[0] && rd['AI Agent'][0].data.main[0][0];
          respuesta = d && d.json && d.json.output ? d.json.output : '(vacio)';
        }
        for (const t of ['buscar_productos_tool', 'hacer_presupuesto_tool', 'obtener_tasa_bcv_tool']) {
          if (rd[t]) {
            const td = rd[t][0];
            const out = td && td.data && td.data.ai_tool && td.data.ai_tool[0] && td.data.ai_tool[0][0];
            if (out) toolCalls.push(`${t}: ${JSON.stringify(out.json).slice(0, 100)}`);
          }
        }
      } catch (e) {
        respuesta = 'ERROR: ' + e.message;
      }
    }

    const v = validar(respuesta, esc.espera);
    resultados.push({ ...esc, respuesta, toolCalls, ...v });

    const ico = v.veredicto.startsWith('✅') ? '✅' : '❌';
    console.log(`    Result: ${ico} | output: "${respuesta.replace(/\n/g, ' ').slice(0, 80)}..."\n`);

    // Esperar 8 segundos antes del siguiente escenario para rate limiting
    await sleep(8000);
  }

  // Generar reporte
  const pass = resultados.filter(r => r.veredicto.startsWith('✅')).length;
  const fail = resultados.length - pass;
  const pct = Math.round((pass / resultados.length) * 100);

  let md = prevContent + `\n---\n\n## Corrida #${runNum} — ${new Date().toLocaleString('es-VE')} — Tasa: ${pct}% (${pass}/${resultados.length}) [Prueba Real a ${TARGET_PHONE}]\n\n`;
  md += `| ID | Tipo | Pregunta | Veredicto | Problemas |\n|---|---|---|---|---|\n`;
  for (const r of resultados) {
    md += `| ${r.id} | ${r.tipo} | ${r.pregunta} | ${r.veredicto} | ${r.fail.join('; ') || '—'} |\n`;
  }

  const fails = resultados.filter(r => r.veredicto === '❌ FAIL');
  if (fails.length) {
    md += `\n### Detalles de fallos\n`;
    for (const r of fails) {
      md += `\n#### ❌ ${r.id} (${r.tipo})\n`;
      md += `**Pregunta:** "${r.pregunta}"\n\n`;
      md += `**Respuesta:**\n\`\`\`\n${r.respuesta}\n\`\`\`\n\n`;
      if (r.toolCalls.length) md += `**Tools:** ${r.toolCalls.join(' | ')}\n\n`;
      md += `**Problemas:** ${r.fail.join(' · ')}\n\n`;
    }
  }

  fs.writeFileSync('C:/Proyect/whatsapp-agent/ESTUDIO_AGENTE.md', md, 'utf8');
  console.log(`\n🎉 ¡Pruebas completadas!`);
  console.log(`📊 Corrida #${runNum}: ${pass}/50 (${pct}%) PASS`);
  console.log(`📄 ESTUDIO_AGENTE.md actualizado con los resultados.`);
}

run().catch(e => console.error('FATAL', e));
