// Patches buscar_productos_tool, hacer_presupuesto_tool, AI Agent systemMessage, and
// enviar_catalogo_pintura_tool so that:
// 1. "pintura para piso" / "pintura de piso" maps to "oxido piso" (OXIDO P/PISO) instead of
//    falling back to Pintura de Aceite.
// 2. When the requested color of OXIDO P/PISO is out of stock (e.g. Negro), available colors
//    in stock (Amarillo, Azul, Rojo) are returned with an honest out-of-stock notice.
// 3. enviar_catalogo_pintura is blocked for oil/enamel paint ("de aceite", "esmalte") and
//    floor oxide/paint ("para piso", "oxido") unless explicitly requested.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MAIN_WF_ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';

const EXPANDIR_PISO_SNIPPET = `  if (/\\bpinturas?\\b/.test(s) && /\\bpisos?\\b/.test(s) && !/\\b(?:aceite|esmalte|caucho|epoxic\\w*|trafico|satinad\\w*)\\b/.test(s)) {
    s = s.replace(/\\bpinturas?\\s+en\\s+polvo\\b/g, 'oxido');
    s = s.replace(/\\bpinturas?\\b/g, 'oxido');
  }
  s = s.replace(/\\bsera\\s+(?:para|de)\\s+pisos?\\b/g, 'cera para piso');
`;

const BUSCAR_OXIDO_PISO_RULE = `// Regla negocio OXIDO P/PISO: si pidio oxido/pintura para piso en un color especifico
// y ese color esta agotado, traer los colores de OXIDO P/PISO disponibles en stock.
let _oxidoColorAgotado = null;
if (qTokens.includes('oxido') && qTokens.includes('piso')) {
  const _oxidoSolo = unicos.filter(p => /\\boxido\\b/i.test(norm(p.descripcion)) && /\\bpiso\\b/i.test(norm(p.descripcion)));
  if (_oxidoSolo.length > 0) {
    unicos.length = 0;
    for (const x of _oxidoSolo) unicos.push(x);
  }
  const _hayStockOx = unicos.some(p => Number(p.existencia) > 0);
  if (!_hayStockOx) {
    const _allOx = casanDeVerdad(await ilike(['oxido', 'piso'], 60), ['oxido', 'piso']);
    const _enStock = _allOx.filter(p => Number(p.existencia) > 0);
    if (_enStock.length > 0) {
      unicos.length = 0;
      for (const x of _enStock) unicos.push(x);
      const _rawColor = (norm(_pb).match(/\\b(negro|negra|blanco|blanca|gris|azul|rojo|roja|verde|amarillo|amarilla|beige|marfil)\\b/) || [])[1];
      _oxidoColorAgotado = _rawColor || _dropped || 'ese color';
    }
  }
}`;

const CATALOGO_QUERY_GUARD = `
let userQuery = '';
try {
  userQuery = String($('Prepare Conversation Context').first().json.conversation_context.query || '');
} catch (e) {}
const uqNorm = userQuery.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
const pidioCatalogoExplicit = /\\b(catalogo|carta\\s+de\\s+colores|paleta|floripaint)\\b/.test(uqNorm);
if (uqNorm && !pidioCatalogoExplicit) {
  const esAceiteOFloor = /\\b(aceite|esmalte|oxido|piso|pisos|cera|el\\s+pro)\\b/.test(uqNorm);
  if (esAceiteOFloor) {
    return JSON.stringify({
      enviado: false,
      bloqueado: true,
      resultado: 'El catálogo PDF de Floripaint NO aplica para pintura de aceite, esmalte ni óxido/pintura para piso. No se envió el PDF; responde al cliente solo con los productos encontrados.'
    });
  }
}
`;

function replaceOnce(src, target, replacement, label) {
  if (!src.includes(target)) {
    throw new Error(`Anchor not found for ${label}`);
  }
  return src.replace(target, replacement);
}

function patchExpandir(code, label) {
  let out = code.replace(/\r\n/g, '\n');
  if (!out.includes("s = s.replace(/\\bpinturas?\\s+en\\s+polvo\\b/g, 'oxido')")) {
    out = replaceOnce(
      out,
      '  // SIN se aplica con LIMITE DE PALABRA',
      `${EXPANDIR_PISO_SNIPPET}  // SIN se aplica con LIMITE DE PALABRA`,
      `${label} expandir`
    );
  }
  return out;
}

function patchBuscarCode(code) {
  let out = patchExpandir(code, 'buscar_productos_tool');

  if (!out.includes('_esOxidoPisoQuery')) {
    out = replaceOnce(
      out,
      "const isPaintQuery = qTokens.includes('pintura') || /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(norm(_pb));",
      "const _esOxidoPisoQuery = qTokens.includes('oxido') && qTokens.includes('piso');\nconst isPaintQuery = !_esOxidoPisoQuery && (qTokens.includes('pintura') || /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(norm(_pb)));",
      'buscar_productos_tool isPaintQuery'
    );

    out = replaceOnce(
      out,
      "  const isPaint = /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(nbq) || qTokens.includes('pintura');",
      "  const isPaint = !_esOxidoPisoQuery && (/\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(nbq) || qTokens.includes('pintura'));",
      'buscar_productos_tool isPaint'
    );
  }

  if (!out.includes('_oxidoColorAgotado')) {
    out = replaceOnce(
      out,
      '// Regla negocio PINTURA:',
      `${BUSCAR_OXIDO_PISO_RULE}\n\n// Regla negocio PINTURA:`,
      'buscar_productos_tool _oxidoColorAgotado rule'
    );

    out = replaceOnce(
      out,
      '} else if (_dropped){',
      "} else if (_oxidoColorAgotado){\n  _out.parcial = true;\n  _out.instruccion = 'El óxido para piso en color \"' + _oxidoColorAgotado + '\" está agotado por ahora, pero SÍ tenemos óxido para piso disponible en estos otros colores. Aclara con honestidad que ese color está agotado y ofrece estas opciones de colores disponibles.';\n} else if (_dropped){",
      'buscar_productos_tool _oxidoColorAgotado instruction'
    );

    const sdTarget = "Object.assign(_out, searchDecision(_rescate ? 'semantic' : _weak ? 'weak' : medMismatch ? 'measure_mismatch' : medParcial ? 'multiple_measures' : _fuzzy ? 'approximate' : _dropped ? 'relaxed' : 'exact'));\nawait qualifyProductCandidates({ axios, env: typeof $env !== 'undefined' ? $env : process.env, query: p_busqueda, candidates: unicos, output: _out, eligible: !_out.aclarar && !_weak && !medMismatch && !medParcial && !!(_rescate || _fuzzy || _dropped) });";
    if (out.includes(sdTarget)) {
      out = replaceOnce(
        out,
        sdTarget,
        "Object.assign(_out, searchDecision(_rescate ? 'semantic' : _weak ? 'weak' : medMismatch ? 'measure_mismatch' : medParcial ? 'multiple_measures' : _fuzzy ? 'approximate' : (_oxidoColorAgotado || _dropped) ? 'relaxed' : 'exact'));\n_out.atributo_ignorado = !!_oxidoColorAgotado;\nawait qualifyProductCandidates({ axios, env: typeof $env !== 'undefined' ? $env : process.env, query: p_busqueda, candidates: unicos, output: _out, eligible: !_out.aclarar && !_weak && !medMismatch && !medParcial && !!(_rescate || _fuzzy || _oxidoColorAgotado || _dropped) });\ndelete _out.atributo_ignorado;",
        'buscar_productos_tool searchDecision'
      );
    }
  }

  return out;
}

function patchPresupuestoCode(code) {
  let out = patchExpandir(code, 'hacer_presupuesto_tool');

  if (!out.includes('_esOxidoPisoQuery')) {
    out = replaceOnce(
      out,
      "  const isPaintQuery = qTokens.includes('pintura') || /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(norm(nombre));",
      "  const _esOxidoPisoQuery = qTokens.includes('oxido') && qTokens.includes('piso');\n  const isPaintQuery = !_esOxidoPisoQuery && (qTokens.includes('pintura') || /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(norm(nombre)));",
      'hacer_presupuesto_tool isPaintQuery'
    );

    out = replaceOnce(
      out,
      "    const isPaint = /\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(nbq) || qTokens.includes('pintura');",
      "    const isPaint = !_esOxidoPisoQuery && (/\\b(pinturas?|esmalte|esmaltes|satinad\\w*|caucho|oleo|anticorrosiv\\w*|sellafill|imperflex|impermeabilizante|spray|aerosol)\\b/.test(nbq) || qTokens.includes('pintura'));",
      'hacer_presupuesto_tool isPaint'
    );
  }

  return out;
}

function patchAgentSystemMessage(sm) {
  let out = sm.replace(/\r\n/g, '\n');

  const oldP2 =
    '  (2) Consultas de pintura por color específico (la herramienta devuelve productos con opciones de ese color): muestra las opciones en ese color con la estructura de producto (nombre, disponibilidad, precio divisas y precio Bs), y pregúntale cuál prefiere.';
  const newP2 =
    '  (2) Consultas de pintura por color específico (la herramienta devuelve productos con opciones de ese color): muestra las opciones en ese color con la estructura de producto (nombre, disponibilidad, precio divisas y precio Bs), y pregúntale cuál prefiere. NO llames a enviar_catalogo_pintura salvo que el cliente pida explícitamente el catálogo, carta de colores o la marca Floripaint.';
  if (!out.includes('NO llames a enviar_catalogo_pintura salvo que el cliente pida explícitamente')) {
    out = replaceOnce(out, oldP2, newP2, 'AI Agent PINTURAS (2)');
  }

  const oldMulti =
    '- CONSERVA los términos exactos del cliente al buscar o cotizar (marcas, medidas, modelos como "CSC", "12mm", "Catatumbo", "Ingco"). NO los simplifiques ni los quites: si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".';
  const newMulti =
    oldMulti +
    '\n- VARIOS PRODUCTOS/COLORES EN EL MISMO MENSAJE: si el cliente pregunta precio o disponibilidad de 2 o más productos o colores distintos sin pedir presupuesto total (ej. "aceite blanco 1/4 y naranja 1/4"), llama buscar_productos para CADA uno y responde con todos.';
  if (!out.includes('VARIOS PRODUCTOS/COLORES EN EL MISMO MENSAJE')) {
    out = replaceOnce(out, oldMulti, newMulti, 'AI Agent multi-item search rule');
  }

  if (out.includes('═══ CATÁLOGO EN PDF DE PINTURAS FLORIPAINT')) {
    const oldCatRules = [
      'REGLAS ESTRICTAS DE ACTIVACIÓN (IMPORTANTE: EVITAR ENVIAR CATÁLOGOS EN OTROS PRODUCTOS):',
      '1. CONDICIÓN OBLIGATORIA: El mensaje ACTUAL del cliente DEBE contener explícitamente palabras sobre pintura (ej: "pintura", "pinturas", "galón", "cuñete", "caucho", "satinado", "esmalte", "carta de colores", "catálogo de pintura", "Floripaint").',
      '2. PROHIBICIÓN ABSOLUTA (CAMBIO DE TEMA): Si el cliente preguntó por CUALQUIER otro producto (ej. ángulos, hierro, cabillas, cemento, tornillos, tubos, cerraduras, herramientas) o si vas a pedir ayuda/escalar ([PEDIR_AYUDA] o [ESCALAR_HUMANO]), ESTÁ TERMINANTEMENTE PROHIBIDO LLAMAR A `enviar_catalogo_pintura`.',
    ].join('\n');

    const newCatRules = [
      'REGLAS ESTRICTAS DE ACTIVACIÓN (MUY IMPORTANTE — NO ENVIAR EN ACEITE, ÓXIDOS NI OTROS PRODUCTOS):',
      '1. CONDICIÓN OBLIGATORIA (SOLO CAUCHO/SATINADA GENERAL O PEDIDO EXPLÍCITO): Llama a `enviar_catalogo_pintura` ÚNICAMENTE cuando (a) `buscar_productos` devuelva `modo_resumen_pintura: true` (consulta general de pinturas, clases, marcas o paleta de colores), O (b) el cliente pida explícitamente el **catálogo**, **carta de colores**, **paleta** o pregunte por la marca **Floripaint**.',
      '2. PROHIBICIÓN ABSOLUTA EN ACEITE, PISO Y PRODUCTOS PUNTUALES: ESTÁ TERMINANTEMENTE PROHIBIDO llamar `enviar_catalogo_pintura` cuando el cliente pida **pintura de aceite / esmalte** ("en aceite", "de aceite", "esmalte", El Pro), **pintura / óxido / polvo para piso**, un producto puntual ya específico (ej. "pintura de aceite blanco 1/4"), cualquier otro producto que no sea pintura, o si vas a pedir ayuda/escalar ([PEDIR_AYUDA] o [ESCALAR_HUMANO]).',
    ].join('\n');

    if (!out.includes('PROHIBICIÓN ABSOLUTA EN ACEITE, PISO Y PRODUCTOS PUNTUALES')) {
      out = replaceOnce(out, oldCatRules, newCatRules, 'AI Agent CATÁLOGO rules');
    }
  }

  return out;
}

function patchCatalogTool(node) {
  let changed = false;
  const newDesc =
    "Envía el catálogo oficial en PDF de pinturas Floripaint (caucho/satinada) con la carta de colores y precios según la forma de pago del cliente. Parámetro obligatorio: metodo_pago ('divisas' para pago en dólares, 'bcv' para pago en bolívares a tasa oficial BCV). Úsalo SOLO cuando buscar_productos devuelva modo_resumen_pintura: true o el cliente pida explícitamente la carta de colores, paleta, catálogo o la marca Floripaint. PROHIBIDO usarlo para pintura de aceite/esmalte o pintura/óxido para piso.";
  if (node.parameters.description !== newDesc) {
    node.parameters.description = newDesc;
    changed = true;
  }

  let js = String(node.parameters.jsCode || '').replace(/\r\n/g, '\n');
  if (!js.includes('esAceiteOFloor')) {
    js = replaceOnce(
      js,
      "if (!chatId) {\n  return JSON.stringify({ enviado: false, error: 'No se pudo identificar el teléfono del cliente' });\n}",
      "if (!chatId) {\n  return JSON.stringify({ enviado: false, error: 'No se pudo identificar el teléfono del cliente' });\n}\n" +
        CATALOGO_QUERY_GUARD,
      'enviar_catalogo_pintura_tool jsCode guard'
    );
    node.parameters.jsCode = js;
    changed = true;
  }
  return changed;
}

function patchWorkflow(wf, { includeCatalogAndAgent = true } = {}) {
  let changed = false;
  for (const [name, fn] of [
    ['buscar_productos_tool', patchBuscarCode],
    ['hacer_presupuesto_tool', patchPresupuestoCode],
  ]) {
    const node = (wf.nodes || []).find((n) => n.name === name);
    if (!node) throw new Error(`Node "${name}" not found`);
    const nextCode = fn(node.parameters.jsCode);
    if (nextCode !== String(node.parameters.jsCode || '').replace(/\r\n/g, '\n')) {
      node.parameters.jsCode = nextCode;
      changed = true;
    }
  }

  if (includeCatalogAndAgent) {
    const aiNode = (wf.nodes || []).find((n) => n.name === 'AI Agent');
    if (aiNode && aiNode.parameters && aiNode.parameters.options && aiNode.parameters.options.systemMessage) {
      const nextSm = patchAgentSystemMessage(aiNode.parameters.options.systemMessage);
      if (nextSm !== String(aiNode.parameters.options.systemMessage).replace(/\r\n/g, '\n')) {
        aiNode.parameters.options.systemMessage = nextSm;
        changed = true;
      }
    }

    const catNode = (wf.nodes || []).find((n) => n.name === 'enviar_catalogo_pintura_tool');
    if (catNode && patchCatalogTool(catNode)) {
      changed = true;
    }
  }

  return changed;
}

function patchJsonFile(relPath, opts) {
  const full = path.join(ROOT, relPath);
  const wf = JSON.parse(fs.readFileSync(full, 'utf8'));
  const changed = patchWorkflow(wf, opts);
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
  const changed = patchWorkflow(wf, { includeCatalogAndAgent: true });
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

module.exports = { patchBuscarCode, patchPresupuestoCode, patchAgentSystemMessage, patchCatalogTool, patchWorkflow };

if (require.main === module) {
  (async () => {
    patchJsonFile('workflows/production-baseline.json', { includeCatalogAndAgent: false });
    patchJsonFile('n8n_workflow.json', { includeCatalogAndAgent: true });
    if (!process.argv.includes('--files-only')) {
      await patchLiveWorkflow(MAIN_WF_ID);
    }
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
