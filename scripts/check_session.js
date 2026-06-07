// Check Chat Session via Supabase REST (reemplaza el nodo Postgres roto).
// Upsert por telefono con rate-limit por ventana de 60s. Devuelve {estado, msg_count, telefono}.
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
let estado = 'automatico', msg_count = 1;
try {
  if (telefono) {
    const r = await axios.get(SB + '/rest/v1/chat_sessions?telefono=eq.' + encodeURIComponent(telefono) + '&select=estado,msg_count,window_start', { headers: H });
    const row = r.data && r.data[0];
    const now = Date.now();
    let window_start;
    if (row) {
      estado = row.estado || 'automatico';
      const ws = row.window_start ? new Date(row.window_start).getTime() : 0;
      if (now - ws > 60000) { msg_count = 1; window_start = new Date().toISOString(); }
      else { msg_count = (Number(row.msg_count) || 0) + 1; window_start = row.window_start; }
    } else {
      msg_count = 1; window_start = new Date().toISOString();
    }
    await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono, estado, msg_count, window_start, updated_at: new Date().toISOString() }, { headers: H });
  }
} catch (e) {}
return [{ json: { estado, msg_count, telefono } }];
