const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.ENGRAM_PORT || 7437);
const project = process.env.PROJECT_NAME || 'whatsapp-agent';

let contextData = {};
try {
  const ctxPath = path.join(__dirname, 'data', 'business_context.json');
  if (fs.existsSync(ctxPath)) {
    contextData = JSON.parse(fs.readFileSync(ctxPath, 'utf8'));
  }
} catch (e) {
  // Fall back to env or defaults
}

const storeName = process.env.STORE_NAME || contextData?.comercio?.nombre || 'Comercio';
const agentName = process.env.AGENT_NAME || 'Asistente de Ventas';
const storeLocation = process.env.STORE_LOCATION || contextData?.comercio?.ubicacion_central || 'Sucursal Principal';
const storeSchedule = process.env.STORE_SCHEDULE || contextData?.comercio?.horarios_atencion?.horario || 'Lunes a Sábado de 08:00 AM a 06:00 PM';
const currency = process.env.STORE_CURRENCY || 'USD';

// Memorias base de la tienda: reglas, horarios, políticas de envío y personalidad
const observations = [
  {
    title: 'Horario Comercial y Atención',
    type: 'policy',
    topic_key: 'bot:horarios',
    content: `${storeName} atiende al público en el siguiente horario: ${storeSchedule}. Los domingos y feriados nacionales la atención de consultas puede estar pausada o diferida.`
  },
  {
    title: 'Ubicación de la Tienda, Retiro y Transporte',
    type: 'policy',
    topic_key: 'bot:ubicacion',
    content: `La tienda física de ${storeName} está ubicada en ${storeLocation}. El cliente puede retirar sus compras presencialmente. Las políticas de despacho y transporte son coordinadas con el equipo o según la zona.`
  },
  {
    title: 'Métodos de Pago Aceptados',
    type: 'policy',
    topic_key: 'bot:pagos',
    content: `Los métodos de pago admitidos en ${storeName} incluyen: Pagos electrónicos, Transferencias Bancarias y Efectivo en moneda local o divisas (${currency}).`
  },
  {
    title: 'Políticas de Devolución de Artículos',
    type: 'policy',
    topic_key: 'bot:devoluciones',
    content: 'Se aceptan cambios y devoluciones dentro del plazo estipulado presentando el empaque original sin uso y el comprobante de compra.'
  },
  {
    title: 'Formato y Reglas de Presentación de Precios',
    type: 'instruction',
    topic_key: 'bot:precios',
    content: `El asesor de ventas cotiza siempre los precios exactos que entrega la base de datos en formato '$[precio_venta] ${currency}'. Está prohibido alterar precios o inventar montos.`
  },
  {
    title: `Personalidad y Tono de ${agentName}`,
    type: 'instruction',
    topic_key: 'bot:personalidad',
    content: `El asesor virtual se llama ${agentName}. Atiende en representación de ${storeName}, con un trato servicial, atento, claro y educado. Utiliza viñetas y formato amigable en sus respuestas de WhatsApp.`
  }
];

const SESSION_ID = 'seed-session';

// Helper genérico para POST JSON contra la API HTTP de Engram
function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`Código ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(payload);
    req.end();
  });
}

// Engram >=1.x exige que la sesión exista antes de guardar observaciones.
// Es idempotente desde el punto de vista del llamador: si ya existe, se ignora.
async function ensureSession() {
  try {
    await postJson('/sessions', { id: SESSION_ID, project, scope: 'project' });
  } catch (e) {
    // Si la sesión ya existe, el servidor responde con error: lo ignoramos.
  }
}

function postObservation(obs) {
  return postJson('/observations', {
    project,
    scope: 'project',
    session_id: SESSION_ID,
    ...obs
  });
}

async function run() {
  console.log('🌱 Sembrando memorias base en Engram...');
  await ensureSession();
  for (const obs of observations) {
    try {
      await postObservation(obs);
      console.log(`✅ Memorizado: "${obs.title}" (Topic: ${obs.topic_key})`);
    } catch (e) {
      console.error(`❌ Error al memorizar "${obs.title}":`, e.message);
    }
  }
  console.log('🎉 Siembra completada exitosamente.');
}

run();
