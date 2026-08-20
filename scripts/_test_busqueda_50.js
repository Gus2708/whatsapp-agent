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
  { q: 'fregadero sencillo', exists: true, src: 'cat' },

  // ---- 2026-08-20: mas consultas REALES de solicitudes_ayuda que no estaban cubiertas ----
  { q: '2/1  1mm. Cuanto cuesta', exists: null, src: 'real' },
  { q: 'Arquitectónica de 6 metros roja a cómo la tenés calibre 35 en bs', exists: null, src: 'real' },
  { q: 'Buen día, que precio tienen  la holladoras, motor para hacer huecos para meter estanquillo.', exists: null, src: 'real' },
  { q: 'Bueno días q precio tiene el sip pintado', exists: null, src: 'real' },
  { q: 'Buenos días que cuesta el pigmento en polvo para pisos', exists: null, src: 'real' },
  { q: 'Buenos días. Precio de el rollo de cable #8 12 xfavr', exists: null, src: 'real' },
  { q: 'Es kit de sanitario y kit de lavamano', exists: null, src: 'real' },
  { q: 'Hermano una pregunta ustedes venden popotes de hechar agua y que precio tiene', exists: null, src: 'real' },
  { q: 'Para saber si llego ángulo de 2x1 de 1 milímetro', exists: null, src: 'real' },
  { q: 'Pero en estos días pregunté y me dijeron que habían llegado los alambres de pua', exists: null, src: 'real' },
  { q: 'Que precio tiene la tela pollera', exists: false, src: 'real' },
  { q: 'Y la cerradura para soldar', exists: null, src: 'real' },
  { q: 'Thiban estore', exists: false, src: 'real' },

  // ---- anaforas y ruido: NO debe inventarse un producto con seguridad ----
  // Estas son las que acababan en 'descartado' porque al empleado le llegaba la frase suelta.
  { q: 'De la de 3.60', exists: null, src: 'anafora' },
  { q: 'Y el saco de cemento', exists: true, src: 'anafora' },
  { q: 'No me importa la marca solo el modelo', exists: null, src: 'anafora' },
  { q: 'no eso no son paneles adhesivos', exists: null, src: 'anafora' },
  // esperaVago: no es una consulta de producto. Debe pedir aclaracion, NO cotizar.
  { q: 'Vallalo currucho como esta todo', exists: false, src: 'ruido', esperaVago: true,
    conocido: 'el token "todo" del saludo casa con Disco P/lijad TODO y SueldaTODO -> cotiza 4 productos a quien solo saludo' },
  { q: '0;   b b.', exists: false, src: 'ruido', esperaVago: true,
    conocido: 'el "0" suelto se trata como medida y casa con "AL 0%" -> devuelve varillas de soldar para ruido puro' },
  { q: 'Ok gracias tienes fotos', exists: false, src: 'ruido', esperaVago: true },

  // ---- LOS MAS VENDIDOS deben encontrarse por su nombre coloquial ----
  // Si un cliente pide un superventas y el bot no lo saca primero, es el fallo mas caro.
  // Orden real de producto_popularidad (facturas 90d) al 2026-08-20.
  { q: 'clavos', exists: true, src: 'top-venta', top: /clavo/i },
  { q: 'un saco de cemento gris', exists: true, src: 'top-venta', top: /cemento/i },
  { q: 'tubo de herreria 2x1', exists: true, src: 'top-venta', top: /tubo.*herrer/i },
  { q: 'alambre de amarre', exists: true, src: 'top-venta', top: /alambre/i },
  { q: 'electrodos para soldar', exists: true, src: 'top-venta', top: /electrodo/i },
  { q: 'cabilla de 10', exists: true, src: 'top-venta', top: /cabilla/i },
  { q: 'cercha', exists: true, src: 'top-venta', top: /cercha/i },
  { q: 'disco para cortar metal', exists: true, src: 'top-venta', top: /disco/i },
  { q: 'cajetin 4x2', exists: true, src: 'top-venta', top: /cajetin/i },
  { q: 'bloque 10', exists: true, src: 'top-venta', top: /bloque/i },
  { q: 'gancho para techo', exists: true, src: 'top-venta', top: /gancho/i },
  { q: 'thinner', exists: true, src: 'top-venta', top: /thinner/i },
  { q: 'lamina de zinc azul', exists: true, src: 'top-venta', top: /zinc/i },

  // ---- clase "subcadena": el token no debe casar DENTRO de otra palabra ----
  // "pega" casaba con "pegable" y el desempate por ventas subia el accesorio (TEE PVC
  // Pegable, score 3.52) por encima de la pega de verdad (3.34). Ver casaPalabra().
  // OJO: los regex de `top` llevan \b a proposito. Con /pega/i este mismo caso pasaba en
  // verde devolviendo "Tubo PVC A/B PEGAble", porque el regex casaba dentro de la palabra:
  // el mismo error de subcadena que se acaba de corregir en el buscador, cometido en el test.
  { q: 'pega para tubo pvc', exists: true, src: 'subcadena', top: /\bpega\b/i,
    conocido: 'drop-one suelta el sustantivo principal ("pega") en vez del complemento ("tubo") y devuelve un tubo pegable agotado' },
  { q: 'pega soldadura', exists: true, src: 'subcadena', top: /\bpega\b/i, notTop: /pegable/i },
];

function classify(parsed, t) {
  const flags = [];
  // Contrato v11: encontrados>0 = HAY producto util (aunque sea 'parcial' con [PEDIR_AYUDA] como
  // ultimo recurso en la instruccion). Solo es MISS si no hay producto O es de OTRA categoria (débil).
  const debil = parsed.instruccion && /NO coincide|casualidad/.test(parsed.instruccion);
  const sinProducto = parsed.encontrados === 0 || debil;
  if (sinProducto) {
    if (parsed.aclarar) flags.push('· aclarar');
    else if (parsed.no_vendido) flags.push('· no_vendido');
    else flags.push(t.exists === true ? '❌ FALSO-NEGATIVO?(esperado existe)' : '· no encontrado');
  } else if (parsed.parcial) {
    flags.push('🟡 parcial');
  }
  if (debil) flags.push('⚠ DÉBIL');
  // ¿el top está agotado teniendo el algoritmo que priorizar disponibles?
  if (parsed.productos && parsed.productos.length > 1 && parsed.productos[0].disponible === false && parsed.productos.some(p => p.disponible)) {
    flags.push('⚠ TOP-AGOTADO-con-disponibles');
  }
  // ¿es el PRIMERO el producto correcto? El resumen no miraba esto, y por eso "pega para
  // pvc" devolvia TEE PVC Pegable en el top-1 sin que nada se quejara: habia que leer la
  // salida a ojo para verlo. Con `top`/`notTop` el fallo de ranking sale en el resumen.
  const top1 = parsed.productos && parsed.productos[0] && parsed.productos[0].nombre;
  if (top1) {
    if (t.top && !t.top.test(top1)) flags.push(`❌ TOP-INESPERADO (esperaba ${t.top} y salio "${top1.slice(0, 40)}")`);
    if (t.notTop && t.notTop.test(top1)) flags.push(`❌ TOP-PROHIBIDO (${t.notTop} casa con "${top1.slice(0, 40)}")`);
  } else if (t.top) {
    flags.push(`❌ TOP-INESPERADO (sin resultados, esperaba ${t.top})`);
  }
  // Un saludo o un texto sin sentido NO es una consulta de producto: cotizarlo con
  // seguridad es peor que no encontrar nada, porque el cliente recibe precios que no pidio.
  if (t.esperaVago && !sinProducto && !parsed.aclarar && !parsed.parcial) {
    flags.push('❌ RUIDO-COTIZADO (deberia pedir aclaracion)');
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
  // Un caso marcado `conocido` es un fallo REAL ya diagnosticado que todavía no se arregla.
  // Se cuenta aparte para que el contador principal siga sirviendo de linea base de
  // regresiones, pero se imprime siempre: no es un test silenciado, es deuda a la vista.
  const rankTodos = results.filter(r => r.flags.some(f => f.includes('TOP-INESPERADO') || f.includes('TOP-PROHIBIDO') || f.includes('RUIDO-COTIZADO')));
  const rank = rankTodos.filter(r => !r.t.conocido);
  const conocidos = rankTodos.filter(r => r.t.conocido);
  console.log('Total:', results.length, '| sin resultados:', noEnc.length, '| FALSO-NEGATIVO sospechoso:', fn.length, '| débiles:', debil.length, '| top-agotado:', agot.length, '| RANKING malo:', rank.length, '| excepciones:', exc.length, '| conocidos pendientes:', conocidos.length);
  if (conocidos.length) { console.log('\n-- CONOCIDOS PENDIENTES (fallo real, ya diagnosticado, sin arreglar) --'); conocidos.forEach(r => console.log('  #' + r.i, '"' + r.t.q + '"\n      ' + r.t.conocido)); }
  if (fn.length) { console.log('\n-- FALSOS NEGATIVOS SOSPECHOSOS (producto debería existir) --'); fn.forEach(r => console.log('  #' + r.i, '"' + r.t.q.slice(0, 70) + '"')); }
  if (rank.length) { console.log('\n-- RANKING: el primero no es el producto correcto --'); rank.forEach(r => console.log('  #' + r.i, '"' + r.t.q.slice(0, 50) + '"', r.flags.filter(f => f.includes('TOP-')).join(' '))); }
  if (exc.length) { console.log('\n-- EXCEPCIONES --'); exc.forEach(r => console.log('  #' + r.i, r.flags.join(' '))); }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
