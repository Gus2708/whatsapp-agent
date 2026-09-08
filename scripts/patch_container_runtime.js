const fs = require('fs');

const chatModelFiles = [
  '/usr/local/lib/node_modules/n8n/node_modules/.pnpm/@langchain+core@1.1.41_@opentelemetry+api@1.9.0_@opentelemetry+exporter-trace-otlp-prot_5b300419b88b4c5c4bc7fc5020df6ca2/node_modules/@langchain/core/dist/language_models/chat_models.js',
  '/usr/local/lib/node_modules/n8n/node_modules/.pnpm/@langchain+core@1.1.41_@opentelemetry+api@1.9.0_@opentelemetry+exporter-trace-otlp-prot_746e59e9582261cbe984b56553969d3c/node_modules/@langchain/core/dist/language_models/chat_models.js',
  '/usr/local/lib/node_modules/n8n/node_modules/.pnpm/@langchain+core@1.1.41_@opentelemetry+api@1.9.0_@opentelemetry+exporter-trace-otlp-prot_fd47ef29f75e881f5aae356b5073c041/node_modules/@langchain/core/dist/language_models/chat_models.js'
];

const targetInvoke = "return (await this.generatePrompt([promptValue], options, options?.callbacks)).generations[0][0].message;";
const safeInvoke = `const genResult = await this.generatePrompt([promptValue], options, options?.callbacks);
		const msg = genResult?.generations?.[0]?.[0]?.message;
		if (msg) return msg;
		return new AIMessage('');`;

for (const f of chatModelFiles) {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    if (content.includes(targetInvoke)) {
      content = content.replace(targetInvoke, safeInvoke);
      fs.writeFileSync(f, content, 'utf8');
      console.log('Patched chat_models.js at:', f);
    } else {
      console.log('chat_models.js already patched or target not found in:', f);
    }
  }
}

const execBatchFile = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm/@n8n+n8n-nodes-langchain@file+packages+@n8n+nodes-langchain_8bf81e0cdf1fe65cc684d3daaa3ca5c1/node_modules/@n8n/n8n-nodes-langchain/dist/nodes/agents/Agent/agents/ToolsAgent/V3/helpers/executeBatch.js';
if (fs.existsSync(execBatchFile)) {
  let content = fs.readFileSync(execBatchFile, 'utf8');
  const targetErr = "const error = result.reason;\n            if (ctx.continueOnFail()) {\n                returnData.push({\n                    json: { error: error.message },";
  const safeErr = "const error = result.reason || new Error('Unknown error');\n            if (ctx.continueOnFail()) {\n                returnData.push({\n                    json: { error: error?.message || String(error) },";
  if (content.includes(targetErr)) {
    content = content.replace(targetErr, safeErr);
    fs.writeFileSync(execBatchFile, content, 'utf8');
    console.log('Patched executeBatch.js');
  } else {
    console.log('executeBatch.js already patched');
  }
}
console.log('Runtime patch successful.');
