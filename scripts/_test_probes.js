// Probes E2E (design rrf-reintento P-2 / R-PROBES): two live queries against the REAL
// matcher (Supabase + OpenAI embeddings) to verify the A3 hybrid adoption rule under
// production conditions:
//
//   'disco de corte'    -> NOT adopted: the lexical top-1 (Disco De Corte...) must
//                          survive without rescue ("sobrevive porque su lexico puntua
//                          0.606: acerto").
//   'tapa para el bano' -> adopted: the vector's top-1 (TAPA DE INODORO, ~0.619) must
//                          replace the lexical top-1 and be flagged as a rescue.
//
// HNSW is approximate, so a single trial of "tapa" can flake (simLex >= 0.52 measured
// close to the band). On failure of trial 1, re-run ONCE and record BOTH trials.
// Writes scratch_live/probes_resultado.json (gitignored; the official artifact of R-PROBES).
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { crearAxiosShim, buscarCon } = require('./_test_coloquial');
const { construirEnv } = require('./_lib_credenciales');

const TAPA_REGEX = /inodoro|poceta|\bwc\b/i;

async function probar(consulta, shim, env) {
  const res = await buscarCon(consulta, shim, env);
  const top1 = res.productos && res.productos.length ? res.productos[0].nombre : null;
  return {
    consulta,
    top1_nombre: top1,
    rescate: Boolean(res.rescate),
    parcial: Boolean(res.parcial),
    adoptado: !!(top1 && TAPA_REGEX.test(top1)),
    error: res.error || null,
  };
}

async function main() {
  const $ENV = construirEnv({ sinVector: false });
  const shim = crearAxiosShim(null, { sinAprender: true });
  const out = { meta: { matcher: 'scratch_live/live_buscar.js (A3 híbrido)', fecha: new Date().toISOString() }, probes: [] };

  // Probe 1: disco de corte — nunca adoptado (sin rescate, top-1 léxico intacto).
  const discoT1 = await probar('disco de corte', shim, $ENV);
  discoT1.esperado = 'NO adoptado: top-1 léxico "Disco De Corte..." sin rescate';
  discoT1.cumple = !discoT1.rescate && /disco/i.test(discoT1.top1_nombre || '') && !discoT1.error;
  out.probes.push(discoT1);

  // Probe 2: tapa para el baño — adoptado (top-1 vectorial TAPA DE INODORO + rescate).
  // HNSW flake tolerable: un re-run; se registran AMBOS trials.
  const tapaT1 = await probar('tapa para el baño', shim, $ENV);
  tapaT1.esperado = 'adoptado: top-1 vectorial (inodoro/poceta/wc) con rescate';
  tapaT1.cumple = tapaT1.rescate && tapaT1.adoptado && !tapaT1.error;
  tapaT1.trial = 1;
  if (!tapaT1.cumple) {
    const tapaT2 = await probar('tapa para el baño', shim, $ENV);
    tapaT2.esperado = tapaT1.esperado;
    tapaT2.cumple = tapaT2.rescate && tapaT2.adoptado && !tapaT2.error;
    tapaT2.trial = 2;
    out.probes.push(tapaT1);
    out.probes.push(tapaT2);
    const ok = tapaT1.cumple || tapaT2.cumple;
    out.veredicto = ok ? 'OK (trial 1 flake, trial 2 confirma)' : 'FAIL';
  } else {
    out.probes.push(tapaT1);
    out.veredicto = 'OK';
  }
  if (!discoT1.cumple) out.veredicto = 'FAIL';

  const ruta = path.join(ROOT, 'scratch_live', 'probes_resultado.json');
  fs.writeFileSync(ruta, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log('\nveredicto:', out.veredicto, '->', ruta);
  process.exit(out.veredicto === 'OK' ? 0 : 1);
}

// Guard: importing this module (e.g. from another script or a test runner) must NOT
// trigger a live probe run. Only a direct `node scripts/_test_probes.js` executes.
if (require.main === module) {
  main().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
} else {
  module.exports = { main, probar };
}