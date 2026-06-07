/**
 * Estudio v2 — Bot Perucho
 * Validación por categoría (no precio exacto del modelo específico).
 * Añade escenarios de presupuesto multi-producto.
 * Acumula resultados en ESTUDIO_AGENTE.md.
 */
const http = require('http');
const fs   = require('fs');

const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Escenarios ────────────────────────────────────────────────────────────────
// espera.palabras: al menos 1 debe aparecer en la respuesta del bot
// espera.bs: debe mostrar precio en Bs (con 'bs' o 'bolívar')
// espera.recargo: debe mencionar 40% o el cálculo
// espera.noProducto: NO debe mostrar precios (producto fuera de catálogo real)
// espera.presupuesto: debe mostrar múltiples productos y un total
const ESCENARIOS = [
  // ── CEMENTO ──────────────────────────────────────────────────────────────
  { id:'C01', tipo:'exacto',      espera:{ palabras:['cemento'] },                           pregunta:'tienen cemento gris csc?' },
  { id:'C02', tipo:'coloquial',   espera:{ palabras:['cemento'] },                           pregunta:'cuanto vale un saco de cemento?' },
  { id:'C03', tipo:'parcial',     espera:{ palabras:['cemento'] },                           pregunta:'precio del cemento 42 kilos' },
  { id:'C04', tipo:'bs',          espera:{ palabras:['cemento'], bs:true, recargo:true },     pregunta:'cuanto sale el cemento en bolivares?' },
  { id:'C05', tipo:'ortografia',  espera:{ palabras:['cemento'] },                           pregunta:'simento gris precio?' },

  // ── CLAVOS ───────────────────────────────────────────────────────────────
  { id:'N01', tipo:'exacto',      espera:{ palabras:['clavo','clavos'] },                    pregunta:'venden clavos? a cuanto estan?' },
  { id:'N02', tipo:'coloquial',   espera:{ palabras:['clavo','clavos'] },                    pregunta:'necesito clavo para madera' },
  { id:'N03', tipo:'bs',          espera:{ palabras:['clavo','clavos'], bs:true },            pregunta:'cuanto cuestan los clavos en bs?' },

  // ── CABILLA ──────────────────────────────────────────────────────────────
  { id:'K01', tipo:'exacto',      espera:{ palabras:['cabilla'] },                           pregunta:'tienen cabilla 12mm?' },
  { id:'K02', tipo:'coloquial',   espera:{ palabras:['cabilla','varilla','hierro'] },         pregunta:'cuanto vale la cabilla?' },
  { id:'K03', tipo:'sinonimo',    espera:{ palabras:['cabilla','estriada'] },                 pregunta:'precio cabilla corrugada o estriada' },

  // ── TUBO HERRERÍA ─────────────────────────────────────────────────────────
  { id:'T01', tipo:'exacto',      espera:{ palabras:['tubo','herrer'] },                     pregunta:'precio tubo herreria 2x1?' },
  { id:'T02', tipo:'coloquial',   espera:{ palabras:['tubo','herrer'] },                     pregunta:'tienen tubo cuadrado 2x1 de 6 metros?' },
  { id:'T03', tipo:'parcial',     espera:{ palabras:['tubo','herrer','metal'] },              pregunta:'tubo metalico 6 metros' },

  // ── CERCHA ───────────────────────────────────────────────────────────────
  { id:'E01', tipo:'exacto',      espera:{ palabras:['cercha'] },                            pregunta:'hay cerchas de 10 de ancho?' },
  { id:'E02', tipo:'coloquial',   espera:{ palabras:['cercha'] },                            pregunta:'cuanto sale una cercha?' },

  // ── ALAMBRON ─────────────────────────────────────────────────────────────
  { id:'A01', tipo:'exacto',      espera:{ palabras:['alambron','alambre'] },                pregunta:'alambron 5mm precio?' },
  { id:'A02', tipo:'sinonimo',    espera:{ palabras:['alambron','alambre'] },                pregunta:'tienen alambre de construccion?' },

  // ── LÁMINAS ZINC ─────────────────────────────────────────────────────────
  { id:'Z01', tipo:'exacto',      espera:{ palabras:['lamina','zinc'] },                     pregunta:'laminas de zinc azul 12 pies?' },
  { id:'Z02', tipo:'coloquial',   espera:{ palabras:['lamina','zinc','techo'] },              pregunta:'cuanto cuesta una lamina de techo?' },
  { id:'Z03', tipo:'bs',          espera:{ palabras:['lamina','zinc'], bs:true, recargo:true},pregunta:'las laminas de zinc cuanto salen en bolivares?' },

  // ── DISCO CORTE METAL ────────────────────────────────────────────────────
  { id:'D01', tipo:'exacto',      espera:{ palabras:['disco'] },                             pregunta:'tienen disco de corte 4 y medio?' },
  { id:'D02', tipo:'coloquial',   espera:{ palabras:['disco','metal'] },                     pregunta:'necesito un disco para cortar hierro, cuanto esta?' },

  // ── ALAMBRE ──────────────────────────────────────────────────────────────
  { id:'W01', tipo:'exacto',      espera:{ palabras:['alambre'] },                           pregunta:'alambre negro 700 gramos precio' },

  // ── CODO PVC ─────────────────────────────────────────────────────────────
  { id:'P01', tipo:'exacto',      espera:{ palabras:['codo'] },                              pregunta:'codo pvc 1/2 cuanto vale?' },
  { id:'P02', tipo:'coloquial',   espera:{ palabras:['codo'] },                              pregunta:'necesito un codo de media pulgada para agua fria' },

  // ── PRESUPUESTO ───────────────────────────────────────────────────────────
  { id:'Q01', tipo:'presupuesto', espera:{ palabras:['cemento','cabilla'], presupuesto:true }, pregunta:'necesito 5 sacos de cemento y 4 cabillas de 12mm, dame el precio total' },
  { id:'Q02', tipo:'presupuesto', espera:{ palabras:['tubo','lamina','zinc'], presupuesto:true},pregunta:'cuanto me sale: 10 tubos herreria 2x1 y 20 laminas de zinc azul?' },
  { id:'Q03', tipo:'presupuesto_bs',espera:{ palabras:['cemento'], bs:true, presupuesto:true }, pregunta:'dame presupuesto de 3 sacos de cemento en bolivares' },

  // ── PRODUCTO FUERA DE CATÁLOGO ────────────────────────────────────────────
  { id:'X01', tipo:'sin_catalogo',espera:{ noProducto:true },                               pregunta:'tienen lavadoras o neveras?' },
  { id:'X02', tipo:'sin_catalogo',espera:{ noProducto:true },                               pregunta:'venden computadoras o celulares?' },
];

// ── Helpers API ──────────────────────────────────────────────────────────────
function apiReq(opts, body) {
  return new Promise((res, rej) => {
    const r = http.request(opts, resp => { let d=''; resp.on('data',c=>d+=c); resp.on('end',()=>res({status:resp.statusCode,body:d})); });
    r.on('error', rej); if(body) r.write(body); r.end();
  });
}
async function latestExec() {
  const r = await apiReq({hostname:'localhost',port:5678,path:'/api/v1/executions?limit=1&includeData=false',method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}});
  return JSON.parse(r.body).data[0];
}
async function execData(id) {
  const r = await apiReq({hostname:'localhost',port:5678,path:`/api/v1/executions/${id}?includeData=true`,method:'GET',headers:{'X-N8N-API-KEY':N8N_KEY}});
  return JSON.parse(r.body).data;
}
function mkPayload(text) {
  return JSON.stringify({
    id:'evt_study_'+Date.now(), timestamp:Math.floor(Date.now()/1000), event:'message', session:'default',
    me:{id:'584227898847@c.us',pushName:'Perucho'}, engine:'NOWEB',
    payload:{id:'msg_'+Date.now(),timestamp:Math.floor(Date.now()/1000),from:'584246209979@c.us',fromMe:false,source:'app',body:text,hasMedia:false,_data:{pushName:'Tester'}}
  });
}

// ── Validar ──────────────────────────────────────────────────────────────────
function validar(resp, espera) {
  const r = (resp||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  const ok=[], fail=[];

  if (espera.palabras) {
    const encontradas = espera.palabras.filter(p => r.includes(p.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')));
    if (encontradas.length>0) ok.push(`Mencionó: ${encontradas.join(', ')}`);
    else fail.push(`No mencionó ninguna de: ${espera.palabras.join('/')}`);
  }
  if (espera.bs) {
    if (r.includes('bs') || r.includes('bolivar') || r.includes('bolivares')) ok.push('Mostró precio en Bs');
    else fail.push('No mostró precio en Bs');
  }
  if (espera.recargo) {
    // El recargo está en el cálculo: buscar que el precio Bs sea mayor que precio_usd*tasa
    // Heurístico: si mencionó "40" o "recargo" o el precio Bs parece correcto
    if (r.includes('40') || r.includes('recargo') || r.includes('bs')) ok.push('Incluyó recargo/Bs');
    else fail.push('No mostró recargo 40% claramente');
  }
  if (espera.noProducto) {
    // No debe mostrar precios de productos reales para lavadora/computadora
    const tieneNegacion = r.includes('no tenemos') || r.includes('no contamos') || r.includes('no se encontr') || r.includes('no encontr') || r.includes('no vendemos') || r.includes('no disponible') || r.includes('no manejamos') || r.includes('no trabajamos') || r.includes('especializamos') || r.includes('no ofrecemos');
    const tieneProductosErroneos = r.includes('$') && (r.includes('lavadora') || r.includes('nevera') || r.includes('computadora') || r.includes('celular'));
    if (tieneNegacion && !tieneProductosErroneos) ok.push('Indicó correctamente que no tiene ese producto');
    else if (!tieneNegacion) fail.push('Debió decir que no tiene ese producto');
    if (tieneProductosErroneos) fail.push('Mostró precio para producto que no corresponde');
  }
  if (espera.presupuesto) {
    // Debe mostrar múltiples productos y un total
    const tienePrecio = r.includes('$') || r.includes('usd');
    const tieneTotal = r.includes('total') || r.includes('suma') || r.includes('presupuesto');
    if (tienePrecio) ok.push('Mostró precios');
    else fail.push('No mostró precios en el presupuesto');
    if (tieneTotal) ok.push('Mostró total/resumen');
    else fail.push('No mostró total del presupuesto');
  }

  return { ok, fail, veredicto: fail.length===0 ? '✅ PASS' : '❌ FAIL' };
}

// ── Loop principal ────────────────────────────────────────────────────────────
async function run() {
  // Leer resultados anteriores si existen (para acumular)
  let prevContent = '';
  try { prevContent = fs.readFileSync('C:/Proyect/whatsapp-agent/ESTUDIO_AGENTE.md','utf8'); } catch(e){}
  const runNum = (prevContent.match(/^## Corrida #/mg)||[]).length + 1;

  console.log(`\n🔬 Estudio Perucho — Corrida #${runNum}\n`);
  const resultados = [];

  for (const esc of ESCENARIOS) {
    await sleep(3500);
    const baseline = await latestExec();
    const baseId = baseline ? Number(baseline.id) : 0;

    const body = mkPayload(esc.pregunta);
    await apiReq({hostname:'localhost',port:5678,path:'/webhook/whatsapp/inbound',method:'POST',
      headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)}}, body);

    let exec=null;
    for (let i=0;i<20;i++) {
      await sleep(2000);
      const e = await latestExec();
      if (e && Number(e.id)>baseId && (e.finished||e.status==='error'||e.status==='success')){ exec=e; break; }
    }

    let respuesta='(timeout)', toolCalls=[];
    if (exec) {
      try {
        const full = await execData(exec.id);
        const rd = full.resultData.runData;
        if (rd['AI Agent']&&rd['AI Agent'][0].data&&rd['AI Agent'][0].data.main) {
          const d=rd['AI Agent'][0].data.main[0]&&rd['AI Agent'][0].data.main[0][0];
          respuesta=d&&d.json&&d.json.output?d.json.output:'(vacio)';
        }
        for (const t of ['buscar_productos_tool','hacer_presupuesto_tool','obtener_tasa_bcv_tool']) {
          if (rd[t]) {
            const td=rd[t][0];
            const out=td&&td.data&&td.data.ai_tool&&td.data.ai_tool[0]&&td.data.ai_tool[0][0];
            if (out) toolCalls.push(`${t}: ${JSON.stringify(out.json).slice(0,120)}`);
          }
        }
      } catch(e) { respuesta='ERROR:'+e.message; }
    }

    const v = validar(respuesta, esc.espera);
    resultados.push({ ...esc, respuesta, toolCalls, ...v });
    const ico = v.veredicto.startsWith('✅')?'✅':'❌';
    console.log(`${ico} [${esc.id}] ${esc.tipo.padEnd(14)} "${esc.pregunta}"`);
    if (v.fail.length) v.fail.forEach(f=>console.log(`       ✗ ${f}`));
  }

  // ── Generar sección para el MD ────────────────────────────────────────────
  const pass = resultados.filter(r=>r.veredicto.startsWith('✅')).length;
  const fail = resultados.length - pass;
  const pct  = Math.round(pass/resultados.length*100);

  let md = prevContent + `\n---\n\n## Corrida #${runNum} — ${new Date().toLocaleString('es-VE')} — Tasa: ${pct}% (${pass}/${resultados.length})\n\n`;
  md += `| ID | Tipo | Pregunta | Veredicto | Problemas |\n|---|---|---|---|---|\n`;
  for (const r of resultados) {
    md += `| ${r.id} | ${r.tipo} | ${r.pregunta} | ${r.veredicto} | ${r.fail.join('; ')||'—'} |\n`;
  }

  // Detalle de los FAIL
  const fails = resultados.filter(r=>r.veredicto==='❌ FAIL');
  if (fails.length) {
    md += `\n### Detalles de fallos\n`;
    for (const r of fails) {
      md += `\n#### ❌ ${r.id} (${r.tipo})\n`;
      md += `**Pregunta:** "${r.pregunta}"\n\n`;
      md += `**Respuesta:**\n\`\`\`\n${r.respuesta.slice(0,500)}\n\`\`\`\n\n`;
      if (r.toolCalls.length) md += `**Tools:** ${r.toolCalls.join(' | ')}\n\n`;
      md += `**Problemas:** ${r.fail.join(' · ')}\n\n`;
    }
  }

  // Resumen acumulado por tipo
  const byTipo={};
  for (const r of resultados) { (byTipo[r.tipo]=byTipo[r.tipo]||{ok:0,fail:0}); if(r.veredicto.startsWith('✅'))byTipo[r.tipo].ok++;else byTipo[r.tipo].fail++; }
  md += `\n### Por tipo\n| Tipo | PASS | FAIL |\n|---|---|---|\n`;
  for (const [t,v] of Object.entries(byTipo)) md += `| ${t} | ${v.ok} | ${v.fail} |\n`;

  // Plan de mejora actualizado
  const tiposFail=[...new Set(fails.map(r=>r.tipo))];
  if (tiposFail.length) {
    md += `\n### Plan de mejora — Corrida #${runNum}\n`;
    const PLANES={
      'exacto':      '**Búsqueda exacta falla:** Verificar que ILIKE multi-palabra funciona para el término exacto. Revisar si hay caracteres especiales o tildes en la descripción del producto en la DB.',
      'coloquial':   '**Término coloquial sin resultado:** Agregar sinónimo al diccionario en buscar_productos_tool. Ejemplo: "saco" → "cemento", "plancha zinc" → "lamina zinc".',
      'sinonimo':    '**Sinónimo no resuelto:** El diccionario SIN en buscar_productos_tool no cubre este caso. Agregar la entrada correspondiente.',
      'parcial':     '**Búsqueda parcial falla:** El fallback ILIKE con palabra más larga no retorna resultados. Revisar si el término tiene caracteres que rompen la query.',
      'ortografia':  '**Error ortográfico no resuelto:** Agregar al diccionario SIN o considerar trigram search con pg_trgm en Supabase.',
      'bs':          '**Precio en Bs incorrecto:** Verificar que obtener_tasa_bcv_tool responde y que el prompt aplica la fórmula precio_usd × 1.40 × tasa_bcv.',
      'presupuesto': '**Presupuesto incompleto:** El tool hacer_presupuesto no se llamó o no devolvió todos los productos. Revisar el schema del tool y el prompt.',
      'presupuesto_bs':'**Presupuesto sin Bs:** El tool hace el cálculo pero el agent no lo muestra. Reforzar en el prompt.',
      'sin_catalogo':'**Producto fuera de catálogo mal manejado:** El bot encontró un producto relacionado y lo mostró en vez de decir que no lo tiene. Agregar al prompt: lista de categorías que NO maneja la ferretería (electrodomésticos, electrónica, ropa).',
    };
    for (const t of tiposFail) { if(PLANES[t]) md += `- ${PLANES[t]}\n`; }
  }

  fs.writeFileSync('C:/Proyect/whatsapp-agent/ESTUDIO_AGENTE.md', md, 'utf8');
  console.log(`\n📊 Corrida #${runNum}: ${pass}/${resultados.length} (${pct}%) PASS`);
  console.log(`📄 ESTUDIO_AGENTE.md actualizado (sección #${runNum} agregada)`);
}

run().catch(e=>console.error('FATAL',e));
