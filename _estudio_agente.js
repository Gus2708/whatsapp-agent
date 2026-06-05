/**
 * Estudio de calidad del agente Perucho
 * Prueba 20 productos más vendidos en múltiples escenarios:
 * - Nombre exacto, apodo/coloquial, descripción parcial, con/sin acento,
 *   error ortográfico, escenario de precio en Bs, producto sin stock, multi-producto.
 * Guarda resultados en ESTUDIO_AGENTE.md
 */
const http = require('http');
const fs   = require('fs');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Escenarios de prueba ─────────────────────────────────────────────────────
// Basados en el top-20 más vendidos. Cada escenario tiene:
//   pregunta: lo que el cliente escribe
//   espera: producto(s) y precio(s) esperados (para validar)
//   tipo: (exacto | coloquial | parcial | ortografia | bs | sin_stock | multi)
const ESCENARIOS = [
  // CEMENTO (más vendido)
  { id:'C01', tipo:'exacto',     espera:{prod:'CEMENTO GRIS CSC 42.5KG',  precio:11}, pregunta:'tienen cemento gris csc?' },
  { id:'C02', tipo:'coloquial',  espera:{prod:'CEMENTO GRIS',             precio:11}, pregunta:'cuanto vale un saco de cemento?' },
  { id:'C03', tipo:'parcial',    espera:{prod:'CEMENTO',                  precio:11}, pregunta:'precio del cemento 42 kilos' },
  { id:'C04', tipo:'bs',         espera:{prod:'CEMENTO',                  precio:11, bs:true}, pregunta:'cuanto sale el cemento en bolivares?' },
  { id:'C05', tipo:'ortografia', espera:{prod:'CEMENTO',                  precio:11}, pregunta:'simento gris precio?' },

  // CLAVOS (top 5)
  { id:'N01', tipo:'exacto',     espera:{prod:'CLAVOS',  precio:2},  pregunta:'venden clavos? a cuanto estan?' },
  { id:'N02', tipo:'coloquial',  espera:{prod:'CLAVOS',  precio:2},  pregunta:'necesito clavo para madera' },
  { id:'N03', tipo:'bs',         espera:{prod:'CLAVOS',  precio:2, bs:true}, pregunta:'cuanto cuestan los clavos en bs?' },

  // CABILLA
  { id:'K01', tipo:'exacto',     espera:{prod:'CABILLA ESTRIADA 12MM', precio:16.5}, pregunta:'tienen cabilla 12mm?' },
  { id:'K02', tipo:'coloquial',  espera:{prod:'CABILLA',              precio:16.5}, pregunta:'cuanto vale la cabilla?' },
  { id:'K03', tipo:'parcial',    espera:{prod:'CABILLA',              precio:16.5}, pregunta:'precio cabilla corrugada' },

  // TUBOS / TUBERÍA HERRERÍA
  { id:'T01', tipo:'exacto',     espera:{prod:'TUBO HERRERÍA 2X1X0.80X6MTS', precio:10}, pregunta:'precio tubo herreria 2x1?' },
  { id:'T02', tipo:'coloquial',  espera:{prod:'TUBO',                         precio:10}, pregunta:'tienen tubo cuadrado 2x1 de 6 metros?' },
  { id:'T03', tipo:'parcial',    espera:{prod:'TUBO HERRERIA',                precio:10}, pregunta:'tubo metalico 6 metros' },

  // CERCHA
  { id:'E01', tipo:'exacto',     espera:{prod:'CERCHA DE 10X6MTS', precio:11}, pregunta:'hay cerchas de 10 de ancho?' },
  { id:'E02', tipo:'coloquial',  espera:{prod:'CERCHA',             precio:11}, pregunta:'cuanto sale una cercha?' },

  // ALAMBRON
  { id:'A01', tipo:'exacto',     espera:{prod:'ALAMBRON ESTRIADO 5MM', precio:2}, pregunta:'alambron 5mm precio?' },
  { id:'A02', tipo:'coloquial',  espera:{prod:'ALAMBRON',               precio:2}, pregunta:'tienen alambre de construccion?' },

  // LÁMINAS DE ZINC
  { id:'Z01', tipo:'exacto',     espera:{prod:'LAMINA ZINC ONDULADO AZUL', precio:10.5}, pregunta:'láminas de zinc azul 12 pies?' },
  { id:'Z02', tipo:'coloquial',  espera:{prod:'LAMINA',                    precio:10.5}, pregunta:'cuanto cuesta una lamina de techo?' },
  { id:'Z03', tipo:'bs',         espera:{prod:'LAMINA ZINC',  precio:10.5, bs:true}, pregunta:'las laminas de zinc cuanto salen en bolivares?' },

  // DISCO CORTE METAL
  { id:'D01', tipo:'exacto',     espera:{prod:'DISCO C/METAL FINO 4-1/2', precio:1}, pregunta:'tienen disco de corte 4 y medio?' },
  { id:'D02', tipo:'coloquial',  espera:{prod:'DISCO',                    precio:1}, pregunta:'necesito un disco para cortar hierro, cuanto esta?' },

  // ALAMBRE
  { id:'W01', tipo:'exacto',     espera:{prod:'ALAMBRE GH 700GR', precio:2.5}, pregunta:'alambre negro 700 gramos precio' },

  // CODO PVC
  { id:'P01', tipo:'exacto',     espera:{prod:'CODO', precio:0.5}, pregunta:'codo pvc 1/2 cuanto vale?' },
  { id:'P02', tipo:'coloquial',  espera:{prod:'CODO', precio:0.5}, pregunta:'necesito un codo de media pulgada para agua fría' },

  // MULTI-PRODUCTO (cemento + cabilla)
  { id:'M01', tipo:'multi',      espera:{prods:['CEMENTO','CABILLA']}, pregunta:'necesito cemento y cabilla 12mm, cuanto tendría que pagar por los dos?' },

  // ESCENARIO NEGATIVO: producto sin stock en esa tienda
  { id:'X01', tipo:'sin_stock',  espera:{noStock:true}, pregunta:'tienen lavadoras o neveras?' },
  // Producto fuera de catálogo
  { id:'X02', tipo:'fuera_catalogo', espera:{noStock:true}, pregunta:'venden pintura epóxica para pisos?' },
];

// ── Helper: enviar webhook y esperar resultado ───────────────────────────────
function apiReq(opts, body) {
  return new Promise((res, rej) => {
    const r = http.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res({status:resp.statusCode,body:d})); });
    r.on('error', rej); if(body) r.write(body); r.end();
  });
}
async function getLatestExec() {
  const r = await apiReq({hostname:'localhost',port:5678,path:'/api/v1/executions?limit=1&includeData=false',method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}});
  return JSON.parse(r.body).data[0];
}
async function getExecData(id) {
  const r = await apiReq({hostname:'localhost',port:5678,path:`/api/v1/executions/${id}?includeData=true`,method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}});
  return JSON.parse(r.body).data;
}

function makePayload(text, from='584246209979@c.us') {
  return JSON.stringify({
    id:'evt_study_'+Date.now(), timestamp:Math.floor(Date.now()/1000), event:'message', session:'default',
    me:{id:'584227898847@c.us',pushName:'Perucho Bot'},
    payload:{id:'msg_'+Date.now(), timestamp:Math.floor(Date.now()/1000), from, fromMe:false, source:'app', body:text, hasMedia:false, _data:{pushName:'Tester'}},
    engine:'NOWEB'
  });
}

// ── Validar respuesta ────────────────────────────────────────────────────────
function validar(respuesta, espera, toolLog) {
  const r = (respuesta||'').toLowerCase();
  const issues = [];
  const ok = [];

  if (espera.prod) {
    const palabras = espera.prod.toLowerCase().split(' ');
    const encontrado = palabras.filter(w=>w.length>3).some(w=>r.includes(w));
    if (encontrado) ok.push('Producto mencionado');
    else issues.push(`No mencionó "${espera.prod}"`);
  }
  if (espera.prods) {
    for (const p of espera.prods) {
      const palabras = p.toLowerCase().split(' ');
      if (palabras.filter(w=>w.length>3).some(w=>r.includes(w))) ok.push(`Producto "${p}" mencionado`);
      else issues.push(`No mencionó "${p}"`);
    }
  }
  if (espera.precio) {
    const priceStr = espera.precio.toString();
    if (r.includes(priceStr) || r.includes('$'+priceStr)) ok.push('Precio correcto mencionado');
    else issues.push(`No mostró precio correcto ($${priceStr})`);
  }
  if (espera.bs) {
    if (r.includes('bs') || r.includes('bolívar') || r.includes('bolivar')) ok.push('Precio en Bs incluido');
    else issues.push('No dio precio en Bs');
    // Verificar recargo 40%: el precio en Bs debe ser > precio_usd * bcv (sin recargo)
    // No podemos calcular exacto sin la tasa, pero buscamos si menciona el recargo
    if (r.includes('40%') || r.includes('recargo')) ok.push('+40% recargo mencionado');
    else issues.push('No mencionó recargo del 40%');
  }
  if (espera.noStock) {
    if (r.includes('no tenemos') || r.includes('no contamos') || r.includes('no disponible') || r.includes('no encontré') || r.includes('no se encontr')) ok.push('Indicó que no hay producto');
    else issues.push('Debió indicar que no hay ese producto');
    // no debe mencionar precio
    if (r.includes('$') && !r.includes('alternativa')) issues.push('Mencionó precio cuando no debía');
  }
  // Verificar que NO muestre productos agotados
  if (toolLog && toolLog.includes('"existencia":0')) issues.push('[WARNING] Herramienta devolvió existencia=0 (filtrar mejor)');

  return { ok, issues, veredicto: issues.length===0 ? '✅ PASS' : '❌ FAIL' };
}

// ── Loop principal ────────────────────────────────────────────────────────────
async function run() {
  console.log('🔬 Iniciando estudio del agente Perucho...\n');
  const resultados = [];

  for (const esc of ESCENARIOS) {
    // Esperar entre pruebas para no sobrecargar el bot (rate limit OpenRouter)
    await sleep(4000);
    const baseline = await getLatestExec();
    const baseId = baseline ? Number(baseline.id) : 0;

    const body = makePayload(esc.pregunta);
    await apiReq({hostname:'localhost',port:5678,path:'/webhook/whatsapp/inbound',method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, body);

    // Esperar ejecución
    let exec = null;
    for (let i=0;i<20;i++) {
      await sleep(2000);
      const e = await getLatestExec();
      if (e && Number(e.id) > baseId && (e.finished || e.status==='error' || e.status==='success')) { exec=e; break; }
    }

    let respuesta='(sin respuesta)', toolLog='', status='timeout';
    if (exec) {
      status = exec.status;
      try {
        const full = await getExecData(exec.id);
        const rd = full.resultData.runData;
        if (rd['AI Agent'] && rd['AI Agent'][0].data && rd['AI Agent'][0].data.main) {
          const d = rd['AI Agent'][0].data.main[0] && rd['AI Agent'][0].data.main[0][0];
          respuesta = d && d.json && d.json.output ? d.json.output : '(vacio)';
        }
        if (rd['buscar_productos_tool']) {
          const t = rd['buscar_productos_tool'][0];
          toolLog = t && t.data && t.data.ai_tool && t.data.ai_tool[0] && t.data.ai_tool[0][0] ? JSON.stringify(t.data.ai_tool[0][0].json) : '';
        }
      } catch(e) { respuesta = 'ERROR: '+e.message; }
    }

    const v = validar(respuesta, esc.espera, toolLog);
    const r = { id:esc.id, tipo:esc.tipo, pregunta:esc.pregunta, respuesta, status, ...v };
    resultados.push(r);

    const emoji = v.veredicto.startsWith('✅') ? '✅' : '❌';
    console.log(`${emoji} [${esc.id}] ${esc.tipo.padEnd(14)} "${esc.pregunta}"`);
    if (v.issues.length) v.issues.forEach(i=>console.log(`       ↳ ${i}`));
  }

  // ── Generar ESTUDIO_AGENTE.md ────────────────────────────────────────────
  const pass = resultados.filter(r=>r.veredicto.startsWith('✅')).length;
  const fail = resultados.filter(r=>!r.veredicto.startsWith('✅')).length;
  const pct  = Math.round(pass / resultados.length * 100);

  let md = `# Estudio de Calidad — Bot Perucho (${new Date().toLocaleDateString('es-VE')})\n\n`;
  md += `## Resumen ejecutivo\n\n`;
  md += `| Métrica | Valor |\n|---|---|\n`;
  md += `| Total escenarios | ${resultados.length} |\n`;
  md += `| ✅ PASS | ${pass} |\n`;
  md += `| ❌ FAIL | ${fail} |\n`;
  md += `| Tasa de éxito | ${pct}% |\n\n`;

  // Agrupar por tipo
  const byTipo = {};
  for (const r of resultados) { (byTipo[r.tipo] = byTipo[r.tipo]||[]).push(r); }
  md += `### Por tipo de prueba\n| Tipo | PASS | FAIL |\n|---|---|---|\n`;
  for (const [tipo, items] of Object.entries(byTipo)) {
    const p=items.filter(i=>i.veredicto.startsWith('✅')).length;
    md += `| ${tipo} | ${p} | ${items.length-p} |\n`;
  }

  md += `\n## Resultados detallados\n\n`;
  for (const r of resultados) {
    md += `### ${r.veredicto} \`${r.id}\` — ${r.tipo}\n`;
    md += `**Pregunta del cliente:** "${r.pregunta}"\n\n`;
    md += `**Respuesta del bot:**\n\`\`\`\n${r.respuesta}\n\`\`\`\n\n`;
    if (r.ok.length) md += `**✓ Correcto:** ${r.ok.join(' · ')}\n\n`;
    if (r.issues.length) md += `**✗ Problemas:** ${r.issues.join(' · ')}\n\n`;
    md += `---\n\n`;
  }

  // ── Plan de mejora ────────────────────────────────────────────────────────
  const tiposFail = [...new Set(resultados.filter(r=>!r.veredicto.startsWith('✅')).map(r=>r.tipo))];
  md += `## Plan de mejora detallado\n\n`;
  md += `### Problemas encontrados y soluciones\n\n`;

  const PLANES = {
    'exacto':      '**Búsqueda exacta falla:** La función `buscar_productos` (RPC PostgreSQL) no devuelve el producto por nombre exacto. → Verificar que la función RPC hace búsqueda `ILIKE %término%` y no solo full-text; considerar agregar `ts_rank` con tokenización en español.',
    'coloquial':   '**Términos coloquiales no resueltos:** El cliente dice "saco de cemento" y el bot no lo mapea. → Añadir un diccionario de sinónimos en el código de la herramienta (cemento→saco, cabilla→hierro/varilla, etc.) o ampliar el prompt del AI Agent con ejemplos de vocabulario ferretero venezolano.',
    'parcial':     '**Búsqueda parcial falla:** El término parcial no activa resultados. → Refinar la función RPC para dividir el término en tokens y hacer OR entre ellos.',
    'ortografia':  '**Errores ortográficos:** "simento" no resuelve a "cemento". → Agregar trigram indexing (`pg_trgm`) en Supabase para búsqueda por similitud fonética/carácter.',
    'bs':          '**Precio en Bs incorrecto o faltante:** El bot no aplica +40% o no muestra el cálculo. → Reforzar instrucción en el prompt y agregar lógica explícita de cálculo en la herramienta BCV.',
    'sin_stock':   '**Manejo de sin-stock:** El bot menciona productos agotados o no ofrece alternativas. → El filtro en buscar_productos_tool (existencia>0) debe ser más agresivo; si no hay resultados con stock, retornar mensaje de "no hay stock".',
    'multi':       '**Consulta multi-producto:** Al preguntar por dos productos, el bot no los busca por separado. → Mejorar el prompt para que el AI Agent llame a buscar_productos dos veces (una por producto) cuando detecte consulta múltiple.',
    'fuera_catalogo': '**Producto fuera de catálogo:** El bot no dice claramente que no lo tiene. → Ajustar el fallback del prompt para que sea más directo al decir que no maneja ese tipo de producto.'
  };

  for (const tipo of tiposFail) {
    if (PLANES[tipo]) md += `#### ${PLANES[tipo]}\n\n`;
  }

  md += `### Roadmap de mejoras (por prioridad)\n\n`;
  md += `| Prioridad | Mejora | Impacto | Esfuerzo |\n|---|---|---|---|\n`;
  md += `| 🔴 Alta | Sinónimos ferreteros venezolanos en prompt/herramienta | Alto | Bajo |\n`;
  md += `| 🔴 Alta | Trigram search (\`pg_trgm\`) en Supabase para errores ortográficos | Alto | Medio |\n`;
  md += `| 🔴 Alta | Recargo +40% Bs: verificar que el cálculo se muestre siempre | Alto | Bajo |\n`;
  md += `| 🟡 Media | Búsqueda multi-token OR en la RPC \`buscar_productos\` | Medio | Medio |\n`;
  md += `| 🟡 Media | Multi-producto: prompt para llamar herramienta 2x | Medio | Bajo |\n`;
  md += `| 🟢 Baja | Cache de top-20 vendidos en Engram para respuesta rápida | Bajo | Bajo |\n\n`;

  md += `### Próximos pasos concretos\n\n`;
  md += `1. **Crear función RPC mejorada** en Supabase que use \`pg_trgm\` + sinónimos.\n`;
  md += `2. **Ampliar diccionario** en \`buscar_productos_tool\`: mapear términos coloquiales antes de llamar a Supabase.\n`;
  md += `3. **Test de regresión**: re-correr este estudio tras cada mejora y comparar las tasas.\n`;
  md += `4. **Engram**: sembrar los 20 más vendidos como memorias de "productos estrella" para que el bot los recuerde sin consultar BD.\n\n`;

  md += `---\n*Generado automáticamente por \`_estudio_agente.js\` — ${new Date().toISOString()}*\n`;

  fs.writeFileSync('C:/Proyect/whatsapp-agent/ESTUDIO_AGENTE.md', md, 'utf8');
  console.log(`\n📊 Resultados: ${pass}/${resultados.length} (${pct}%) PASS`);
  console.log('📄 Informe guardado en ESTUDIO_AGENTE.md');
}

run().catch(e=>console.error('FATAL',e));
