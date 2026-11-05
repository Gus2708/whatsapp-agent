'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const baseline = require('../workflows/production-baseline.json');
const { buildWorkflow, canonicalFunctionSource } = require('../lib/workflow-overlay');
const { searchDecision, searchGuard } = require('../lib/conversation-context');
const fs = require('node:fs');
const sources = {
  context: fs.readFileSync('scratch_live/live_conversation_context.js', 'utf8'),
  jev: fs.readFileSync('scratch_live/live_jev_shadow.js', 'utf8'),
};

test('embedded function source uses LF even when the host source uses CRLF', () => {
  const hostFunction = new Function('value', '\r\n  return value;\r\n');
  assert.match(hostFunction.toString(), /\r\n/, 'fixture must retain host line endings');
  assert.equal(canonicalFunctionSource(hostFunction), hostFunction.toString().replace(/\r\n/g, '\n'));
  const output = buildWorkflow(baseline, sources);
  const node = name => output.nodes.find(n => n.name === name);
  assert.ok(node('buscar_productos_tool').parameters.jsCode.startsWith(canonicalFunctionSource(searchDecision) + '\n'));
  assert.ok(node('Sanitize Agent Output').parameters.jsCode.startsWith(
    canonicalFunctionSource(searchDecision) + '\n' + canonicalFunctionSource(searchGuard) + '\n'));
});
test('production overlay preserves published business nodes, settings and unrelated branches', () => {
  const input = structuredClone(baseline);
  input.settings.customSentinel = 'preserve';
  input.connections['Cliente Memoria'].main[0].push({node:'Descartar',type:'main',index:0});
  const output = buildWorkflow(input, sources);
  for (const node of input.nodes) {
    if (['AI Agent','buscar_productos_tool','Sanitize Agent Output'].includes(node.name)) continue;
    assert.deepEqual(output.nodes.find(n => n.name === node.name), node);
  }
  assert.deepEqual(output.settings, input.settings);
  assert.equal(output.nodes.find(n => n.name === 'OpenRouter Chat Model').parameters.model, 'openai/gpt-5.6-luna');
  assert.equal(output.connections['Cliente Memoria'].main[0][1].node, 'Descartar');
  assert.equal(output.connections['Cliente Memoria'].main[0][0].node, 'Prepare Conversation Context');
  assert.equal(output.active, false);
  assert.equal(output.activeVersion, undefined);
  assert.deepEqual(input.nodes, baseline.nodes, 'input is immutable');
});
test('production overlay preserves original prompt and executable source bodies', () => {
  const output = buildWorkflow(baseline, sources);
  const node = (wf,name) => wf.nodes.find(n=>n.name===name);
  assert.equal(node(output,'AI Agent').parameters.options.systemMessage, node(baseline,'AI Agent').parameters.options.systemMessage);
  assert.ok(node(output,'Sanitize Agent Output').parameters.jsCode.endsWith(node(baseline,'Sanitize Agent Output').parameters.jsCode));
  assert.match(node(output,'buscar_productos_tool').parameters.jsCode, /searchDecision/);
  assert.throws(()=>buildWorkflow({...baseline, connections:{}},sources), /expected exactly one/);
});

test('selected published search executes with typed vague, missing and exact results', async () => {
  const { buildFakeAxios } = require('./support/load-live-buscar');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const output = buildWorkflow(baseline, sources);
  const code = output.nodes.find(n=>n.name==='buscar_productos_tool').parameters.jsCode;
  for (const [p_busqueda, action] of [['hola','clarify'],['quarkonium','handoff'],['lamina','show_results']]) {
    const fake = buildFakeAxios();
    const result = JSON.parse(await new AsyncFunction('query','require','$env','process',code)(
      {p_busqueda}, () => fake, {SUPABASE_URL:'http://supabase.test',SUPABASE_ANON_KEY:'test-only'}, {env:{}}));
    assert.equal(result.action, action);
    assert.equal(result.decision_version, 1);
  }
});

test('published sanitizer retains reservation behavior but blocks uncertain reservations', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const code = buildWorkflow(baseline, sources).nodes.find(n=>n.name==='Sanitize Agent Output').parameters.jsCode;
  const run = async observation => {
    const posts = [];
    const axios = {get:async()=>({data:[]}),post:async(url,body)=>{posts.push({url,body});return {data:[]};}};
    const $ = name => ({first:()=>({json:name==='Prepare Conversation Context'
      ? {conversation_context:{action:'disabled'}} : {body:{payload:{from:'synthetic-chat'}}}})});
    const items = [{json:{output:'[RESERVA: cable] Listo',intermediateSteps:observation,jev_shadow:{}}}];
    const result = await new AsyncFunction('items','$','$env','require','process',code)(items,$,
      {SUPABASE_URL:'http://supabase.test',SUPABASE_ANON_KEY:'test-only'},()=>axios,{env:{}});
    return {posts,result};
  };
  const normal = await run([]);
  assert.ok(normal.posts.some(p=>p.url.endsWith('/atenciones_pendientes')));
  assert.ok(normal.posts.some(p=>p.url.endsWith('/mensajes_bot')));
  const guarded = await run([{action:{tool:'buscar_productos'},observation:JSON.stringify({decision_version:1,
    match_status:'approximate',action:'confirm',requires_confirmation:true,productos:[{nombre:'Cable'}]})}]);
  assert.ok(!guarded.posts.some(p=>p.url.endsWith('/atenciones_pendientes')));
  assert.equal(guarded.result[0].json.jev_shadow, undefined);
  assert.equal(guarded.result[0].json.intermediateSteps, undefined);
});

test('published sanitizer replaces blank and errored agent output with customer fallback', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const code = buildWorkflow(baseline, sources).nodes.find(n=>n.name==='Sanitize Agent Output').parameters.jsCode;
  const $ = name => ({first:()=>({json:name==='Prepare Conversation Context'
    ? {conversation_context:{action:'disabled'}} : {body:{payload:{from:'synthetic-chat'}}}})});
  const axios = {get:async()=>({data:[]}),post:async()=>({data:[]})};
  for (const json of [{output:''},{output:'unsafe answer',error:'model failed'}]) {
    const result = await new AsyncFunction('items','$','$env','require','process',code)(
      [{json}],$,{},()=>axios,{env:{}});
    assert.match(result[0].json.output, /Disculpa/);
    assert.equal(result[0].json._sanitized,true);
  }
});

test('published sanitizer fixes a mixed-currency bolivar line without changing prices', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const code = buildWorkflow(baseline, sources).nodes.find(n=>n.name==='Sanitize Agent Output').parameters.jsCode;
  const $ = name => ({first:()=>({json:name==='Prepare Conversation Context'
    ? {conversation_context:{action:'disabled'}} : {body:{payload:{from:'synthetic-chat'}}}})});
  const axios = {get:async()=>({data:[]}),post:async()=>({data:[]})};
  const run = async output => (await new AsyncFunction('items','$','$env','require','process',code)(
    [{json:{output,intermediateSteps:[]}}],$,{},()=>axios,{env:{}}))[0].json.output;
  assert.equal(await run('Precio USD: 12$\nPrecio Bs (BCV): 12$ o 10,308.75bs'),
    'Precio USD: 12$\nPrecio Bs (BCV): 10,308.75 Bs');
  assert.equal(await run('Precio USD: 12$\nPrecio Bs (BCV): 12$'),
    'Precio USD: 12$\nPrecio Bs (BCV): 12$');
});

test('published sanitizer escalates payment handoff to atenciones_pendientes and manual session while keeping Zelle policy non-blocking', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const code = buildWorkflow(baseline, sources).nodes.find(n=>n.name==='Sanitize Agent Output').parameters.jsCode;
  const paymentHandoff = 'Para procesar el pago con gusto un empleado te atiende enseguida 👨🏻‍🔧, o si prefieres puedes pasar por la tienda. ¿Te ayudo con algo más?';
  const zelleInfo = 'Sí, el *Precio Divisas* es el precio en USD y aplica para Zelle. Para coordinar el pago con gusto un empleado te atiende enseguida 👨🏻‍🔧, o si prefieres puedes pasar por la tienda. ¿Te ayudo con algo más?';

  const runSanitizer = async (output, clientBody = 'Me da datos de zelle para cancelar', shouldFailDb = false) => {
    const posts = [];
    const axios = {
      get: async (url) => {
        if (shouldFailDb) throw new Error('Supabase down');
        if (url.includes('/clientes_chat')) return { data: [{ nombre: 'Carlos' }] };
        return { data: [] };
      },
      post: async (url, body, cfg) => {
        if (shouldFailDb) throw new Error('Supabase down');
        posts.push({ url, body, headers: cfg?.headers });
        return { data: [] };
      }
    };
    const $ = name => ({
      first: () => ({
        json: name === 'Prepare Conversation Context'
          ? { conversation_context: { action: 'disabled' } }
          : { body: { payload: { from: '584147654321@c.us', body: clientBody } } }
      })
    });
    const items = [{ json: { output, intermediateSteps: [] } }];
    const result = await new AsyncFunction('items', '$', '$env', 'require', 'process', code)(
      items, $, { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'test-only' }, () => axios, { env: {} }
    );
    return { posts, result };
  };

  // 1) Payment handoff promises employee attention -> must insert pending attention AND mark manual
  const handoffRes = await runSanitizer(paymentHandoff);
  assert.equal(handoffRes.result[0].json.output, paymentHandoff);
  assert.equal(handoffRes.result[0].json._pago_handoff, true);
  const atencionPost = handoffRes.posts.find(p => p.url.endsWith('/atenciones_pendientes'));
  assert.ok(atencionPost, 'Must insert into atenciones_pendientes');
  assert.equal(atencionPost.body.telefono, '584147654321@c.us');
  assert.equal(atencionPost.body.nombre, 'Carlos');
  assert.equal(atencionPost.body.status, 'pendiente');
  assert.match(atencionPost.body.motivo, /💳 PAGO:.*Me da datos de zelle/);

  const sessionPost = handoffRes.posts.find(p => p.url.includes('/chat_sessions?on_conflict=telefono'));
  assert.ok(sessionPost, 'Must upsert chat_sessions to manual');
  assert.equal(sessionPost.body.telefono, '584147654321@c.us');
  assert.equal(sessionPost.body.estado, 'manual');
  assert.ok(sessionPost.body.manual_since);
  assert.equal(sessionPost.headers?.Prefer, 'resolution=merge-duplicates');

  // 2) DB errors never break message delivery
  const resilientRes = await runSanitizer(paymentHandoff, 'Pásame el pago móvil', true);
  assert.equal(resilientRes.result[0].json.output, paymentHandoff);

  // 3) Informational Zelle policy leaves chat_sessions non-blocking (automatico)
  const infoRes = await runSanitizer(zelleInfo, '¿Aceptan Zelle?');
  assert.equal(infoRes.result[0].json.output, zelleInfo);
  assert.equal(infoRes.result[0].json._pago_handoff, undefined);
  assert.ok(!infoRes.posts.some(p => p.url.endsWith('/atenciones_pendientes')));
  assert.ok(!infoRes.posts.some(p => p.url.includes('/chat_sessions')));
});

test('systemMessage gives [ESCALAR_HUMANO] precedence for payment confirmations and stays synced with live_systemMessage.txt', () => {
  const basePrompt = baseline.nodes.find(n => n.name === 'AI Agent').parameters.options.systemMessage.replace(/\r\n/g, '\n');
  const livePrompt = fs.readFileSync('scratch_live/live_systemMessage.txt', 'utf8').replace(/\r\n/g, '\n');
  assert.equal(basePrompt, livePrompt);
  assert.match(basePrompt, /confirma ese zelle/i);
  assert.match(basePrompt, /verifica el pago para ir a retirar/i);
  assert.match(basePrompt, /PRIORIDAD.*PROHIBIDO — DATOS DE PAGO/i);
  assert.match(basePrompt, /EXCEPCIÓN DE PRIORIDAD \(PAGO YA ENVIADO\).*\[ESCALAR_HUMANO\]/);
});
