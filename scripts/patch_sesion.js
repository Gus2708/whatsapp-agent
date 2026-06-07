// PUT A: modelo gpt-4.1-mini + sesion por REST (Check Chat Session, Set Chat Manual) + Rate Limited v3
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json','accept':'application/json' };
const checkJs = fs.readFileSync(path.join(__dirname,'check_session.js'),'utf8');
const manualJs = fs.readFileSync(path.join(__dirname,'set_manual.js'),'utf8');

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  fs.writeFileSync(path.join(__dirname,'_wf_snapshot_sesion_'+Date.now()+'.json'), JSON.stringify(wf,null,1));
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'OpenRouter Chat Model') { n.parameters.model = 'openai/gpt-4.1-mini'; n.parameters.options = n.parameters.options||{}; n.parameters.options.temperature = 0; changed.push('modelo'); }
    if (n.name === 'Check Chat Session') { n.type='n8n-nodes-base.code'; n.typeVersion=2; n.parameters={ jsCode: checkJs }; delete n.credentials; n.onError='continueRegularOutput'; changed.push('check_session'); }
    if (n.name === 'Set Chat Manual') { n.type='n8n-nodes-base.code'; n.typeVersion=2; n.parameters={ jsCode: manualJs }; delete n.credentials; n.onError='continueRegularOutput'; changed.push('set_manual'); }
    if (n.name === 'Rate Limited?') {
      n.parameters.conditions = { combinator:'and', conditions:[ { id:'cond_rate_limit', leftValue:'={{ $json.msg_count }}', rightValue:10, operator:{type:'number',operation:'gt'} } ], options:{ caseSensitive:true, leftValue:'', typeValidation:'loose', version:3 } };
      changed.push('rate_limited_v3');
    }
  }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify({ name:wf.name, nodes:wf.nodes, connections:wf.connections, settings:cs }) });
  console.log('Cambios:', changed.join(', '), '| PUT', put.status);
  if(!put.ok) console.log(await put.text()); else console.log('OK');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
