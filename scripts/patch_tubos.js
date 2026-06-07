// Empuja el jsCode actualizado (plural->singular, sinonimos tubos, medidas nominales) + nota de tubos/curvas en el prompt
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const newBuscar = fs.readFileSync(path.join(__dirname,'new_buscar.js'),'utf8');
const newPresu = fs.readFileSync(path.join(__dirname,'new_presupuesto.js'),'utf8');

const findLine = 'Si el cliente no da medida o espesor, recomiéndale las más vendidas y pregúntale la medida que necesita.';
const addLine = findLine + '\n- TIPOS DE TUBO: hay tubo de HERRERÍA (estructural/metálico, hierro), tubo de ELECTRICIDAD (conduit/luz/liviano), tubo de AGUA (fría, caliente, PVC presión A/B) y tubo de AGUAS NEGRAS (sanitario/cloacas, p. ej. de 2", 3", 4"). Si el cliente solo dice "tubo" + medida, pregúntale para qué lo necesita (electricidad, agua o aguas negras) y luego búscalo. Las "CURVAS" son codos de electricidad/conduit. El catálogo entiende singular/plural y sinónimos, así que SIEMPRE busca antes de decir que no hay.';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = newBuscar; changed.push('buscar_productos'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = newPresu; changed.push('hacer_presupuesto'); }
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      if (sm.includes(findLine) && !sm.includes('TIPOS DE TUBO')) { sm = sm.replace(findLine, addLine); changed.push('prompt:tubos'); }
      else if (sm.includes('TIPOS DE TUBO')) console.log('prompt: nota tubos ya existe');
      else console.log('AVISO: no encontre la linea de medidas en el prompt');
      n.parameters.options.systemMessage = sm;
    }
  }
  if (changed.length===0) { console.log('Sin cambios'); return; }
  const allowed = ['saveExecutionProgress','saveManualExecutions','saveDataErrorExecution','saveDataSuccessExecution','executionTimeout','errorWorkflow','timezone','executionOrder'];
  const cs = {}; for (const k of allowed) if (wf.settings && wf.settings[k] !== undefined) cs[k] = wf.settings[k];
  if (cs.executionOrder === undefined) cs.executionOrder = 'v1';
  const body = { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: cs };
  const put = await fetch(`${BASE}/workflows/${ID}`, { method:'PUT', headers:H, body: JSON.stringify(body) });
  console.log('Cambios:', changed.join(', '), '| PUT status:', put.status);
  if (!put.ok) console.log(await put.text());
  else console.log('OK actualizado.');
})().catch(e=>{ console.error('ERROR', e.message); process.exit(1); });
