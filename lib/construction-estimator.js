'use strict';

/**
 * Deterministic Construction Materials Estimator for Venezuelan Hardware Store Trade
 * Standard trade ratios calibrated against Maestro de Obra formulas.
 */

function norm(t){
  return String(t || '').toLowerCase().replace(/(\d)\s*,\s*(\d)/g,'$1.$2').replace(/[×✕✖]/g,'x').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\b([cp])\/([a-z])/g, '$1/ $2').replace(/[^a-z0-9 .\/-]/g,' ').replace(/\s+/g,' ').trim();
}

function estimateConstructionMaterials(task, quantity, options = {}) {
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) {
    return {
      tarea: task,
      descripcion_tarea: 'Tarea no especificada',
      cantidad: 0,
      unidad_entrada: '',
      materiales: [],
      items_presupuesto: '',
      nota_tecnica: 'Cantidad inválida'
    };
  }

  switch (task) {
    case 'pegar_bloques': {
      // 1 saco de cemento gris rinde para ~30 a 35 bloques.
      // Arena lavada: ~0.15 m3 por saco de cemento (1m3 para ~200 bloques).
      const sacosCemento = Math.max(1, Math.ceil(q / 30));
      const m3Arena = Math.max(1, Math.round(sacosCemento * 0.15));
      const materiales = [
        { nombre: 'cemento gris', cantidad: sacosCemento, unidad: 'sacos' },
        { nombre: 'arena lavada', cantidad: m3Arena, unidad: 'metros cubicos' }
      ];
      const items_presupuesto = `${sacosCemento} sacos de cemento gris, ${m3Arena} metro de arena lavada`;
      const nota_tecnica = `Estimado para ${q} bloques (rendimiento: ~30 bloques por saco de cemento gris con junta de 1.5cm).`;
      return {
        tarea: task,
        descripcion_tarea: 'Pegar bloques de arcilla o concreto',
        cantidad: q,
        unidad_entrada: 'bloques',
        materiales,
        items_presupuesto,
        nota_tecnica
      };
    }

    case 'vaciar_piso_losa': {
      // Losa/piso estándar de 10cm de espesor (0.10m3 por m2).
      // 1m3 concreto: 8 sacos cemento, 0.5 m3 arena, 0.75 m3 piedra picada.
      // Por cada m2 de losa: ~0.8 sacos cemento, ~0.05 m3 arena, ~0.075 m3 piedra picada, 1m2 malla.
      const sacosCemento = Math.max(1, Math.ceil(q * 0.8));
      const m3Arena = Math.max(0.5, Math.round((q * 0.05) * 10) / 10);
      const m3Piedra = Math.max(0.5, Math.round((q * 0.075) * 10) / 10);
      const m2Malla = Math.ceil(q);
      const materiales = [
        { nombre: 'cemento gris', cantidad: sacosCemento, unidad: 'sacos' },
        { nombre: 'arena lavada', cantidad: m3Arena, unidad: 'metros cubicos' },
        { nombre: 'piedra picada', cantidad: m3Piedra, unidad: 'metros cubicos' },
        { nombre: 'malla truckson', cantidad: m2Malla, unidad: 'metros cuadrados' }
      ];
      const items_presupuesto = `${sacosCemento} sacos de cemento gris, ${m3Arena} metro de arena lavada, ${m3Piedra} metros de piedra picada, ${m2Malla} metros de malla truckson`;
      const nota_tecnica = `Estimado para vaciado de ${q} m² de piso/losa (espesor estándar 10 cm con refuerzo de malla truckson).`;
      return {
        tarea: task,
        descripcion_tarea: 'Vaciar piso o placa de concreto (10cm)',
        cantidad: q,
        unidad_entrada: 'm2',
        materiales,
        items_presupuesto,
        nota_tecnica
      };
    }

    case 'frisar_pared': {
      // Friso / revoque de pared (espesor 1.5cm).
      // 1 saco de cemento rinde para ~7 m2 de friso.
      // Arena fina: ~0.025 m3 por m2 de pared.
      const sacosCemento = Math.max(1, Math.ceil(q / 7));
      const m3Arena = Math.max(0.5, Math.round((q * 0.025) * 10) / 10);
      const materiales = [
        { nombre: 'cemento gris', cantidad: sacosCemento, unidad: 'sacos' },
        { nombre: 'arena fina', cantidad: m3Arena, unidad: 'metros cubicos' }
      ];
      const items_presupuesto = `${sacosCemento} sacos de cemento gris, ${m3Arena} metros de arena fina`;
      const nota_tecnica = `Estimado para frisar ${q} m² de pared (espesor 1.5 cm).`;
      return {
        tarea: task,
        descripcion_tarea: 'Frisar o revocar paredes',
        cantidad: q,
        unidad_entrada: 'm2',
        materiales,
        items_presupuesto,
        nota_tecnica
      };
    }

    case 'cerca_alambre_pua': {
      // Cerca estándar de 4 líneas de alambre de púa.
      // Grapas: 1 empaque de 500g cada 50 metros.
      const lineas = options.lineas || 4;
      const metrosAlambre = q * lineas;
      const empaquesGrapas = Math.max(1, Math.ceil(q / 50));
      const materiales = [
        { nombre: 'alambre de pua', cantidad: metrosAlambre, unidad: 'metros' },
        { nombre: 'grapas para alambre de pua', cantidad: empaquesGrapas, unidad: 'empaque 500gr' }
      ];
      const items_presupuesto = `${metrosAlambre} metros de alambre de pua, ${empaquesGrapas} empaque de grapas para alambre de pua`;
      const nota_tecnica = `Estimado para cerca perimetral de ${q} metros lineales (${lineas} líneas de alambre de púa con grapas).`;
      return {
        tarea: task,
        descripcion_tarea: 'Cerca perimetral con alambre de púa',
        cantidad: q,
        unidad_entrada: 'metros',
        materiales,
        items_presupuesto,
        nota_tecnica
      };
    }

    case 'pintar_superficie': {
      // Rendimiento pintura: ~30 m2 por galón a dos manos, ~120 m2 por cuñete (4 galones).
      let materiales = [];
      let items_presupuesto = '';
      if (q >= 80) {
        const cunetes = Math.max(1, Math.ceil(q / 120));
        materiales.push({ nombre: 'cuñete de pintura caucho blanco', cantidad: cunetes, unidad: 'cuñete' });
        items_presupuesto = `${cunetes} cuñete de pintura caucho blanco`;
      } else {
        const galones = Math.max(1, Math.ceil(q / 30));
        materiales.push({ nombre: 'galon de pintura caucho blanco', cantidad: galones, unidad: 'galon' });
        items_presupuesto = `${galones} galon de pintura caucho blanco`;
      }
      materiales.push(
        { nombre: 'rodillo para pintar', cantidad: 1, unidad: 'unidad' },
        { nombre: 'brocha para pintar', cantidad: 1, unidad: 'unidad' },
        { nombre: 'tirro de papel', cantidad: 1, unidad: 'unidad' }
      );
      items_presupuesto += ', 1 rodillo para pintar, 1 brocha para pintar, 1 tirro de papel';
      const nota_tecnica = `Estimado para pintar ${q} m² de superficie a 2 manos con accesorios básicos.`;
      return {
        tarea: task,
        descripcion_tarea: 'Pintar paredes o techos (2 manos)',
        cantidad: q,
        unidad_entrada: 'm2',
        materiales,
        items_presupuesto,
        nota_tecnica
      };
    }

    default:
      return {
        tarea: task,
        descripcion_tarea: 'Tarea no reconocida',
        cantidad: q,
        unidad_entrada: '',
        materiales: [],
        items_presupuesto: '',
        nota_tecnica: 'No se encontraron fórmulas para la tarea especificada.'
      };
  }
}

function detectConstructionTask(query) {
  if (!query || typeof query !== 'string') return null;
  const nq = norm(query);

  // Guardias de rechazo inmediato: consultas directas de producto no son estimaciones
  if (/^(?:bloques?|cemento|cabillas?|tubos?|laminas?|alambre|pinturas?|tornillos?|malla)\b/.test(nq)) {
    // Si empieza directamente con el nombre del producto, es búsqueda de producto
    // a menos que contenga un verbo explícito de estimación ("cuanto material para...")
    if (!/\b(?:cuanto material|que necesito para|combo para|materiales para)\b/.test(nq)) {
      return null;
    }
  }

  // 1. Tarea: Pegar Bloques
  const isBloques = /\b(?:pegar|pega|asentar|colocar|levantar)\s+(?:los\s+)?bloques?\b/.test(nq) ||
    /\b(?:bloques?)\b/.test(nq) && /\b(?:cuanto\s+cemento|cuanto\s+material|que\s+necesito|cuanta\s+arena|materiales?\s+para)\b/.test(nq);
  if (isBloques) {
    const m = nq.match(/\b(\d+)\s*(?:bloques?|blq)?\b/);
    if (m && Number(m[1]) > 0) {
      const cantidad = Number(m[1]);
      return {
        match: true,
        tarea: 'pegar_bloques',
        cantidad,
        unidad: 'bloques',
        requires_dimension: false
      };
    }
    return {
      match: true,
      tarea: 'pegar_bloques',
      requires_dimension: true,
      mensaje_aclarar: '¿Cuántos bloques vas a pegar? Indícame la cantidad para calcularte los sacos de cemento y metros de arena necesarios.'
    };
  }

  // 2. Tarea: Vaciar Piso / Placa / Losa
  const isVaciar = /\b(?:vaciar|vaciado|echar|hacer)\s+(?:un\s+|una\s+)?(?:placa|piso|losa|contrapiso|plataforma|camino|acera)\b/.test(nq) ||
    /\b(?:placa|piso|losa)\b/.test(nq) && /\b(?:que\s+necesito|cuanto\s+material|cuanto\s+cemento|para\s+vaciar|materiales?\s+para)\b/.test(nq);
  if (isVaciar) {
    const m = nq.match(/\b(\d+(?:\.\d+)?)\s*(?:m2|mts2|metros?\s+cuadrados?|mts|metros?)\b/);
    if (m && Number(m[1]) > 0) {
      const cantidad = Number(m[1]);
      return {
        match: true,
        tarea: 'vaciar_piso_losa',
        cantidad,
        unidad: 'm2',
        requires_dimension: false
      };
    }
    return {
      match: true,
      tarea: 'vaciar_piso_losa',
      requires_dimension: true,
      mensaje_aclarar: '¿De cuántos metros cuadrados (m²) o qué medidas (largo x ancho) es el piso o placa que vas a vaciar? Con eso te calculo exacto el cemento, arena, piedra y malla truckson.'
    };
  }

  // 3. Tarea: Frisar Pared
  const isFrisar = /\b(?:frisar|friso|revoque|revocar|pañetar)\b/.test(nq) ||
    /\b(?:pared|paredes)\b/.test(nq) && /\b(?:para\s+frisar|cuanto\s+cemento|materiales?\s+para)\b/.test(nq);
  if (isFrisar) {
    const m = nq.match(/\b(\d+(?:\.\d+)?)\s*(?:m2|mts2|metros?\s+cuadrados?|mts|metros?)\b/);
    if (m && Number(m[1]) > 0) {
      const cantidad = Number(m[1]);
      return {
        match: true,
        tarea: 'frisar_pared',
        cantidad,
        unidad: 'm2',
        requires_dimension: false
      };
    }
    return {
      match: true,
      tarea: 'frisar_pared',
      requires_dimension: true,
      mensaje_aclarar: '¿Cuántos metros cuadrados de pared vas a frisar? Indícame la medida para calcularte el cemento y la arena fina.'
    };
  }

  // 4. Tarea: Cerca con Alambre de Púa
  const isCerca = /\b(?:cerca|cercar|alambrado)\b/.test(nq) && /\b(?:alambre\s+de\s+pua|puas?)\b/.test(nq) ||
    /\b(?:alambre\s+de\s+pua)\b/.test(nq) && /\b(?:para\s+(?:armar|hacer|una)?\s*cerca|combo|cuanto\s+alambre)\b/.test(nq);
  if (isCerca) {
    const m = nq.match(/\b(\d+(?:\.\d+)?)\s*(?:m|mts|metros?)\b/);
    if (m && Number(m[1]) > 0) {
      const cantidad = Number(m[1]);
      return {
        match: true,
        tarea: 'cerca_alambre_pua',
        cantidad,
        unidad: 'metros',
        requires_dimension: false
      };
    }
    return {
      match: true,
      tarea: 'cerca_alambre_pua',
      requires_dimension: true,
      mensaje_aclarar: '¿De cuántos metros de largo es la cerca que vas a armar? Te calculo los metros o rollos de alambre de púa y las grapas necesarias.'
    };
  }

  // 5. Tarea: Pintar Paredes / Superficies
  const isPintar = /\b(?:cuanta\s+pintura|cuantos?\s+(?:galones?|cu[nñ]etes?)\s+de\s+pintura|pintura\s+para\s+pintar)\b/.test(nq) ||
    /\b(?:pintar)\b/.test(nq) && /\b(?:metros?\s+cuadrados?|m2|casa|habitaci\w*|cuarto|paredes?)\b/.test(nq);
  if (isPintar) {
    const m = nq.match(/\b(\d+(?:\.\d+)?)\s*(?:m2|mts2|metros?\s+cuadrados?|mts|metros?)\b/);
    if (m && Number(m[1]) > 0) {
      const cantidad = Number(m[1]);
      return {
        match: true,
        tarea: 'pintar_superficie',
        cantidad,
        unidad: 'm2',
        requires_dimension: false
      };
    }
    return {
      match: true,
      tarea: 'pintar_superficie',
      requires_dimension: true,
      mensaje_aclarar: '¿Cuántos metros cuadrados vas a pintar o qué medidas tiene el área? Con eso te calculo la cantidad exacta en galones o cuñetes.'
    };
  }

  return null;
}

module.exports = {
  estimateConstructionMaterials,
  detectConstructionTask
};
