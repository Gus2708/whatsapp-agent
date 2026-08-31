const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const envPath = path.join(ROOT, '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();

const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

// Parser de argumentos: --busqueda "..." --sku "..." --canonico "..."
const args = process.argv.slice(2);
let busqueda = '', sku = '', canonico = '';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--busqueda' && args[i + 1]) busqueda = args[++i];
  else if (args[i] === '--sku' && args[i + 1]) sku = args[++i];
  else if (args[i] === '--canonico' && args[i + 1]) canonico = args[++i];
}

if (!busqueda && !sku) {
  console.log(`
Uso de feedback para Auto-Mejora:
  node scripts/feedback_automejora.js --busqueda "consulta fallida" --sku "codigo_producto" [--canonico "termino_real"]

Ejemplo:
  node scripts/feedback_automejora.js --busqueda "disco diamantado para concreto 7 pulgadas" --sku "01726"
`);
  process.exit(1);
}

(async () => {
  console.log(`\n🛠️  Procesando feedback de Auto-Mejora...`);
  console.log(`• Consulta: "${busqueda}"`);
  console.log(`• SKU Real: "${sku}"\n`);

  // 1. Obtener producto real
  let prod = null;
  if (sku) {
    const res = await fetch(`${SB}/rest/v1/productos?codigo_interno=eq.${encodeURIComponent(sku)}`, { headers: H });
    const rows = await res.json();
    prod = rows && rows[0];
    if (!prod) {
      console.error(`❌ Error: No se encontró el producto con SKU ${sku} en Supabase.`);
      process.exit(1);
    }
    console.log(`✅ Producto encontrado: [${prod.codigo_interno}] ${prod.descripcion} ($${prod.precio_venta} | Stock: ${prod.existencia})`);
  }

  // 2. Extraer términos y sinónimos canónicos
  const terminoCanonico = canonico || (prod ? prod.descripcion.toLowerCase() : busqueda.toLowerCase());

  // 3. Upsert en catalogo_vocabulario
  if (busqueda) {
    const payload = {
      termino: busqueda.toLowerCase().trim(),
      canonico: terminoCanonico,
      categoria: 'retroalimentacion_admin',
      origen: 'admin_feedback',
      confianza: 10,
      activo: true
    };
    const resVocab = await fetch(`${SB}/rest/v1/catalogo_vocabulario`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(payload)
    });
    console.log(`✅ Vocabulario actualizado en Supabase (catalogo_vocabulario) con confianza 10.`);
  }

  // 4. Actualizar log en automejora_logs si existe para esta consulta
  try {
    const searchParam = encodeURIComponent(busqueda || '');
    const logRes = await fetch(`${SB}/rest/v1/automejora_logs?consulta=ilike.*${searchParam}*&order=creado_en.desc&limit=1`, { headers: H });
    const logs = await logRes.json();
    if (logs && logs.length > 0) {
      const logId = logs[0].id;
      await fetch(`${SB}/rest/v1/automejora_logs?id=eq.${logId}`, {
        method: 'PATCH',
        headers: H,
        body: JSON.stringify({
          estado: 'corregido_por_admin',
          solucion_propuesta: {
            sku_corregido: sku,
            descripcion_producto: prod ? prod.descripcion : '',
            termino_canonico: terminoCanonico,
            nota: 'Corregido por intervención del administrador'
          }
        })
      });
      console.log(`✅ Log de Auto-Mejora (ID ${logId}) marcado como 'corregido_por_admin'.`);
    }
  } catch (e) {
    console.warn(`(Nota: no se pudo actualizar el log histórico: ${e.message})`);
  }

  console.log(`\n🎉 Feedback aplicado con éxito. El motor de búsqueda ya reconoce esta equivalencia.`);
})();
