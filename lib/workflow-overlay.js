'use strict';
const { searchDecision, searchGuard } = require('./conversation-context');
const { qualifyProductCandidates } = require('./jev-product-qualifier');

function canonicalFunctionSource(fn) {
  return fn.toString().replace(/\r\n/g, '\n');
}

function replaceOnce(source, needle, replacement) {
  if (source.split(needle).length !== 2) throw new Error('Baseline contract changed: expected exactly one overlay anchor');
  return source.replace(needle, () => replacement);
}

function buildWorkflow(baseline, { context, jev }) {
  const wf = structuredClone(baseline);
  const get = name => {
    const matches = wf.nodes.filter(n => n.name === name);
    if (matches.length !== 1) throw new Error('Baseline contract changed: expected exactly one ' + name);
    return matches[0];
  };
  const edges = wf.connections['Cliente Memoria']?.main?.flat() || [];
  if (edges.filter(e => e.node === 'AI Agent').length !== 1) throw new Error('Baseline contract changed: expected exactly one agent edge');
  edges.find(e => e.node === 'AI Agent').node = 'Prepare Conversation Context';
  const edge = node => [{ node, type: 'main', index: 0 }];
  const codeNode = (name,id,jsCode,x) => ({name,id,type:'n8n-nodes-base.code',typeVersion:2,
    position:[x,420],parameters:{mode:'runOnceForAllItems',language:'javaScript',jsCode}});
  wf.nodes.push(codeNode('Prepare Conversation Context','conversation-context-v1',context,-80));
  wf.nodes.push(codeNode('Jev Shadow Decision','jev-shadow-v1',jev,30));
  wf.nodes.push({name:'Needs Product Clarification?',id:'conversation-clarification-v1',type:'n8n-nodes-base.if',typeVersion:2,
    position:[140,420],parameters:{conditions:{options:{caseSensitive:true,leftValue:'',typeValidation:'strict',version:2},
      conditions:[{id:'needs-product',leftValue:'={{ ["clarify", "respond", "handoff"].includes($json.conversation_context?.action) || $json.conversation_context?.fast_path === true }}',rightValue:true,operator:{type:'boolean',operation:'equals'}}],combinator:'and'},options:{}}});
  wf.connections['Prepare Conversation Context'] = {main:[edge('Jev Shadow Decision')]};
  wf.connections['Jev Shadow Decision'] = {main:[edge('Needs Product Clarification?')]};
  wf.connections['Needs Product Clarification?'] = {main:[edge('Sanitize Agent Output'),edge('AI Agent')]};
  const agent = get('AI Agent').parameters;
  agent.options.returnIntermediateSteps = true;
  agent.text = replaceOnce(agent.text,
    "(($('Transcribir Nota de Voz').first().json.body.payload._rafaga_previa || '') + $('Transcribir Nota de Voz').first().json.body.payload.body)",
    "$('Prepare Conversation Context').first().json.conversation_context.query");
  const search = get('buscar_productos_tool').parameters;
  let code = search.jsCode;
  for (const [needle,status] of [["{ encontrados:0, aclarar:true",'vague'],["{ encontrados:0, no_vendido:true",'not_sold'],["{ encontrados:0, instruccion:'NO encontre",'missing']]) {
    code = replaceOnce(code,needle,"{ ...searchDecision('"+status+"'),"+needle.slice(1));
  }
  code = replaceOnce(code,'return JSON.stringify(_out);',
    "Object.assign(_out, searchDecision(_rescate ? 'semantic' : _weak ? 'weak' : medMismatch ? 'measure_mismatch' : medParcial ? 'multiple_measures' : _fuzzy ? 'approximate' : _dropped ? 'relaxed' : 'exact'));\n" +
    "await qualifyProductCandidates({ axios, env: typeof $env !== 'undefined' ? $env : process.env, query: p_busqueda, candidates: unicos, output: _out, eligible: !_out.aclarar && !_weak && !medMismatch && !medParcial && !!(_rescate || _fuzzy || _dropped) });\n" +
    'return JSON.stringify(_out);');
  search.jsCode = canonicalFunctionSource(searchDecision) + '\n' + canonicalFunctionSource(qualifyProductCandidates) + '\n' + code;
  const sanitizer = get('Sanitize Agent Output').parameters;
  sanitizer.jsCode = canonicalFunctionSource(searchDecision) + '\n' + canonicalFunctionSource(searchGuard) + `
// Apply the pilot decision before the published reservation and handoff logic.
for (const item of items) {
  let context = item?.json?.conversation_context;
  if (!context) {
    try { context = $('Jev Shadow Decision').first().json.conversation_context; } catch (_) {
      try { context = $('Prepare Conversation Context').first().json.conversation_context; } catch (_) {}
    }
  }
  const guarded = context?.action === 'respond'
    ? context.reply
    : context?.action === 'handoff'
      ? (context.reply || '[PEDIR_AYUDA]')
      : context?.action === 'clarify'
        ? '¿Qué producto necesitas exactamente? Indícame el nombre y la medida, por favor.'
        : !item.json.error && typeof item.json.output === 'string' && item.json.output.trim()
          ? searchGuard(item.json.intermediateSteps) : null;
  delete item.json.intermediateSteps;
  delete item.json.jev_shadow;
  if (guarded && !String(item.json.output || '').includes('[ESCALAR_HUMANO]')) {
    item.json.output = guarded;
    item.json._decision_guarded = true;
  }
}
` + sanitizer.jsCode;
  wf.active = false;
  return wf;
}
module.exports = { buildWorkflow, canonicalFunctionSource };
