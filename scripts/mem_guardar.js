// guardar_memoria: upsert del cliente en Supabase (tabla clientes), llaveado por telefono.
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = query.telefono;
let nombre = query.nombre || query.name || query.nombre_cliente || query.cliente || '';
let nota = query.nota || query.note || query.notas || query.preferencia || query.dato || query.content || query.observacion || '';
// El telefono real viene del webhook; no dependemos de que el modelo lo pase.
try { const w = $('Webhook Trigger').first().json.body.payload; if (w && w.from) telefono = w.from; } catch (e) {}
if (!telefono) return JSON.stringify({ guardado: false, error: 'falta telefono' });
telefono = String(telefono).trim();
try {
  let prev = null;
  try { const r = await axios.get(SB + '/rest/v1/clientes_chat?telefono=eq.' + encodeURIComponent(telefono) + '&select=nombre,notas', { headers: H }); prev = r.data && r.data[0]; } catch (e) {}
  const row = { telefono, updated_at: new Date().toISOString() };
  if (nombre && String(nombre).trim()) row.nombre = String(nombre).trim();
  if (nota && String(nota).trim()) {
    const limpia = String(nota).trim();
    const existentes = (prev && prev.notas) ? prev.notas : '';
    // evita duplicar la misma nota
    if (!existentes.toLowerCase().includes(limpia.toLowerCase())) {
      row.notas = existentes ? (existentes + ' | ' + limpia) : limpia;
    }
  }
  await axios.post(SB + '/rest/v1/clientes_chat', row, { headers: H });
  return JSON.stringify({ guardado: true, telefono, nombre: row.nombre || (prev && prev.nombre) || null });
} catch (e) {
  return JSON.stringify({ guardado: false, error: String(e.message) });
}
