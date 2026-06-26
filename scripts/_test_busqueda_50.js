// Harness: ejecuta el CUERPO REAL de live_buscar.js contra Supabase real con 50
// mensajes fieles (reales de solicitudes_ayuda + frases de chats + variantes de
// productos que sabemos que existen) para cazar fallas del algoritmo de búsqueda.
const fs = require('fs');
const path = require('path');

// --- shim de axios sobre fetch global (n8n trae axios; aquí no está instalado) ---
const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); const data = await r.json().catch(() => null); return { data }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: (cfg && cfg.headers) || {}, body: JSON.stringify(body) }); const data = await r.json().catch(() => null); return { data }; },
};
const fakeRequire = (n) => (n === 'axios' ? axiosShim : require(n));

const body = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runBuscar = new AsyncFunction('require', 'query', body);

// q = consulta del cliente | exists = ¿esperamos que SÍ exista en catálogo? (true/false/null=desconocido)
const TESTS = [
  // ---- 21 reales de solicitudes_ayuda (motivo=no_encontrado) ----
  { q: 'Tiene pipas de agua de 200', exists: null, src: 'real' },
  { q: 'Saludos me puede dar precio de lámina arquitectónica 0,30 mts en bolívares', exists: true, src: 'real' },
  { q: 'tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho q presio la tienes', exists: true, src: 'real' },
  { q: 'que precio tiene la estructura o soporte del cielo razo porfavor', exists: null, src: 'real' },
  { q: 'son paneles de esos que vienen en papel tapiz que uno se los pega a la pared del baño', exists: null, src: 'real' },
  { q: 'Tornillo tres cuartos con tuerca y arandela', exists: null, src: 'real' },
  { q: 'Piston de guadaña de 53cc o 45mm tienes?', exists: null, src: 'real' },
  { q: 'Me regalas fotos de las manillas de acero', exists: null, src: 'real' },
  { q: 'Buenas tardes. Tienen tabelones', exists: null, src: 'real' },
  { q: 'Esas son de 0,30 ml', exists: null, src: 'real' },
  { q: 'Que precio este tipo de sinz de 6 metros', exists: true, src: 'real' },
  { q: 'Buenas tardes tiene disponible laminas arquitectónicas de 6 metros calibre 30', exists: true, src: 'real' },
  { q: 'Buenos días,que precio tienen las láminas de zinc de 12 pies prepintadas', exists: null, src: 'real' },
  { q: 'Buenas tardes tiene tubo estructural de 4x4', exists: null, src: 'real' },
  { q: 'Y de 1.1', exists: null, src: 'real' },
  { q: 'Saludos buen dia tiene laminas arquitectonica calibre 0.30 de 6 metros de largo x 1.10 de ancho', exists: true, src: 'real' },
  { q: 'Buenas tardes tienen protector de aire 110v y que precio', exists: null, src: 'real' },
  { q: 'venden arena fina? necesito un metro por fa', exists: null, src: 'real' },
  { q: 'Buenas tardes tiene tabelon de 20', exists: null, src: 'real' },
  { q: 'me das precio de la malla truckson', exists: null, src: 'real' },
  { q: 'tienen cemento blanco saco', exists: true, src: 'real' },
  // ---- frases del chat pegado por el dueño ----
  { q: 'Tubo Herreria 2X2 0.90MM 6MTS', exists: true, src: 'chat' },
  { q: 'Tubo Herrería 2X1X0.80X6MTS', exists: true, src: 'chat' },
  { q: 'tubo 2x2', exists: true, src: 'chat' },
  { q: 'tubo 1x2', exists: true, src: 'chat' },
  { q: 'Hereroa', exists: null, src: 'chat-typo' },
  { q: 'herreria', exists: true, src: 'chat' },
  // ---- variantes realistas de productos que SÍ existen (cazar falsos negativos) ----
  { q: 'lamina de zinc', exists: true, src: 'cat' },
  { q: 'cuanto vale el saco de cemento', exists: true, src: 'cat' },
  { q: 'cemento gris', exists: true, src: 'cat' },
  { q: 'cabilla 1/2', exists: true, src: 'cat' },
  { q: 'cabilla 3/8', exists: true, src: 'cat' },
  { q: 'cabilla de 12mm', exists: true, src: 'cat' },
  { q: 'cabilla cuadrada', exists: null, src: 'cat' },
  { q: 'tienen cabilla', exists: true, src: 'cat' },
  { q: 'tornillos', exists: true, src: 'cat' },
  { q: 'clavos de 2 pulgadas', exists: true, src: 'cat' },
  { q: 'un kilo de clavos', exists: true, src: 'cat' },
  { q: 'teipe negro', exists: true, src: 'cat' },
  { q: 'cable thwn 12', exists: true, src: 'cat' },
  { q: 'cable numero 12', exists: true, src: 'cat' },
  { q: 'tubo pvc de 1/2 para agua', exists: true, src: 'cat' },
  { q: 'codo de 1/2', exists: true, src: 'cat' },
  { q: 'llave de paso', exists: null, src: 'cat' },
  { q: 'disco de corte', exists: true, src: 'cat' },
  { q: 'pega para pvc', exists: true, src: 'cat' },
  { q: 'silicon transparente', exists: null, src: 'cat' },
  { q: 'pintura blanca de caucho', exists: null, src: 'cat' },
  { q: 'tubo de luz de 1/2', exists: true, src: 'cat' },
  { q: 'angulo de 1 pulgada', exists: null, src: 'cat' },
  { q: 'fregadero de un poceta', exists: null, src: 'cat' },
];

function classify(parsed, t) {
  const flags = [];
  const pedir = parsed.instruccion && /PEDIR_AYUDA/.test(parsed.instruccion);
  const debil = parsed.instruccion && /NO coincide|casualidad/.test(parsed.instruccion);
  if (parsed.encontrados === 0 || pedir) {
    flags.push(t.exists === true ? '❌ FALSO-NEGATIVO?(esperado existe)' : '· no encontrado');
  }
  if (debil) flags.push('⚠ DÉBIL');
  // ¿el top está agotado teniendo el algoritmo que priorizar disponibles?
  if (parsed.productos && parsed.productos.length > 1 && parsed.productos[0].disponible === false && parsed.productos.some(p => p.disponible)) {
    flags.push('⚠ TOP-AGOTADO-con-disponibles');
  }
  return flags;
}

(async () => {
  const results = [];
  for (let i = 0; i < TESTS.length; i++) {
    const t = TESTS[i];
    let parsed, err = null;
    try {
      const out = await runBuscar(fakeRequire, { p_busqueda: t.q });
      parsed = JSON.parse(out);
    } catch (e) { err = e.message; parsed = { encontrados: -1, _err: true }; }
    const flags = err ? ['💥 EXCEPCIÓN: ' + err] : classify(parsed, t);
    results.push({ i: i + 1, t, parsed, flags });
    const names = (parsed.productos || []).map(p => p.nombre + (p.disponible ? '' : '·AGOTADO')).join(' | ') || '—';
    console.log(`${String(i + 1).padStart(2)}. [${t.src}] "${t.q.slice(0, 60)}"`);
    console.log(`    enc=${parsed.encontrados}  ${flags.join('  ') || 'ok'}`);
    console.log(`    => ${names.slice(0, 180)}`);
  }
  // resumen
  console.log('\n================ RESUMEN ================');
  const fn = results.filter(r => r.flags.some(f => f.includes('FALSO-NEGATIVO')));
  const debil = results.filter(r => r.flags.some(f => f.includes('DÉBIL')));
  const agot = results.filter(r => r.flags.some(f => f.includes('AGOTADO-con')));
  const exc = results.filter(r => r.flags.some(f => f.includes('EXCEPCIÓN')));
  const noEnc = results.filter(r => r.parsed.encontrados === 0);
  console.log('Total:', results.length, '| sin resultados:', noEnc.length, '| FALSO-NEGATIVO sospechoso:', fn.length, '| débiles:', debil.length, '| top-agotado:', agot.length, '| excepciones:', exc.length);
  if (fn.length) { console.log('\n-- FALSOS NEGATIVOS SOSPECHOSOS (producto debería existir) --'); fn.forEach(r => console.log('  #' + r.i, '"' + r.t.q.slice(0, 70) + '"')); }
  if (exc.length) { console.log('\n-- EXCEPCIONES --'); exc.forEach(r => console.log('  #' + r.i, r.flags.join(' '))); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
