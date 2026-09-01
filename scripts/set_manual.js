const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

// Set Chat Manual via Supabase REST (reemplaza el nodo Postgres roto).
// Marca la sesion del cliente como 'manual' para que el bot deje de responder (lo atiende un humano).
const axios = require('axios');
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
try { if (telefono) { await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono, estado: 'manual', updated_at: new Date().toISOString() }, { headers: H }); } } catch (e) {}
return [{ json: $json }];
