// Empuja jsCode actualizado (alternativas en presupuesto) + instruccion en el prompt para ofrecerlas
const fs = require('fs');
const path = require('path');
const ID = 'ugHOTQv3Vb6cuTct';
const BASE = process.env.N8N_API_URL_LOCAL || 'http://localhost:5678/api/v1';
const env = fs.readFileSync(path.join(__dirname,'..','.env'),'utf8');
const key = (env.match(/^N8N_API_KEY=(.+)$/m)||[])[1].trim();
const H = { 'X-N8N-API-KEY': key, 'Content-Type':'application/json', 'accept':'application/json' };

const newBuscar = fs.readFileSync(path.join(__dirname,'new_buscar.js'),'utf8');
const newPresu = fs.readFileSync(path.join(__dirname,'new_presupuesto.js'),'utf8');

const findLine = 'REGLA: copia presupuesto_texto carácter por carácter. NUNCA recalcules ni cambies un dígito. Si nota trae texto, menciónalo al final.';
const addLine = findLine + '\n- El presupuesto YA usa el producto MÁS VENDIDO de cada renglón. Si la herramienta devuelve *alternativas_texto* con contenido, DESPUÉS del presupuesto ofrécelas de forma breve y natural, por ejemplo:\n\n👉 Si te sirve, también tengo estas opciones:\n(PEGA alternativas_texto tal cual)\n\nNo inventes alternativas ni precios: usa SOLO lo que devuelve la herramienta. Si alternativas_texto viene vacío, no menciones nada de alternativas.';

(async () => {
  const wf = await (await fetch(`${BASE}/workflows/${ID}`,{headers:H})).json();
  const changed = [];
  for (const n of wf.nodes) {
    if (n.name === 'buscar_productos_tool') { n.parameters.jsCode = newBuscar; changed.push('buscar_productos'); }
    if (n.name === 'hacer_presupuesto_tool') { n.parameters.jsCode = newPresu; changed.push('hacer_presupuesto'); }
    if (n.name === 'AI Agent') {
      let sm = n.parameters.options.systemMessage;
      if (sm.includes(findLine) && !sm.includes('alternativas_texto')) { sm = sm.replace(findLine, addLine); changed.push('prompt:alternativas'); }
      else if (sm.includes('alternativas_texto')) console.log('prompt: instruccion alternativas ya existe');
      else console.log('AVISO: no encontre la linea de REGLA presupuesto en el prompt');
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
