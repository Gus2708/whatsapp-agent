'use strict';

/**
 * Deterministic Installation Kit Resolver for Venezuelan Hardware Store Operations
 * Provides calibrated accessory bundles and intent detection for plumbing, sanitary, and roofing fixtures.
 */

function norm(t){
  return String(t || '').toLowerCase().replace(/(\d)\s*,\s*(\d)/g,'$1.$2').replace(/[×✕✖]/g,'x').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b([cp])\/([a-z])/g, '$1/ $2').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim();
}

const INSTALLATION_KITS = {
  sanitario_poceta: {
    categoria: 'sanitario_poceta',
    nombre: 'Kit de instalación para sanitario o poceta',
    descripcion: 'Kit completo de accesorios para instalar inodoro o poceta con tanque',
    items: [
      { nombre: 'herraje para poceta', cantidad: 1, unidad: 'unidad' },
      { nombre: 'canilla para poceta 1/2 x 7/8', cantidad: 1, unidad: 'unidad' },
      { nombre: 'llave de arresto 1/2', cantidad: 1, unidad: 'unidad' },
      { nombre: 'cuello de cera', cantidad: 1, unidad: 'unidad' },
      { nombre: 'tornillos de fijacion para poceta', cantidad: 1, unidad: 'juego' },
      { nombre: 'teflon', cantidad: 1, unidad: 'rollo' }
    ],
    items_presupuesto: '1 herraje para poceta, 1 canilla para poceta 1/2 x 7/8, 1 llave de arresto 1/2, 1 cuello de cera, 1 juego de tornillos de fijacion para poceta, 1 teflon',
    consejo_tecnico: 'Para instalar una poceta se necesita el herraje del tanque, la canilla de alimentación (1/2 x 7/8), la llave de arresto, el cuello de cera para sellar la base contra malos olores, los tornillos de fijación al piso y teflón.'
  },

  lavamanos: {
    categoria: 'lavamanos',
    nombre: 'Kit de instalación para lavamanos',
    descripcion: 'Accesorios para montaje de lavamanos con grifería y desagüe',
    items: [
      { nombre: 'griferia para lavamanos', cantidad: 1, unidad: 'unidad' },
      { nombre: 'canilla para lavamanos 1/2 x 1/2', cantidad: 2, unidad: 'unidades' },
      { nombre: 'sifon para lavamanos', cantidad: 1, unidad: 'unidad' },
      { nombre: 'llave de arresto 1/2', cantidad: 1, unidad: 'unidad' },
      { nombre: 'teflon', cantidad: 1, unidad: 'rollo' }
    ],
    items_presupuesto: '1 griferia para lavamanos, 2 canillas para lavamanos 1/2 x 1/2, 1 sifon para lavamanos, 1 llave de arresto 1/2, 1 teflon',
    consejo_tecnico: 'Para la instalación de lavamanos se requiere la grifería, dos canillas de 1/2 x 1/2, el sifón / desagüe plástico o cromado, llave de arresto y teflón.'
  },

  fregadero: {
    categoria: 'fregadero',
    nombre: 'Kit de instalación para fregadero',
    descripcion: 'Accesorios para montaje de fregadero de cocina',
    items: [
      { nombre: 'griferia de fregadero', cantidad: 1, unidad: 'unidad' },
      { nombre: 'canilla para fregadero', cantidad: 2, unidad: 'unidades' },
      { nombre: 'contracanasta para fregadero', cantidad: 1, unidad: 'unidad' },
      { nombre: 'sifon para fregadero', cantidad: 1, unidad: 'unidad' },
      { nombre: 'silicon transparente', cantidad: 1, unidad: 'unidad' },
      { nombre: 'teflon', cantidad: 1, unidad: 'rollo' }
    ],
    items_presupuesto: '1 griferia de fregadero, 2 canillas para fregadero, 1 contracanasta para fregadero, 1 sifon para fregadero, 1 silicon transparente, 1 teflon',
    consejo_tecnico: 'Para el fregadero se necesita la grifería (cuello de cisne o monomando), canillas, la contracanasta con sifón, silicón para sellar el borde y teflón para las roscas.'
  },

  techo_laminas: {
    categoria: 'techo_laminas',
    nombre: 'Accesorios para fijación e impermeabilización de láminas de techo',
    descripcion: 'Ganchos, remates y selladores para techado',
    items: [
      { nombre: 'gancho para techo', cantidad: 10, unidad: 'unidades' },
      { nombre: 'caballete para techo', cantidad: 1, unidad: 'unidad' },
      { nombre: 'cemento plastico', cantidad: 1, unidad: 'unidad' }
    ],
    items_presupuesto: '10 ganchos para techo, 1 caballete para techo, 1 cemento plastico',
    consejo_tecnico: 'Para fijar láminas de techo se usan ganchos para techo o tornillos autoperforantes con arandelas de goma, caballete para la cumbrera y cemento plástico para sellar solapes y evitar goteras.'
  },

  tuberias_pvc: {
    categoria: 'tuberias_pvc',
    nombre: 'Kit de pegado e instalación para tuberías PVC',
    descripcion: 'Soldadura química, limpiador y accesorios para tubos de PVC',
    items: [
      { nombre: 'pega soldadura para pvc', cantidad: 1, unidad: 'unidad' },
      { nombre: 'limpiador para pvc', cantidad: 1, unidad: 'unidad' },
      { nombre: 'teflon', cantidad: 1, unidad: 'rollo' }
    ],
    items_presupuesto: '1 pega soldadura para pvc, 1 limpiador para pvc, 1 teflon',
    consejo_tecnico: 'Para instalar tuberías de PVC es indispensable la pega soldadura para PVC, el limpiador para acondicionar la superficie del tubo y teflón para las conexiones roscadas.'
  }
};

function getInstallationKit(category) {
  if (!category || typeof category !== 'string') return null;
  const key = norm(category).replace(/\s+/g, '_');
  return INSTALLATION_KITS[key] || null;
}

function detectInstallationQuery(query) {
  if (!query || typeof query !== 'string') return null;
  const nq = norm(query);

  // Guardias de rechazo inmediato: consultas directas de accesorios individuales NO son solicitudes de kit
  // Ejemplo: "canilla para poceta", "herraje de inodoro", "gancho para techo"
  const isDirectAccessory = /^(?:canillas?|herrajes?|sifones?|sifon|contracanastas?|ganchos?|tornillos?|pega\s+(?:soldadura|para\s+pvc)|teflon|llaves?\s+de\s+arresto|cuello\s+de\s+cera)\b/.test(nq);
  if (isDirectAccessory) {
    // Si empieza por el accesorio pero no pide "kit", "combo", "materiales para instalar", o "que necesito para"
    if (!/\b(?:kit|combo|paquete|juego\s+completo|que\s+necesito|materiales?\s+para\s+instalar)\b/.test(nq)) {
      return null;
    }
  }

  const hasActionCue = /\b(?:instalar|instalacion|montar|colocar|pegar|poner|que\s+necesito\s+para|materiales?\s+para|kit\s+(?:de|para)?|combo\s+(?:de|para)?)\b/.test(nq);
  if (!hasActionCue) return null;

  // 1. Sanitario / Poceta / Inodoro
  if (/\b(?:pocetas?|inodoros?|sanitarios?|wc|taza\s+sanitaria)\b/.test(nq)) {
    return {
      match: true,
      categoria: 'sanitario_poceta',
      kit: INSTALLATION_KITS.sanitario_poceta
    };
  }

  // 2. Lavamanos / Lavatorio
  if (/\b(?:lavamanos?|lavatorios?|bachas?\s+(?:de\s+ba[nñ]o)?)\b/.test(nq)) {
    return {
      match: true,
      categoria: 'lavamanos',
      kit: INSTALLATION_KITS.lavamanos
    };
  }

  // 3. Fregadero / Lavaplatos
  if (/\b(?:fregaderos?|lavaplatos?)\b/.test(nq)) {
    return {
      match: true,
      categoria: 'fregadero',
      kit: INSTALLATION_KITS.fregadero
    };
  }

  // 4. Techo / Láminas
  if (/\b(?:laminas?\s+(?:de\s+)?techo|techo|laminas?\s+de\s+zinc|acerolit)\b/.test(nq) &&
      /\b(?:instalar|colocar|fijar|montar|kit|combo|accesorios?)\b/.test(nq)) {
    return {
      match: true,
      categoria: 'techo_laminas',
      kit: INSTALLATION_KITS.techo_laminas
    };
  }

  // 5. Tuberías PVC
  if (/\b(?:tuberias?|tubos?\s+pvc|aguas?\s+negras?|aguas?\s+blancas?)\b/.test(nq) &&
      /\b(?:instalar|pegar|kit|combo|accesorios?|materiales?)\b/.test(nq)) {
    return {
      match: true,
      categoria: 'tuberias_pvc',
      kit: INSTALLATION_KITS.tuberias_pvc
    };
  }

  return null;
}

function findComplementaryKit(productName, department) {
  if (!productName || typeof productName !== 'string') return null;
  const np = norm(productName);

  // 1. Sanitario / Poceta
  if (/\b(?:pocetas?|inodoros?|taza\s+sanitaria)\b/.test(np)) {
    // Excluir si ya es un accesorio (herraje, canilla, tornillo)
    if (!/\b(?:herraje|canilla|tornillo|cuello|tapa|asiento)\b/.test(np)) {
      return INSTALLATION_KITS.sanitario_poceta;
    }
  }

  // 2. Fregadero
  if (/\bfregaderos?\b/.test(np)) {
    if (!/\b(?:griferia|canilla|sifon|contracanasta)\b/.test(np)) {
      return INSTALLATION_KITS.fregadero;
    }
  }

  // 3. Lavamanos
  if (/\blavamanos?\b/.test(np)) {
    if (!/\b(?:griferia|canilla|sifon|llave|kit)\b/.test(np)) {
      return INSTALLATION_KITS.lavamanos;
    }
  }

  // 4. Láminas de techo
  if (/\blamina\s+(?:de\s+)?(?:zinc|techo|galv|ondulada|arquitectonica|acerolit)\b/.test(np) ||
      /\blamina\s+zinc\b/.test(np)) {
    return INSTALLATION_KITS.techo_laminas;
  }

  return null;
}

module.exports = {
  INSTALLATION_KITS,
  getInstallationKit,
  detectInstallationQuery,
  findComplementaryKit
};
