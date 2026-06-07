// Snapshot + filtro de no-clientes (status@broadcast, grupos, newsletter) en "Is Text Message?"
// Solo AGREGA condiciones AND -> los clientes reales de texto siguen exactamente en su rama.
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };
const FROM = "={{ $json.body.payload ? $json.body.payload.from : $json.body.from }}";

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  // snapshot
  fs.writeFileSync(path.join(__dirname,'_wf_snapshot_'+Date.now()+'.json'), JSON.stringify(wf,null,1));
  const n = wf.nodes.find(x=>x.name==='Is Text Message?');
  const conds = n.parameters.conditions.conditions;
  if (conds.some(c=>c.id==='cond_no_status')) { console.log('Filtro ya aplicado'); return; }
  conds.push({ id:'cond_no_status', leftValue: FROM, operator:{ type:'string', operation:'notEquals' }, rightValue:'status@broadcast' });
  conds.push({ id:'cond_no_group', leftValue: FROM, operator:{ type:'string', operation:'notContains' }, rightValue:'@g.us' });
  conds.push({ id:'cond_no_news', leftValue: FROM, operator:{ type:'string', operation:'notContains' }, rightValue:'@newsletter' });
  n.parameters.conditions.options.typeValidation = 'loose';
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Filtro estados/grupos aplicado | PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK. Snapshot guardado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
