// Nodo de codigo "Cliente Memoria": recall determinista + guardado automatico del nombre.
// Corre en el flujo principal antes del AI Agent. Nunca rompe el flujo (todo en try/catch).
const axios = require('axios');
const SB = 'https://rgniqjfooifchyctnbzu.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' };
let telefono = null, mensaje = '', nombre = null, notas = null;
try { const p = $('Webhook Trigger').first().json.body.payload; telefono = p && p.from; mensaje = (p && p.body) || ''; } catch (e) {}
// 1) Cargar memoria existente (recall)
try {
  if (telefono) {
    const r = await axios.get(SB + '/rest/v1/clientes_chat?telefono=eq.' + encodeURIComponent(telefono) + '&select=nombre,notas', { headers: H });
    if (r.data && r.data[0]) { nombre = r.data[0].nombre || null; notas = r.data[0].notas || null; }
  }
} catch (e) {}
// 2) Detectar y guardar el nombre si aun no lo tenemos
try {
  if (telefono && !nombre && mensaje) {
    const m = mensaje.match(/(?:me\s+llamo|mi\s+nombre\s+es|me\s+dicen|habla|le\s+habla|aqui|soy)\s+([A-Za-zÀ-ſ]{3,}(?:\s+[A-Za-zÀ-ſ]{2,})?)/i);
    if (m) {
      let cand = m[1].trim().replace(/\s+/g, ' ');
      const stop = ['de','del','la','el','un','una','que','muy','bien','aqui','interesado','interesada','cliente','buscando','viendo','para','por','con','tu','su','mi','este','esta','buenas','buenos'];
      const w0 = cand.split(' ')[0].toLowerCase();
      // segunda palabra: si es un verbo/relleno comun, quedarse solo con la primera
      const parts = cand.split(' ');
      if (parts[1]) { const v=['necesito','quiero','busco','ando','estoy','tengo','voy','y','me','que','por','para','de'].includes(parts[1].toLowerCase()); if (v) cand = parts[0]; }
      if (!stop.includes(w0) && cand.length >= 3) {
        nombre = cand.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        try { await axios.post(SB + '/rest/v1/clientes_chat', { telefono, nombre, updated_at: new Date().toISOString() }, { headers: H }); } catch (e) {}
      }
    }
  }
} catch (e) {}
return [{ json: { cliente_nombre: nombre, cliente_notas: notas, telefono_cliente: telefono } }];
