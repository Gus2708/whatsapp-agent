const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'n8n_workflow.json');

try {
  let rawContent = fs.readFileSync(filePath, 'utf8');
  
  // Fix the invalid JSON if it exists
  if (rawContent.includes('",",\n')) {
    rawContent = rawContent.replace('",",\n', '",\n');
    console.log('Fixed ",\",\\n" syntax error in raw file.');
  }

  const wf = JSON.parse(rawContent);
  const aiNode = wf.nodes.find(n => n.name === 'AI Agent');
  
  if (!aiNode) {
    throw new Error('AI Agent node not found in workflow JSON');
  }

  let sm = aiNode.parameters.options.systemMessage;
  console.log('Original systemMessage length:', sm.length);

  // 1. Update BÚSQUEDA Y RELEVANCIA
  const oldBusquedaSection = /═══ BÚSQUEDA Y RELEVANCIA ═══[\s\S]*?(?=\n═══ CATEGORÍAS)/g;
  const newBusquedaSection = `═══ BÚSQUEDA Y RELEVANCIA ═══
REGLA ABSOLUTA (la más importante): para CUALQUIER pregunta sobre un producto, precio, disponibilidad o cotización, es OBLIGATORIO llamar la herramienta (buscar_productos o hacer_presupuesto) ANTES de responder. JAMÁS des un precio de tu memoria, JAMÁS inventes cifras ni nombres. Si respondes sin llamar la herramienta, estarás dando datos FALSOS al cliente y eso está terminantemente prohibido. Solo reporta lo que la herramienta devuelve.
- REGLA DE ORO DE BÚSQUEDA: Siempre usa buscar_productos primero si te preguntan por algún producto o artículo. No asumas que no lo vendemos sin buscarlo primero. Solo declina la venta si el artículo cae estrictamente en una categoría prohibida (como celulares, ropa, electrodomésticos) y buscar_productos no arrojó resultados. Si la búsqueda arroja resultados, significa que sí lo vendemos y debes ofrecerlos.
- CONSERVA los términos exactos del cliente al buscar o cotizar (marcas, medidas, modelos como "CSC", "12mm", "Catatumbo", "Ingco"). NO los simplifiques ni los quites: si pide "cemento gris CSC", busca "cemento gris csc" completo, no solo "cemento".
- Solo se muestran productos CON stock (la herramienta ya filtra agotados); por eso "no mostrar productos sin cantidad".
- No muestres productos sin relación con lo pedido (si pide "alambre", no ofrezcas "cepillo de alambre").
- Alambre (de amarre) y alambrón (cabilla fina estriada) son distintos.`;

  if (sm.match(oldBusquedaSection)) {
    sm = sm.replace(oldBusquedaSection, newBusquedaSection + '\n');
    console.log('Updated BÚSQUEDA Y RELEVANCIA section.');
  } else {
    // Try a simpler replace if section title exists
    if (sm.includes('═══ BÚSQUEDA Y RELEVANCIA ═══')) {
      // Find index and replace until next section
      const idxSearch = sm.indexOf('═══ BÚSQUEDA Y RELEVANCIA ═══');
      const idxCat = sm.indexOf('═══ CATEGORÍAS QUE NO VENDEMOS ═══');
      if (idxCat > idxSearch) {
        sm = sm.slice(0, idxSearch) + newBusquedaSection + '\n\n' + sm.slice(idxCat);
        console.log('Updated BÚSQUEDA Y RELEVANCIA section using index offsets.');
      }
    }
  }

  // 2. Update CATEGORÍAS QUE NO VENDEMOS
  const oldCatSection = /═══ CATEGORÍAS QUE NO VENDEMOS ═══[\s\S]*?(?=\n═══ MEMORIA)/g;
  const newCatSection = `═══ CATEGORÍAS QUE NO VENDEMOS ═══
No manejamos electrodomésticos (lavadoras, neveras, aires), electrónica (celulares, computadoras, TV), vehículos ni ropa. Si preguntan por eso responde amable: "En El Serrucho nos especializamos en materiales de construcción, herramientas y plomería. No manejamos eso 🙏. ¿Puedo ayudarte con algo de ferretería? 👨🏻‍🔧". NO busques accesorios relacionados.
EXCEPCIONES (SÍ vendemos estos artículos de ferretería/seguridad, búscalos con la herramienta):
- Fajas lumbares (categoría seguridad industrial)
- Nylon de pescar (categoría pesca/ataduras)
- Flotadores eléctricos o flotadores de agua (categoría plomería/tanques)
- Malla pollito (categoría construcción/mallas/cercas)`;

  if (sm.match(oldCatSection)) {
    sm = sm.replace(oldCatSection, newCatSection + '\n');
    console.log('Updated CATEGORÍAS QUE NO VENDEMOS section.');
  } else {
    if (sm.includes('═══ CATEGORÍAS QUE NO VENDEMOS ═══')) {
      const idxCat = sm.indexOf('═══ CATEGORÍAS QUE NO VENDEMOS ═══');
      const idxMem = sm.indexOf('═══ MEMORIA (Engram) ═══');
      if (idxMem > idxCat) {
        sm = sm.slice(0, idxCat) + newCatSection + '\n\n' + sm.slice(idxMem);
        console.log('Updated CATEGORÍAS QUE NO VENDEMOS section using index offsets.');
      }
    }
  }

  aiNode.parameters.options.systemMessage = sm;
  console.log('New systemMessage length:', sm.length);

  fs.writeFileSync(filePath, JSON.stringify(wf, null, 2), 'utf8');
  console.log('Successfully wrote updated workflow to disk.');

} catch (err) {
  console.error('Error modifying workflow file:', err);
  process.exit(1);
}
