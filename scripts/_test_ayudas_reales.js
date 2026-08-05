// Golden set: ejecuta el CUERPO REAL de live_buscar.js contra Supabase real con las
// consultas LITERALES de solicitudes_ayuda (las escalaciones reales del bot) y valida
// la CLASE de respuesta esperada tras las mejoras v11:
//   ok        = encontrados>0 sin orden de escalar
//   parcial   = encontrados>0 + parcial:true (variante honesta / medida faltante / fuzzy)
//   aclarar   = aclarar:true (consulta vaga -> preguntar al cliente)
//   no_vendido= no_vendido:true (empleado ya confirmó que no se vende)
//   pedir     = instruccion ordena [PEDIR_AYUDA] como única respuesta (aceptable si de verdad no existe)
const fs = require('fs');
const path = require('path');

const axiosShim = {
  async get(url, cfg) { const r = await fetch(url, { headers: (cfg && cfg.headers) || {} }); const data = await r.json().catch(() => null); return { data }; },
  async post(url, body, cfg) { const r = await fetch(url, { method: 'POST', headers: (cfg && cfg.headers) || {}, body: JSON.stringify(body) }); const data = await r.json().catch(() => null); return { data }; },
};
const fakeRequire = (n) => (n === 'axios' ? axiosShim : require(n));

const body = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const runBuscar = new AsyncFunction('require', 'query', body);

// expect = clases aceptables (la primera es la ideal)
const TESTS = [
  // ---- JULIO (fallas con el algoritmo actual) ----
  { id: 55, q: 'Buenas tardes me podría pasar los precios', expect: ['aclarar'] },
  { id: 54, q: 'Hermano una pregunta ustedes venden popotes de hechar agua y que precio tiene', expect: ['ok', 'parcial'] },
  { id: 53, q: 'Thiban estore', expect: ['pedir', 'aclarar', 'parcial'] },
  { id: 52, q: 'No me importa la marca solo el modelo', expect: ['aclarar'] },
  { id: 51, q: '', expect: ['aclarar'] },
  { id: 50, q: 'Que precio tiene la tela pollera', expect: ['ok'] },
  { id: 49, q: 'De la de 3.60', expect: ['ok', 'parcial'] },
  { id: 48, q: 'Arquitectónica de 6 metros roja a cómo la tenés calibre 35 en bs', expect: ['parcial'] },
  { id: 47, q: 'Y el saco de cemento', expect: ['ok'] },
  { id: 46, q: 'Ok gracias tienes fotos', expect: ['aclarar'] },
  { id: 45, q: 'Buenos días. Precio de el rollo de cable #8 12 xfavr', expect: ['parcial', 'ok'] },
  { id: 44, q: 'Pero en estos días pregunté y me dijeron que habían llegado los alambres de pua', expect: ['ok'] },
  { id: 43, q: 'Buen día, que precio tienen  la holladoras, motor para hacer huecos para meter estanquillo.', expect: ['no_vendido', 'pedir'] },
  { id: 42, q: 'Me puede pasar una foto de los que dispone para hacer un closet de concreto porfa', expect: ['aclarar', 'ok', 'parcial', 'pedir'] },
  { id: 40, q: 'Si puede me pasa fotos', expect: ['aclarar'] },
  // ---- JUNIO (verificados contra inventario) ----
  { id: 38, q: 'Tiene pipas de agua de 200', expect: ['parcial', 'no_vendido'] },
  { id: 37, q: 'Buenas tardes saludos bendiciones 🙏 venden arena fina?  , necesito un metro por fa', expect: ['ok'] },
  { id: 36, q: 'Buenas tardes tienen protector de aire 110v y que precio', expect: ['parcial', 'ok'] },
  { id: 34, q: 'Saludos buen dia tiene laminas arquitectonica calibre 0.30 de 6 metros de largo x 1.10 de ancho', expect: ['ok', 'parcial'] },
  { id: 32, q: 'Buenas tardes tiene tubo estructural de 4x4', expect: ['ok'] },
  { id: 29, q: 'Buenos días,que precio tienen las láminas de zinc de 12 pies prepintadas', expect: ['ok'] },
  { id: 28, q: 'Buenas tardes tiene disponible laminas arquitectónicas de 6 metros calibre 30', expect: ['ok'] },
  { id: 27, q: 'Que precio este tipo de sinz de 6 metros', expect: ['ok', 'parcial'] },
  { id: 26, q: 'yo los vi no creo que se hayan terminado me dijeron que había bastante son paneles de esos que que vienen este en papel tapiz que uno se los pega a la pared del baño', expect: ['ok', 'parcial', 'pedir'] },
  { id: 23, q: 'Esas son de 0,30 ml', expect: ['ok', 'parcial', 'pedir'] },
  { id: 22, q: 'Saludos me puede dar precio de lámina arquitectónica 0,30 mts en bolívares', expect: ['ok', 'parcial'] },
  { id: 21, q: 'Buenas tardes. Tienen tabelones', expect: ['pedir'] },
  { id: 20, q: 'tienes lamina arquitectónicas de las q mide 6 metros x 1 de ancho q presio la tienes', expect: ['ok', 'parcial'] },
  { id: 19, q: 'Me regalas fotos de las manillas de acero', expect: ['ok', 'parcial'] },
  { id: 18, q: 'Varón Pistón de guadaña de 53cc o 45mm tienes?', expect: ['pedir', 'no_vendido'] },
  { id: 17, q: 'Tornillo tres cuartos con tuerca y arandela', expect: ['parcial', 'pedir'] },
  { id: 16, q: 'que precio tiene la estructura o soporte del cielo razo porfavor', expect: ['no_vendido', 'ok', 'parcial'] },
  { id: 39, q: 'Buenos días que cuesta el pigmento en polvo para pisos', expect: ['ok'] },
];

function clasificar(p) {
  if (p.aclarar) return 'aclarar';
  if (p.no_vendido) return 'no_vendido';
  if (p.instruccion && /UNICA respuesta valida ahora es el token/.test(p.instruccion)) return 'pedir';
  if (p.instruccion && /NO coincide|casualidad/.test(p.instruccion)) return 'pedir'; // débil = escalar
  if (p.parcial) return 'parcial';
  if (p.encontrados > 0) return 'ok';
  return 'pedir';
}

(async () => {
  let pass = 0, fail = 0, ideal = 0;
  for (const t of TESTS) {
    let parsed, err = null;
    try { parsed = JSON.parse(await runBuscar(fakeRequire, { p_busqueda: t.q })); }
    catch (e) { err = e.message; parsed = {}; }
    const clase = err ? ('EXCEPCION: ' + err) : clasificar(parsed);
    const okTest = !err && t.expect.includes(clase);
    if (okTest) { pass++; if (clase === t.expect[0]) ideal++; } else fail++;
    const names = (parsed.productos || []).slice(0, 3).map(p => p.nombre + (p.disponible ? '' : '·AGOT')).join(' | ');
    console.log(`${okTest ? (clase === t.expect[0] ? '✅' : '🟡') : '❌'} id${t.id} [${clase}] esperaba [${t.expect.join('/')}] "${t.q.slice(0, 55)}"`);
    if (names) console.log(`      => ${names.slice(0, 150)}`);
    if (parsed.instruccion) console.log(`      instr: ${parsed.instruccion.slice(0, 110)}`);
  }
  console.log(`\n=== ${pass}/${TESTS.length} aceptables (${ideal} ideales) | ${fail} fallos ===`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
