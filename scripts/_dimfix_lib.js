// Biblioteca de parches quirurgicos para el bug de medidas AxB (40x100 -> tubo estructural).
// Usada por test_dim_fix.js (prueba local) y patch_tubos_dim.js (despliegue) para garantizar
// que lo probado == lo desplegado. Cada paso ASEVERA su anchor; si falta, lanza error (no despliega a ciegas).
const fs = require('fs');
const path = require('path');

const NORM_A = ".toLowerCase().normalize('NFD')";
const NORM_B = ".toLowerCase().replace(/[\\u00d7\\u2715\\u2716]/g,'x').normalize('NFD')"; // mapea  x  ✕  ✖  -> 'x' antes de que norm los borre

function replaceOnce(code, oldText, newText, label){
  const i = code.indexOf(oldText);
  if (i < 0) throw new Error('anchor NO encontrado: ' + label);
  if (code.indexOf(oldText, i + oldText.length) >= 0) throw new Error('anchor AMBIGUO (>1): ' + label);
  return code.slice(0, i) + newText + code.slice(i + oldText.length);
}

// 1) norm(): convertir el signo  x  (U+00D7) y similares a la letra 'x' ANTES del strip.
function fixNorm(code){
  if (code.includes('\\u00d7')) return { code, changed: false };       // ya parchado
  return { code: replaceOnce(code, NORM_A, NORM_B, 'norm'), changed: true };
}

// 2) medPresent(): pares de dimensiones order-independent (40x100==100x40) + 2da dimension (...x40).
function fixMedPresent(code){
  const start = code.indexOf('function medPresent(med, nd){');
  if (start < 0) throw new Error('medPresent no encontrado');
  if (code.indexOf('Par de dimensiones AxB', start) >= 0 && code.indexOf('Par de dimensiones AxB', start) < start + 4000) {
    return { code, changed: false }; // ya parchado
  }
  const ti = code.indexOf('const esc = med.replace', start);   // unico: var med con espacios (la rama SIZEQ usa esc=a.replace)
  if (ti < 0) throw new Error('medPresent: cola (const esc = med.replace) no encontrada');
  const ri = code.indexOf('.test(nd);', ti);                   // fin del return final
  if (ri < 0) throw new Error('medPresent: .test(nd) final no encontrado');
  const endBrace = code.indexOf('}', ri);                      // brace de cierre de la funcion (no hay } entre .test(nd); y })
  if (endBrace < 0) throw new Error('medPresent: brace de cierre no encontrado');
  const oldText = code.slice(start, endBrace + 1);
  const newText = fs.readFileSync(path.join(__dirname, '_fix_medPresent.txt'), 'utf8').replace(/\r\n/g, '\n').trim();
  return { code: code.split(oldText).join(newText), changed: true };
}

// 3) hacer_presupuesto: capturar candidatos ANTES del filtro de medida (para alternativas si esta agotado).
const CANDPRE_A = '  // Filtro de MEDIDA\n  if (medLargas.length>0){';
const CANDPRE_B = '  const candPre = cand.slice();\n' + CANDPRE_A;
function fixCandPre(code){
  if (code.includes('const candPre = cand.slice();')) return { code, changed: false };
  return { code: replaceOnce(code, CANDPRE_A, CANDPRE_B, 'candPre'), changed: true };
}

// 4) hacer_presupuesto: alternativas DISPONIBLES de la misma familia cuando el exacto esta agotado.
function fixAlts(code){
  if (code.includes('const bestAgotado')) return { code, changed: false };
  const startA = '  // best = mas vendido';
  const si = code.indexOf(startA);
  if (si < 0) throw new Error('alts: anchor de inicio no encontrado');
  const endMarker = '  return { best, alts };';
  const ei = code.indexOf(endMarker, si);
  if (ei < 0) throw new Error('alts: anchor de fin no encontrado');
  const oldText = code.slice(si, ei + endMarker.length);
  const newText = fs.readFileSync(path.join(__dirname, '_fix_alts.txt'), 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '');
  return { code: code.split(oldText).join(newText), changed: true };
}

// Aplica todos los parches que correspondan a un tool.
function applyFixes(code, kind /* 'buscar' | 'presupuesto' */){
  const log = [];
  let r;
  r = fixNorm(code); code = r.code; log.push('norm:' + (r.changed ? 'OK' : 'ya'));
  r = fixMedPresent(code); code = r.code; log.push('medPresent:' + (r.changed ? 'OK' : 'ya'));
  if (kind === 'presupuesto'){
    r = fixCandPre(code); code = r.code; log.push('candPre:' + (r.changed ? 'OK' : 'ya'));
    r = fixAlts(code); code = r.code; log.push('alts:' + (r.changed ? 'OK' : 'ya'));
  }
  return { code, log };
}

module.exports = { applyFixes, fixNorm, fixMedPresent, fixCandPre, fixAlts };
