// Patches buscar_productos_tool and hacer_presupuesto_tool so sanitary fixture queries
// (poseta, poceta, inodoro, wc, sanitario, sala sanitaria, juego de bano, sin lavamanos)
// match real in-stock toilets instead of only spare parts (herraje, asiento, tapa...).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_WF_ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';

const SANITARIO_ALIAS_ENTRIES = [
  "  'poceta':         ['poceta','poseta','inodoro','wc','sanitario','sala sanitaria'],",
  "  'poseta':         ['poceta','poseta','inodoro','wc','sanitario','sala sanitaria'],",
  "  'inodoro':        ['inodoro','poceta','poseta','wc','sanitario','sala sanitaria'],",
  "  'wc':             ['wc','poceta','poseta','inodoro','sanitario','sala sanitaria'],",
  "  'sanitario':      ['sanitario','sanitaria','poceta','poseta','inodoro','wc','sala sanitaria'],",
  "  'sanitaria':      ['sanitario','sanitaria','poceta','poseta','inodoro','wc','sala sanitaria']",
].join('\n');

const SANITARIO_EXPANDIR_SNIPPET = `  if (!/\\baccesorios?\\b/.test(s)) {
    if (/^\\s*wc\\s*$/.test(s)) s = 'poceta';
    s = s.replace(/\\b(?:juegos?|salas?)\\s+(?:de\\s+)?ba[nñ]o\\b/g, 'poceta');
    s = s.replace(/\\btazas?\\s+(?:de\\s+ba[nñ]o|sanitarias?)\\b/g, 'poceta');
  }
  if (/\\b(?:pocetas?|posetas?|inodoros?|sanitarios?|wc)\\b/.test(s) && !/\\b(?:herraje|asiento|tapa|tornillos?|canilla|manguera|anillo|aro|cuello|valvula|flapper|balancin|goma|surtidor|flotante|bidet|codo|yee|sifon|tubo|pvc|desague)\\b/.test(s)) {
    s = s.replace(/\\bcomo\\s+tal\\b/g, ' ');
    s = s.replace(/\\bsol[oa]s?\\b/g, ' ');
    s = s.replace(/\\b(?:pero\\s+)?sin\\s+(?:el\\s+)?lavamanos?\\b/g, ' ');
  }
`;

const BUSCAR_SANITARIO_RULE = `// Regla negocio POCETA/SANITARIO: "poseta"/"poceta"/"inodoro"/"wc"/"sanitario"/"juego de bano" a secas
// = el sanitario completo en si, no repuestos ni tuberias (HERRAJE, ASIENTO, TAPA, TORNILLO, FLAPPER, CODO, SIFON...).
// Si el cliente pidio "sin lavamanos", priorizar opciones sin C/LAVAMANO. Si pidio un repuesto por su nombre, no tocar.
{
  const nbq = norm(_pb);
  const accesorioSanitario = /\\b(herraje|asiento|tapa|tornillos?|canilla|manguera|anillo|aro|cuello|valvula|flapper|balancin|goma|surtidor|flotante|bidet|desague|sifon|codo|yee|tee|tubo|pvc|chupa|destapador)\\b/;
  const sanitarioTokens = new Set(['poceta', 'poseta', 'inodoro', 'sanitario', 'sanitaria', 'wc']);
  if (qTokens.some(t => sanitarioTokens.has(t)) && !accesorioSanitario.test(nbq)) {
    let principal = unicos.filter(p => !accesorioSanitario.test(norm(p.descripcion)));
    if (/\\bsin\\s+(?:el\\s+)?lavamanos?\\b/.test(nbq)) {
      const sinLav = principal.filter(p => !/\\bc\\/\\s*lavamanos?\\b|\\bcon\\s+lavamanos?\\b/.test(norm(p.descripcion)));
      if (sinLav.length > 0) principal = sinLav;
    }
    if (principal.length > 0) {
      unicos.length = 0;
      for (const x of principal) unicos.push(x);
    }
  }
}`;

const PRESUPUESTO_SANITARIO_RULE = `  // Regla SANITARIO: sanitario completo vs repuestos/tuberias
  {
    const nbq = norm(nombre);
    const accesorioSanitario = /\\b(herraje|asiento|tapa|tornillos?|canilla|manguera|anillo|aro|cuello|valvula|flapper|balancin|goma|surtidor|flotante|bidet|desague|sifon|codo|yee|tee|tubo|pvc|chupa|destapador)\\b/;
    const sanitarioTokens = new Set(['poceta', 'poseta', 'inodoro', 'sanitario', 'sanitaria', 'wc']);
    if (qTokens.some(t => sanitarioTokens.has(t)) && !accesorioSanitario.test(nbq)) {
      let filt = cand.filter(p => !accesorioSanitario.test(norm(p.descripcion)));
      if (/\\bsin\\s+(?:el\\s+)?lavamanos?\\b/.test(nbq)) {
        const sinLav = filt.filter(p => !/\\bc\\/\\s*lavamanos?\\b|\\bcon\\s+lavamanos?\\b/.test(norm(p.descripcion)));
        if (sinLav.length > 0) filt = sinLav;
      }
      if (filt.length > 0) cand = filt;
    }
  }
`;

function replaceOnce(src, target, replacement, label) {
  if (!src.includes(target)) {
    throw new Error(`Anchor not found for ${label}`);
  }
  return src.replace(target, replacement);
}

function patchCommonAliasAndExpandir(code, label) {
  let out = code.replace(/\r\n/g, '\n');

  if (!out.includes("'poceta':")) {
    out = replaceOnce(
      out,
      "  'acerolit':       ['acerolit','acerolits']\n};",
      `  'acerolit':       ['acerolit','acerolits'],\n${SANITARIO_ALIAS_ENTRIES}\n};`,
      `${label} ALIAS`
    );
  }

  if (!out.includes('como\\s+tal')) {
    out = replaceOnce(
      out,
      '  // SIN se aplica con LIMITE DE PALABRA',
      `${SANITARIO_EXPANDIR_SNIPPET}  // SIN se aplica con LIMITE DE PALABRA`,
      `${label} expandir`
    );
  }

  return out;
}

function patchBuscarCode(code) {
  let out = patchCommonAliasAndExpandir(code, 'buscar_productos_tool');

  if (out.includes("ALIAS[w].map(a=>'descripcion.ilike.*'+a+'*')")) {
    out = replaceOnce(
      out,
      "if (ALIAS[w]) return 'or=(' + ALIAS[w].map(a=>'descripcion.ilike.*'+a+'*').join(',') + ')';",
      "if (ALIAS[w]) return 'or=(' + ALIAS[w].map(a=>'descripcion.ilike.*'+encodeURIComponent(a)+'*').join(',') + ')';",
      'buscar_productos_tool ilike encodeURIComponent'
    );
  }

  if (!out.includes('accesorioSanitario')) {
    const fregTarget =
      "{ const nbq = norm(_pb); const accesorioFregadero = /\\b(desague|l{1,3}ave|grifo|tapa|sifon|tapon|tornillo|herraje|balancin)\\b/; if (qTokens.includes('fregadero') && !accesorioFregadero.test(nbq)) { const principal = unicos.filter(p => !accesorioFregadero.test(norm(p.descripcion))); if (principal.length>0){ unicos.length=0; for(const x of principal) unicos.push(x); } } }";
    out = replaceOnce(
      out,
      fregTarget,
      `${fregTarget}\n\n${BUSCAR_SANITARIO_RULE}`,
      'buscar_productos_tool accesorioSanitario'
    );
  }

  return out;
}

function patchPresupuestoCode(code) {
  let out = patchCommonAliasAndExpandir(code, 'hacer_presupuesto_tool');

  if (!out.includes('const sqlTerm =')) {
    const oldSqlBlock = [
      '  // si hay categoria de texto, trae amplio por categoria y filtra medida en JS',
      '  if (textLargasSql.length>0){',
      "    const q = textLargasSql.map(w => { if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`; return 'descripcion=ilike.*' + encodeURIComponent(w) + '*'; }).join('&');",
      "    if (granelIntent){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&'+GRANEL_OR+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){} }",
      "    if (cand.length===0){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){} }",
      '  }',
      '  // relajacion drop-one: el AND de categoria fallo -> reintenta quitando UNA palabra a la vez.',
      '  // Se empieza por la ULTIMA y NUNCA se suelta la primera: esa es la categoria del producto.',
      '  // Antes iba de 0 en adelante, o sea que lo primero que sacrificaba era el sustantivo',
      '  // principal: "tubo pvc electrico 3/4" quedaba en "pvc electrico 3/4" y cotizaba 28',
      '  // unidades de CINTA AISLANTE ELECTRICO PVC 3/4 en vez de tubos (caso real, 2026-08-04).',
      '  if (cand.length===0 && textLargasSql.length>=2 && textLargasSql.length<=6){',
      '    for (let _i=textLargasSql.length-1; _i>=1 && cand.length===0; _i--){',
      '      const _sub = textLargasSql.filter((_w,_j)=>_j!==_i);',
      "      const q = _sub.map(w => { if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`; return 'descripcion=ilike.*' + encodeURIComponent(w) + '*'; }).join('&');",
      "      try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){}",
      '    }',
      '  }',
      '  // fallback: logica anterior por tokens (incluye medidas en el ilike)',
      '  for (let i=Math.min(largas.length,4); i>=1 && cand.length===0; i--){',
      '    const q = largas.slice(0,i).map(w => {',
      "      if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';",
      "      if (SIZEQ[w]){ const _alts=[]; for (const a of SIZEQ[w]){ _alts.push('descripcion.ilike.*'+a+'*'); if(/mm$/.test(a)) _alts.push('descripcion.ilike.*'+a.replace(/mm$/,' mm')+'*'); } return 'or=('+_alts.join(',')+')'; }",
      "      if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`;",
      "      return 'descripcion=ilike.*' + encodeURIComponent(w) + '*';",
      "    }).join('&');",
    ].join('\n');

    const newSqlBlock = [
      '  // si hay categoria de texto, trae amplio por categoria y filtra medida en JS',
      "  const sqlTerm = w => { if (ALIAS[w]) return 'or=(' + ALIAS[w].map(a=>'descripcion.ilike.*'+encodeURIComponent(a)+'*').join(',') + ')'; if (ACCENTS[w]) return `or=(descripcion.ilike.*${w}*,descripcion.ilike.*${ACCENTS[w]}*)`; return 'descripcion=ilike.*' + encodeURIComponent(w) + '*'; };",
      '  if (textLargasSql.length>0){',
      "    const q = textLargasSql.map(sqlTerm).join('&');",
      "    if (granelIntent){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&'+GRANEL_OR+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){} }",
      "    if (cand.length===0){ try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){} }",
      '  }',
      '  // relajacion drop-one: el AND de categoria fallo -> reintenta quitando UNA palabra a la vez.',
      '  // Se empieza por la ULTIMA y NUNCA se suelta la primera: esa es la categoria del producto.',
      '  // Antes iba de 0 en adelante, o sea que lo primero que sacrificaba era el sustantivo',
      '  // principal: "tubo pvc electrico 3/4" quedaba en "pvc electrico 3/4" y cotizaba 28',
      '  // unidades de CINTA AISLANTE ELECTRICO PVC 3/4 en vez de tubos (caso real, 2026-08-04).',
      '  if (cand.length===0 && textLargasSql.length>=2 && textLargasSql.length<=6){',
      '    for (let _i=textLargasSql.length-1; _i>=1 && cand.length===0; _i--){',
      '      const _sub = textLargasSql.filter((_w,_j)=>_j!==_i);',
      "      const q = _sub.map(sqlTerm).join('&');",
      "      try{ const r=await axios.get(SB+'/rest/v1/productos?select=codigo_interno,descripcion,precio_venta,existencia&'+q+'&order=existencia.desc.nullslast&limit=1000',{headers:H}); cand=r.data||[]; }catch(e){}",
      '    }',
      '  }',
      '  // fallback: logica anterior por tokens (incluye medidas en el ilike)',
      '  for (let i=Math.min(largas.length,4); i>=1 && cand.length===0; i--){',
      '    const q = largas.slice(0,i).map(w => {',
      "      if (w === 'corte') return 'or=(descripcion.ilike.*corte*,descripcion.ilike.*c/*)';",
      "      if (SIZEQ[w]){ const _alts=[]; for (const a of SIZEQ[w]){ _alts.push('descripcion.ilike.*'+a+'*'); if(/mm$/.test(a)) _alts.push('descripcion.ilike.*'+a.replace(/mm$/,' mm')+'*'); } return 'or=('+_alts.join(',')+')'; }",
      '      return sqlTerm(w);',
      "    }).join('&');",
    ].join('\n');

    out = replaceOnce(out, oldSqlBlock, newSqlBlock, 'hacer_presupuesto_tool sqlTerm');
  }

  if (!out.includes('accesorioSanitario')) {
    out = replaceOnce(
      out,
      '  // Regla CEMENTO',
      `${PRESUPUESTO_SANITARIO_RULE}\n  // Regla CEMENTO`,
      'hacer_presupuesto_tool accesorioSanitario'
    );
  }

  if (out.includes('if (!textLargas.some(t => w0.includes(t))) return null;')) {
    out = replaceOnce(
      out,
      'if (!textLargas.some(t => w0.includes(t))) return null;',
      'if (!textLargas.some(t => aliasDe(t).some(a => w0.includes(a)))) return null;',
      'hacer_presupuesto_tool aliasDe check'
    );
  }

  return out;
}

function patchWorkflow(wf) {
  let changed = false;
  for (const [name, fn] of [
    ['buscar_productos_tool', patchBuscarCode],
    ['hacer_presupuesto_tool', patchPresupuestoCode],
  ]) {
    const node = (wf.nodes || []).find((n) => n.name === name);
    if (!node) throw new Error(`Node "${name}" not found`);
    const nextCode = fn(node.parameters.jsCode);
    if (nextCode !== node.parameters.jsCode.replace(/\r\n/g, '\n')) {
      node.parameters.jsCode = nextCode;
      changed = true;
    }
  }
  return changed;
}

function patchJsonFile(relPath) {
  const full = path.join(ROOT, relPath);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  const changed = patchWorkflow(wf);
  if (changed) {
    fs.writeFileSync(full, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  }
  console.log(`${relPath}: ${changed ? 'updated' : 'already up to date'}`);
}

async function patchLiveWorkflow(id) {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const key = ((env.match(/^N8N_API_KEY=(.+)$/m) || [])[1] || '').trim();
  if (!key) throw new Error('N8N_API_KEY missing in .env');
  const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json' };

  const wf = await (await fetch(`${BASE}/workflows/${id}`, { headers: H })).json();
  const changed = patchWorkflow(wf);
  if (!changed) {
    console.log(`n8n live (${id}): already up to date (active=${wf.active})`);
    return;
  }

  const ALLOWED = [
    'saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution',
    'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder',
  ];
  const cs = {};
  for (const k of ALLOWED) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';

  const put = await fetch(`${BASE}/workflows/${id}`, {
    method: 'PUT',
    headers: H,
    body: JSON.stringify({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs }),
  });
  if (!put.ok) throw new Error(`PUT ${id} failed: ${put.status} ${await put.text()}`);
  const after = await (await fetch(`${BASE}/workflows/${id}`, { headers: H })).json();
  console.log(`n8n live (${id}): updated (HTTP ${put.status}, active=${after.active})`);
}

module.exports = { patchBuscarCode, patchPresupuestoCode, patchWorkflow };

if (require.main === module) {
  (async () => {
    patchJsonFile('workflows/production-baseline.json');
    patchJsonFile('n8n_workflow.json');
    if (!process.argv.includes('--files-only')) {
      await patchLiveWorkflow(MAIN_WF_ID);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
