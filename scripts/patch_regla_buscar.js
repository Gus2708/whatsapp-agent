// Regla absoluta: SIEMPRE llamar buscar_productos para precios/productos (no alucinar)
const http = require('http');
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhOTE3NGNiNi02NTI1LTQyNmItOTAwNS0zMGJkZTFjYjE3NWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNDc2YTBkOWItYzc3Ny00NjdlLWFkNDItM2RhMmU2NDUxZGZjIiwiaWF0IjoxNzgwNjg4NjcxfQ.r_Yu3KrJGTO6mSWVFZYihxFUbqnLzGJp7c0J5rOiSP0';
const WF_ID = 'ugHOTQv3Vb6cuTct';
function get(){return new Promise((res,rej)=>{http.get({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,headers:{'X-N8N-API-KEY':KEY}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(JSON.parse(d)));}).on('error',rej);});}
function put(p){return new Promise((res,rej)=>{const b=JSON.stringify(p);const r=http.request({hostname:'localhost',port:5678,path:`/api/v1/workflows/${WF_ID}`,method:'PUT',headers:{'X-N8N-API-KEY':KEY,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res({status:resp.statusCode,body:d}));});r.on('error',rej);r.write(b);r.end();});}
function post(path){return new Promise((res,rej)=>{const b='{}';const r=http.request({hostname:'localhost',port:5678,path,method:'POST',headers:{'X-N8N-API-KEY':KEY,'Content-Type':'application/json','Content-Length':2}},resp=>{let d='';resp.on('data',c=>d+=c);resp.on('end',()=>res(resp.statusCode));});r.on('error',rej);r.write(b);r.end();});}

const REGLA = `═══ BÚSQUEDA Y RELEVANCIA ═══
REGLA ABSOLUTA (la más importante): para CUALQUIER pregunta sobre un producto, precio, disponibilidad o cotización, es OBLIGATORIO llamar la herramienta (buscar_productos o hacer_presupuesto) ANTES de responder. JAMÁS des un precio de tu memoria, JAMÁS inventes cifras ni nombres. Si respondes sin llamar la herramienta, estarás dando datos FALSOS al cliente y eso está terminantemente prohibido. Solo reporta lo que la herramienta devuelve.
- CONSERVA los términos exactos del cliente al buscar o cotizar (marcas, medidas, modelos como "CSC", "12mm", "Catatumbo", "Ingco"). NO los simplifiques ni los quites: si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".`;

(async()=>{
  const wf = await get();
  const ai = wf.nodes.find(n=>n.name==='AI Agent');
  let sm = ai.parameters.options.systemMessage;
  // Reemplazar toda la sección BÚSQUEDA (incluye la línea de conservar términos ya añadida)
  sm = sm.replace(/═══ BÚSQUEDA Y RELEVANCIA ═══[\s\S]*?(?=\n- Solo se muestran|\n- Usa buscar_productos|\n═══ CATEG)/, REGLA + '\n');
  // Si el reemplazo no agarró (por variación), insertar antes de CATEGORÍAS
  if (!sm.includes('REGLA ABSOLUTA (la más importante)')) {
    sm = sm.replace('═══ CATEGORÍAS QUE NO VENDEMOS ═══', REGLA + '\n\n═══ CATEGORÍAS QUE NO VENDEMOS ═══');
  }
  ai.parameters.options.systemMessage = sm;
  console.log('¿Regla aplicada?', sm.includes('REGLA ABSOLUTA (la más importante)'));

  const r = await put({ name: wf.name, nodes: wf.nodes, connections: wf.connections, settings:{ executionOrder:'v1' } });
  if(r.status>=300){ console.error('PUT ERROR', r.body.slice(0,400)); return; }
  await post(`/api/v1/workflows/${WF_ID}/deactivate`);
  const ar = await post(`/api/v1/workflows/${WF_ID}/activate`);
  console.log('✓ PUT', r.status, '| reactivado', ar);
})().catch(e=>console.error('FATAL',e));
