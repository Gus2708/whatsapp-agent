const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

const BASE = process.env.N8N_API_URL_LOCAL || 'http://127.0.0.1:5678/api/v1';
const key = pick('N8N_API_KEY');
const H = { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', accept: 'application/json', Connection: 'close' };

const cleanCode = (code) => {
  if (typeof code !== 'string') return code;
  let c = code;
  c = c.replace(/const SB = '[^']+';/g, "const SB = (typeof $env !== 'undefined' && $env.SUPABASE_URL) || process.env.SUPABASE_URL || '';");
  c = c.replace(/const ANON = '[^']+';/g, "const ANON = (typeof $env !== 'undefined' && $env.SUPABASE_ANON_KEY) || process.env.SUPABASE_ANON_KEY || '';");
  return c;
};

// 1. Sanitizar y documentar Sync Vocabulario Catálogo
const vocPath = path.join(ROOT, 'workflows', 'workflow_vocabulario.json');
if (fs.existsSync(vocPath)) {
  const wfVoc = JSON.parse(fs.readFileSync(vocPath, 'utf8'));
  wfVoc.nodes.forEach(n => {
    if (n.parameters && n.parameters.jsCode) {
      n.parameters.jsCode = cleanCode(n.parameters.jsCode);
    }
  });

  const vocSticky = {
    parameters: {
      content: "## 🌙 Mantenimiento Nocturno del Catálogo (3:00 AM)\n1. **Sincronizar Vocabulario**: Detecta cambios por hash MD5 en categorías y genera sinónimos con Luna.\n2. **Monitor Embeddings**: Alerta sobre productos sin vector o desactualizados.\n3. **Refrescar Popularidad**: Recalcula el ranking de productos por ventas reales recientes.",
      height: 380,
      width: 860,
      color: 2
    },
    id: "sticky_vocab",
    name: "Sticky Note - Vocabulario",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ 200, 100 ]
  };

  wfVoc.nodes = wfVoc.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  wfVoc.nodes.push(vocSticky);
  fs.writeFileSync(vocPath, JSON.stringify(wfVoc, null, 2), 'utf8');

  // Actualizar en n8n
  (async () => {
    const put = await fetch(`${BASE}/workflows/${wfVoc.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ name: wfVoc.name, nodes: wfVoc.nodes, connections: wfVoc.connections, settings: { executionOrder: "v1" } })
    });
    console.log('Sync Vocabulario deployed to n8n:', put.status);
  })();
}

// 2. Sanitizar y documentar Reenviar Ayuda
const ayudaPath = path.join(ROOT, 'workflows', 'workflow_reenviar_ayuda.json');
if (fs.existsSync(ayudaPath)) {
  const wfAyuda = JSON.parse(fs.readFileSync(ayudaPath, 'utf8'));
  wfAyuda.nodes.forEach(n => {
    if (n.parameters && n.parameters.jsCode) {
      n.parameters.jsCode = cleanCode(n.parameters.jsCode);
    }
    if (n.parameters && n.parameters.headerParameters && n.parameters.headerParameters.parameters) {
      n.parameters.headerParameters.parameters.forEach(p => {
        if (p.name === 'X-API-Key') p.value = "={{ $env.WAHA_API_KEY }}";
      });
    }
  });

  const ayudaSticky = {
    parameters: {
      content: "## 👷 Despacho de Solicitudes Resueltas por Empleados (Cada 15s)\n1. **Cada 15s**: Polling continuo en Supabase `solicitudes_ayuda`.\n2. **Componer y Marcar**: Arma la cotización con formato de tienda y recargo, calculando tasa BCV y marcando la solicitud como 'enviado'.\n3. **Enviar WAHA**: Despacha el mensaje de WhatsApp al cliente automáticamente.",
      height: 320,
      width: 720,
      color: 6
    },
    id: "sticky_ayuda",
    name: "Sticky Note - Reenviar Ayuda",
    type: "n8n-nodes-base.stickyNote",
    typeVersion: 1,
    position: [ -40, -140 ]
  };

  wfAyuda.nodes = wfAyuda.nodes.filter(n => n.type !== 'n8n-nodes-base.stickyNote');
  wfAyuda.nodes.push(ayudaSticky);
  fs.writeFileSync(ayudaPath, JSON.stringify(wfAyuda, null, 2), 'utf8');

  // Actualizar en n8n
  (async () => {
    const put = await fetch(`${BASE}/workflows/${wfAyuda.id}`, {
      method: 'PUT',
      headers: H,
      body: JSON.stringify({ name: wfAyuda.name, nodes: wfAyuda.nodes, connections: wfAyuda.connections, settings: { executionOrder: "v1" } })
    });
    console.log('Reenviar Ayuda deployed to n8n:', put.status);
  })();
}
