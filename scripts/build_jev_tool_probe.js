'use strict';
const fs = require('node:fs');

function buildToolContextProbe({ singleItem = false } = {}) {
  const edge = node => [{ node, type: 'main', index: 0 }];
  const first = "{json:{request_id: 'first', p_busqueda: 'broca para metal', jev_shadow:{department:'herramientas_discos', department_confidence:0.91}}}";
  const second = "{json:{request_id: 'second', p_busqueda: 'pintura blanca', jev_shadow:{department:'pinturas', department_confidence:0.93}}}";
  return {
    id: 'jev-tool-context-probe', name: 'Jev Tool Context Probe (synthetic)', active: false,
    settings: { executionOrder: 'v1' }, pinData: {}, tags: [],
    nodes: [
      { id: 'manual', name: 'Manual Trigger', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1,
        position: [0, 0], parameters: {} },
      { id: 'jev', name: 'Jev Shadow Decision', type: 'n8n-nodes-base.code', typeVersion: 2,
        position: [220, 0], parameters: { mode: 'runOnceForAllItems', language: 'javaScript',
          jsCode: `return [${first}${singleItem ? '' : ', ' + second}];` } },
      { id: 'tool', name: 'Probe Tool', type: '@n8n/n8n-nodes-langchain.toolCode', typeVersion: 1.3,
        position: [440, 0], parameters: { name: 'probe_tool', description: 'Synthetic context probe.',
          language: 'javaScript', specifyInputSchema: true, schemaType: 'fromJson',
          jsonSchemaExample: '{"request_id":"first","p_busqueda":"broca para metal"}',
          inputSchema: '{"type":"object","properties":{"request_id":{"type":"string"},"p_busqueda":{"type":"string"}},"required":["request_id","p_busqueda"]}',
          jsCode: "const source = $('Jev Shadow Decision'); const prior = source.first().json; return JSON.stringify({query_request_id:query.request_id, prior_request_id:prior.request_id, prior_department:prior.jev_shadow?.department, source_count:source.all().length});" } },
    ],
    connections: { 'Manual Trigger': { main: [edge('Jev Shadow Decision')] },
      'Jev Shadow Decision': { main: [edge('Probe Tool')] } },
  };
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) throw Error('Output path required');
  fs.writeFileSync(target, JSON.stringify(buildToolContextProbe({ singleItem: process.argv.includes('--single') }), null, 2) + '\n');
}
module.exports = { buildToolContextProbe };
