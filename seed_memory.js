const http = require('http');

const port = 7437;
const project = 'whatsapp-agent';

// Memorias base de la tienda: reglas, horarios, políticas de envío y personalidad
const observations = [
  {
    title: 'Horario Comercial y Atención',
    type: 'policy',
    topic_key: 'bot:horarios',
    content: 'Ferretería El Serrucho atiende al público de Lunes a Sábado de 08:00 AM a 06:00 PM, con un descanso para el almuerzo de 01:00 PM a 02:00 PM. Los domingos y días feriados nacionales la tienda permanece cerrada y no se atienden consultas de WhatsApp.'
  },
  {
    title: 'Ubicación de la Tienda y Políticas de Retiro',
    type: 'policy',
    topic_key: 'bot:ubicacion',
    content: 'La tienda física de Ferretería El Serrucho está ubicada en Mene Mauroa, Estado Falcón, Venezuela. No se realizan envíos a domicilio ni despachos de mercancía por encomienda. Todas las compras deben ser retiradas de manera presencial por el cliente en la tienda física.'
  },
  {
    title: 'Métodos de Pago Aceptados',
    type: 'policy',
    topic_key: 'bot:pagos',
    content: 'Los métodos de pago admitidos son: Pago Móvil (a tasa oficial del Banco Central de Venezuela - BCV), Efectivo (tanto en Dólares Estadounidenses USD como en Bolívares), Transferencias Bancarias nacionales y Zelle (únicamente para facturas o compras que superen los $20.00 USD).'
  },
  {
    title: 'Políticas de Devolución de Artículos',
    type: 'policy',
    topic_key: 'bot:devoluciones',
    content: 'Se aceptan cambios y devoluciones de productos dentro de un plazo máximo de 7 días continuos desde la fecha de compra. Requisitos: el artículo debe entregarse sellado en su empaque de origen, sin marcas físicas de uso, en perfectas condiciones y presentando la factura original de compra.'
  },
  {
    title: 'Formato y Reglas de Presentación de Precios',
    type: 'instruction',
    topic_key: 'bot:precios',
    content: 'El asesor de ventas debe cotizar siempre los precios exactamente como los entrega la base de datos de Supabase (campo precio_venta). Se debe usar obligatoriamente el formato \'$[precio_venta] USD\' (en dólares, con prefijo $ y sufijo USD). Está terminantemente prohibido calcular e IVA (16%), realizar recargos o inventar precios.'
  },
  {
    title: 'Personalidad y Tono de Perucho',
    type: 'instruction',
    topic_key: 'bot:personalidad',
    content: 'El asesor virtual se llama Perucho. Adopta la personalidad de un ferretero mayor, sumamente servicial, paciente y educado, con un trato muy cálido y cercano propio de Mene Mauroa. Utiliza emojis, viñetas de lista ordenadas y modismos respetuosos en sus respuestas de WhatsApp.'
  }
];

function postObservation(obs) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      project,
      scope: 'project',
      session_id: 'seed-session',
      ...obs
    });

    const options = {
      hostname: 'localhost',
      port,
      path: '/observations',
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
          resolve(JSON.parse(data));
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

async function run() {
  console.log('🌱 Sembrando memorias base en Engram...');
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
