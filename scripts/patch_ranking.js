// Cambia el conteo de ventas (roto por limite de 1000 filas) por el RPC agregado popularidad_productos
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const findBuscar = `try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=4000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}`;
const findPresu = `try{ const cf=codes.map(c=>'"'+c+'"').join(','); const vr=await axios.get(SB+'/rest/v1/ventas_detalle?select=codigo_producto,cantidad&codigo_producto=in.('+cf+')&limit=3000',{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=(vMap[v.codigo_producto]||0)+Number(v.cantidad); }catch(e){}`;
const repl = `try{ const vr=await axios.post(SB+'/rest/v1/rpc/popularidad_productos',{p_codigos:codes},{headers:H}); for(const v of(vr.data||[])) vMap[v.codigo_producto]=Number(v.total); }catch(e){}`;

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool' && n.parameters.jsCode.includes(findBuscar)) {
      n.parameters.jsCode = n.parameters.jsCode.replace(findBuscar, repl); changed.push('buscar_productos');
    }
    if (n.name === 'hacer_presupuesto_tool' && n.parameters.jsCode.includes(findPresu)) {
      n.parameters.jsCode = n.parameters.jsCode.replace(findPresu, repl); changed.push('hacer_presupuesto');
    }
  }
  if (changed.length === 0) { console.log('Sin cambios: no se encontro el bloque (revisar).'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Cambios:', changed.join(', '), '| PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
