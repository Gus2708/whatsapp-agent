// _test_solicitud_contexto.js — ejecuta el codigo VIVO de "Registrar Solicitud Ayuda" con
// axios simulado. Reproduce los casos reales que acabaron en 'descartado' porque al
// empleado le llegaba una anafora suelta.
//
// Lo critico que se verifica:
//   - `consulta` (lo que lee el empleado) lleva contexto
//   - `consulta_limpia` (lo que aprende el buscador) va SIN contexto  <- si esto se rompe,
//     busqueda_aprendizaje se envenena con la respuesta del bot
//   - el bloqueo por duplicado CADUCA a las 3h
const wf = require('../n8n_workflow.json');
const code = wf.nodes.find(n => n.name === 'Registrar Solicitud Ayuda').parameters.jsCode;

const ahora = Date.now();
const hace = (min) => new Date(ahora - min * 60000).toISOString();

function correr({ mensaje, msgId = 'act', previos = [], ultimosBot = [], pendientes = [], pushName = null }) {
  let insertado = null, urlPendientes = null;
  const axiosFake = {
    get: async (url) => {
      if (url.includes('mensajes_procesados')) return { data: previos };
      if (url.includes('mensajes_bot')) return { data: ultimosBot.map(t => ({ texto_norm: t })) };
      if (url.includes('solicitudes_ayuda')) { urlPendientes = url; return { data: pendientes }; }
      if (url.includes('clientes_chat')) return { data: [] };
      return { data: [] };
    },
    post: async (url, body) => { if (url.includes('solicitudes_ayuda')) insertado = body; return { data: [] }; },
  };
  const $ = () => ({ first: () => ({ json: { body: { payload: { from: '58412@c.us', id: msgId, body: mensaje, _data: { pushName } } } } }) });
  const fn = new Function('$input', '$', '$json', 'require', `return (async () => { ${code} })();`);
  return fn({}, $, {}, (m) => { if (m === 'axios') return axiosFake; throw new Error(m); })
    .then(() => ({ insertado, urlPendientes }));
}

// Caso real del 24-jul que acabo en 'descartado'.
const PREVIOS_REALES = [
  { message_id: 'act', texto: 'no eso no son paneles adhesivos', procesado_at: hace(0) },
  { message_id: 'p1', texto: 'busco unos paneles para la pared del baño', procesado_at: hace(2) },
];
const BOT = ['panel pvc 3d blanco 50x50 disponibilidad: ✅ precio divisas: 3.50$', '[pedir_ayuda]'];

(async () => {
  let fallos = 0;
  const chequeo = (n, cond, detalle) => { if (!cond) { fallos++; console.log(`✗ ${n}: ${detalle}`); } else console.log(`✓ ${n}`); };

  // 1) contexto presente y separacion de los dos campos
  {
    const { insertado } = await correr({ mensaje: 'no eso no son paneles adhesivos', previos: PREVIOS_REALES, ultimosBot: BOT });
    console.log('\n--- lo que vera el empleado ---\n' + insertado.consulta + '\n');
    chequeo('consulta lleva lo que dijo antes', /antes dijo/.test(insertado.consulta), insertado.consulta);
    chequeo('consulta lleva la respuesta del bot', /Perucho respondio/.test(insertado.consulta), insertado.consulta);
    chequeo('consulta NO incluye el marcador [pedir_ayuda]', !/pedir_ayuda/.test(insertado.consulta), insertado.consulta);
    chequeo('consulta_limpia va SIN contexto (aprendizaje limpio)',
      insertado.consulta_limpia === 'no eso no son paneles adhesivos', JSON.stringify(insertado.consulta_limpia));
    chequeo('el mensaje actual no se repite como "antes dijo"',
      (insertado.consulta.match(/no eso no son paneles adhesivos/g) || []).length === 1, insertado.consulta);
  }

  // 2) sin historial -> no revienta y no inventa contexto
  {
    const { insertado } = await correr({ mensaje: 'tienen cabilla?', previos: [], ultimosBot: [] });
    chequeo('sin historial: consulta = mensaje pelado', insertado.consulta === 'tienen cabilla?', JSON.stringify(insertado.consulta));
    chequeo('sin historial: consulta_limpia igual', insertado.consulta_limpia === 'tienen cabilla?', JSON.stringify(insertado.consulta_limpia));
  }

  // 3) nota de voz ya transcrita (antes llegaba null)
  {
    const { insertado } = await correr({ mensaje: 'necesito veinte sacos de cemento gris', previos: [], ultimosBot: [] });
    chequeo('nota de voz transcrita se registra', insertado.consulta_limpia === 'necesito veinte sacos de cemento gris', JSON.stringify(insertado.consulta_limpia));
  }

  // 4) dedup con ventana
  {
    const { urlPendientes } = await correr({ mensaje: 'hola', previos: [], ultimosBot: [] });
    chequeo('el dedup filtra por fecha (creado_en=gte)', /creado_en=gte/.test(urlPendientes || ''), urlPendientes);
  }
  {
    const { insertado } = await correr({ mensaje: 'hola', previos: [], ultimosBot: [], pendientes: [{ id: 1 }] });
    chequeo('pendiente RECIENTE bloquea', insertado === null, 'insertó cuando no debía');
  }
  {
    // Supabase ya filtro por fecha: una pendiente vieja no vuelve en la consulta -> no bloquea
    const { insertado } = await correr({ mensaje: 'hola', previos: [], ultimosBot: [], pendientes: [] });
    chequeo('pendiente VIEJA (fuera de ventana) no bloquea', insertado !== null, 'no insertó');
  }

  console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})();
