const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// Check Chat Session via Supabase REST (reemplaza el nodo Postgres roto).
// Upsert por telefono con rate-limit por ventana de 60s. Devuelve {estado, msg_count, telefono}.
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
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
