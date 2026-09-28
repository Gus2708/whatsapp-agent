/**
 * lib/store-info.js
 * Authoritative store information and knowledge templates for Ferretería El Serrucho.
 * Provides instant institutional responses without invoking LLM models.
 */

function getStoreData() {
  return {
    name: 'Ferretería El Serrucho 🪚',
    location: 'Estamos ubicados en Mene Mauroa, Estado Falcón, Venezuela.',
    pickup_and_delivery: 'Puedes retirar tus compras directamente en nuestra tienda física. Además, contamos con servicio de transporte de materiales a $10 dentro del casco central de Mene Mauroa (para zonas fuera del casco central, la tarifa la confirma un asesor).',
    hours: 'Atendemos de lunes a sábado de 8:00 AM a 6:00 PM (con descanso para almuerzo de 1:00 PM a 2:00 PM). Domingos y feriados permanecemos cerrados.',
    payments: 'Aceptamos pagos en dólares en efectivo (USD), bolívares en efectivo, Pago Móvil y transferencia bancaria a la tasa oficial del Banco Central de Venezuela (BCV). También aceptamos Zelle para compras a partir de $20.00 USD. Para concretar el pago, un empleado te atiende enseguida o puedes pasar por la tienda física.',
    returns: 'Aceptamos cambios y devoluciones hasta 7 días continuos desde la fecha de compra, presentando el producto sellado en su empaque original y la factura de compra.'
  };
}

const STORE_INFO = getStoreData();

/**
 * Returns specific authoritative store info snippet.
 * @param {string} topic - 'horario' | 'ubicacion' | 'pagos' | 'delivery' | 'devoluciones' | 'general'
 * @returns {string}
 */
function getStoreInfo(topic = 'general') {
  const data = getStoreData();
  const normalized = String(topic || '').toLowerCase().trim();

  if (normalized.includes('horario') || normalized.includes('hora') || normalized.includes('abren') || normalized.includes('cierran')) {
    return `🕒 *Horario de Atención*\n${data.hours}`;
  }
  if (normalized.includes('ubicacion') || normalized.includes('direccion') || normalized.includes('donde') || normalized.includes('llegar')) {
    return `📍 *Ubicación y Entregas*\n${data.location}\n${data.pickup_and_delivery}`;
  }
  if (normalized.includes('pago') || normalized.includes('bcv') || normalized.includes('zelle') || normalized.includes('transferencia') || normalized.includes('dolar')) {
    return `💳 *Métodos de Pago*\n${data.payments}`;
  }
  if (normalized.includes('envio') || normalized.includes('delivery') || normalized.includes('transporte')) {
    return `🚚 *Transporte y Retiro*\n${data.pickup_and_delivery}`;
  }
  if (normalized.includes('devolucion') || normalized.includes('cambio') || normalized.includes('garantia')) {
    return `📦 *Políticas de Devolución*\n${data.returns}`;
  }

  // Fallback to full card
  return `ℹ️ *Información - ${data.name}*\n\n` +
    `📍 *Ubicación:* ${data.location}\n` +
    `🕒 *Horario:* ${data.hours}\n` +
    `💳 *Pagos:* ${data.payments}\n` +
    `🚚 *Entregas:* ${data.pickup_and_delivery}`;
}

/**
 * Formats a ready-to-send WhatsApp store info reply.
 * @param {string} topic
 * @param {object} [options]
 * @returns {string}
 */
function formatStoreInfoReply(topic = 'general', options = {}) {
  const base = getStoreInfo(topic);
  const closing = options.includeHelpPrompt !== false
    ? '\n\n¿En qué producto o cotización te podemos ayudar hoy? 👨🏻‍🔧'
    : '';
  return `${base}${closing}`;
}

/**
 * Detects if a text query specifically targets institutional store info.
 * @param {string} text
 * @returns {'horario'|'ubicacion'|'pagos'|'delivery'|'devoluciones'|'general'|null}
 */
function detectStoreInfoTopic(text) {
  if (!text || typeof text !== 'string') return null;
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/\b(horario|horarios|a que hora|que hora abren|abren hoy|estan abiertos|hasta que hora)\b/.test(t)) {
    return 'horario';
  }
  if (/\b(donde estan|donde queda|ubicacion|direccion|como llegar|estan en mene mauroa)\b/.test(t)) {
    return 'ubicacion';
  }
  if (/\b(metodos? de pago|formas? de pago|aceptan zelle|pago movil|tasa bcv|como pagar|aceptan dolares|reciben bolivares)\b/.test(t)) {
    return 'pagos';
  }
  if (/\b(hacen delivery|costo del envio|transporte|traen a domicilio|hacen envios)\b/.test(t)) {
    return 'delivery';
  }
  if (/\b(politica de devolucion|garantia|hacen cambios|cambiar producto)\b/.test(t)) {
    return 'devoluciones';
  }
  if (/\b(informacion de la tienda|datos de la tienda|quienes son)\b/.test(t)) {
    return 'general';
  }

  return null;
}

module.exports = {
  STORE_INFO,
  getStoreData,
  getStoreInfo,
  formatStoreInfoReply,
  detectStoreInfoTopic
};
