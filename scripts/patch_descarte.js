// PUT B: estados/grupos -> descarte puro. Imagenes de clientes reales -> Reply Non-Text. Texto -> procesar.
// Estructura: Webhook -> "Es Cliente Real?" -> (real) "Is Text Message?" -> (texto) Check Chat Session / (sin texto) Reply Non-Text
//                                            -> (no cliente) "Descartar" (NoOp)
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json','accept':'application/json' };
const FROM = "={{ $json.body.payload ? $json.body.payload.from : $json.body.from }}";
const BODY = "={{ $json.body.payload ? $json.body.payload.body : $json.body.body }}";

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  fs.writeFileSync(path.join(__dirname,'_wf_snapshot_descarte_'+Date.now()+'.json'), JSON.stringify(wf,null,1));

  // 1) Descartar (NoOp)
  if (!wf.nodes.find(n=>n.name==='Descartar')) {
    wf.nodes.push({ parameters:{}, id:'descartar_node', name:'Descartar', type:'n8n-nodes-base.noOp', typeVersion:1, position:[96, 460] });
  }
  // 2) Es Cliente Real? (IF v3)
  if (!wf.nodes.find(n=>n.name==='Es Cliente Real?')) {
    wf.nodes.push({
      parameters:{ conditions:{ combinator:'and', conditions:[
        { id:'c_no_status', leftValue:FROM, rightValue:'status@broadcast', operator:{type:'string',operation:'notEquals'} },
        { id:'c_no_group', leftValue:FROM, rightValue:'@g.us', operator:{type:'string',operation:'notContains'} },
        { id:'c_no_news', leftValue:FROM, rightValue:'@newsletter', operator:{type:'string',operation:'notContains'} }
      ], options:{ caseSensitive:true, leftValue:'', typeValidation:'loose', version:3 } }, options:{} },
      id:'es_cliente_real_node', name:'Es Cliente Real?', type:'n8n-nodes-base.if', typeVersion:2.3, position:[96, 304]
    });
  }
  // 3) Is Text Message? -> solo "tiene texto" (notEmpty) v3
  const itm = wf.nodes.find(n=>n.name==='Is Text Message?');
  itm.parameters.conditions = { combinator:'and', conditions:[
    { id:'cond_has_text', leftValue:BODY, rightValue:'', operator:{type:'string',operation:'notEmpty',singleValue:true} }
  ], options:{ caseSensitive:true, leftValue:'', typeValidation:'loose', version:3 } };

  // 4) Cableado
  wf.connections['Webhook Trigger'] = { main: [[{ node:'Es Cliente Real?', type:'main', index:0 }]] };
  wf.connections['Es Cliente Real?'] = { main: [
    [{ node:'Is Text Message?', type:'main', index:0 }],   // TRUE (cliente real)
    [{ node:'Descartar', type:'main', index:0 }]           // FALSE (estado/grupo)
  ] };
  wf.connections['Is Text Message?'] = { main: [
    [{ node:'Check Chat Session', type:'main', index:0 }], // TRUE (tiene texto)
    [{ node:'Reply Non-Text', type:'main', index:0 }]      // FALSE (sin texto -> imagen)
  ] };

  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify({ name:wf.name, nodes:wf.nodes, connections:wf.connections, settings:cs }) });
  console.log('PUT', put.status); if(!put.ok) console.log(await put.text()); else console.log('Descarte puro de estados/grupos aplicado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
