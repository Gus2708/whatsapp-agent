// buscar_memoria: recupera el cliente desde Supabase (tabla clientes) por telefono.
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON };
let { telefono } = query;
try { const w = $('Webhook Trigger').first().json.body.payload; if (w && w.from) telefono = w.from; } catch (e) {}
if (!telefono) return JSON.stringify({ encontrado: false, nota: 'falta telefono' });
telefono = String(telefono).trim();
try {
  const r = await axios.get(SB + '/rest/v1/clientes_chat?telefono=eq.' + encodeURIComponent(telefono) + '&select=nombre,notas', { headers: H });
  const c = r.data && r.data[0];
  if (!c) return JSON.stringify({ encontrado: false, nombre: null, notas: null });
  return JSON.stringify({ encontrado: true, nombre: c.nombre || null, notas: c.notas || null });
} catch (e) {
  return JSON.stringify({ encontrado: false, error: String(e.message) });
}
