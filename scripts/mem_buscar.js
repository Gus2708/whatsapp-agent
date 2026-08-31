const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// buscar_memoria: recupera el cliente desde Supabase (tabla clientes) por telefono.
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
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
