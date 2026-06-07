// Set Chat Manual via Supabase REST (reemplaza el nodo Postgres roto).
// Marca la sesion del cliente como 'manual' para que el bot deje de responder (lo atiende un humano).
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = null;
try { telefono = $('Webhook Trigger').first().json.body.payload.from; } catch (e) {}
try { if (telefono) { await axios.post(SB + '/rest/v1/chat_sessions?on_conflict=telefono', { telefono, estado: 'manual', updated_at: new Date().toISOString() }, { headers: H }); } } catch (e) {}
return [{ json: $json }];
