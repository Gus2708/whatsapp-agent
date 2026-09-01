const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || '').trim();
const SB = pick('SUPABASE_URL');
const ANON = pick('SUPABASE_ANON_KEY');
const OAI = pick('OPENAI_API_KEY') || (process.env.OPENAI_API_KEY || '').trim();
const H = { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' };

const descripciones = [
  { codigo_interno: '000546', descripcion_ia: 'Lámina de zinc para techo prepintada en color rojo de 12 pies (3.66 metros), perfil cuadrado macho calibre 0.17 mm, se usa para techado y cerramientos resistentes a la intemperie en albañilería y construcción.' },
  { codigo_interno: '02573', descripcion_ia: 'Lámina para techo arquitectónica prepintada en color rojo de 1.10 metros de ancho por 6 metros de largo, calibre 30 (0.30 mm), perfil de canales para cubiertas residenciales y comerciales en construcción.' },
  { codigo_interno: '02574', descripcion_ia: 'Lámina para techo arquitectónica prepintada en color azul de 1.10 metros de ancho por 6 metros de largo, calibre 30 (0.30 mm), perfil de canales para techos y galpones en construcción.' },
  { codigo_interno: '02575', descripcion_ia: 'Lámina Techolit para techo prepintada en color rojo número 10 de 10 pies (3.05 metros de largo), lámina ondulada decorativa e impermeable para techos y cobertizos.' },
  { codigo_interno: '02576', descripcion_ia: 'Lámina Techolit para techo prepintada en color rojo número 12 de 12 pies (3.66 metros de largo), lámina ondulada asfáltica decorativa e impermeable para techos y cubiertas.' },
  { codigo_interno: '02580', descripcion_ia: 'Lámina de zinc para techo prepintada en color azul ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.25 mm, ideal para techados duraderos y resistentes a la lluvia.' },
  { codigo_interno: '02583', descripcion_ia: 'Lámina de zinc para techo prepintada en color rojo ondulada (canal redondo) de 12 pies (3.66 metros), calibre 0.20 mm, se utiliza en albañilería y construcción para cubrir techos.' },
  { codigo_interno: '02584', descripcion_ia: 'Lámina de zinc para techo prepintada en color rojo ondulada (canal redondo) de 12 pies (3.66 metros), calibre 0.25 mm, excelente para cubiertas residenciales y comerciales expuestas a la intemperie.' },
  { codigo_interno: 'IMP0023698', descripcion_ia: 'Lámina de zinc para techo prepintada en color azul ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.18 mm, importada para techados residenciales.' },
  { codigo_interno: 'IMP234565', descripcion_ia: 'Lámina de zinc para techo prepintada en color azul ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.20 mm, para techos y cerramientos resistentes.' },
  { codigo_interno: 'IMP45123', descripcion_ia: 'Lámina de zinc para techo prepintada en color rojo ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.18 mm, importada para cubiertas de techos.' },
  { codigo_interno: 'IMPTA2', descripcion_ia: 'Lámina de zinc para techo prepintada en color azul ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.14 mm económica para techos.' },
  { codigo_interno: 'IMPTA6', descripcion_ia: 'Lámina arquitectónica para techo prepintada en color azul de 7 canales y 6 metros de largo, perfil estructural de alta cobertura para techado.' },
  { codigo_interno: 'IMPTR2', descripcion_ia: 'Lámina de zinc para techo prepintada en color rojo ondulada (canal redondo) de 12 pies (3.66 metros) por 0.81 metros, calibre 0.14 mm económica para techos.' },
  { codigo_interno: 'IMPTR6', descripcion_ia: 'Lámina arquitectónica para techo prepintada en color rojo de 7 canales y 6 metros de largo, perfil estructural de alta cobertura para techado.' },
  { codigo_interno: 'L005', descripcion_ia: 'Lámina de PVC para techo prepintada en color azul ondulada (canal redondo) de 12 pies (3.66 metros) por 0.76 metros, espesor 1.2 mm, anticorrosiva y liviana para techos.' }
];

const hashDe = t => crypto.createHash('md5').update(t).digest('hex');

(async () => {
  // 1. Obtener los productos reales
  const skus = descripciones.map(d => d.codigo_interno);
  const prods = await fetch(SB + '/rest/v1/productos?codigo_interno=in.(' + skus.join(',') + ')&select=codigo_interno,descripcion', { headers: H }).then(r => r.json());
  const prodMap = new Map(prods.map(p => [p.codigo_interno, p.descripcion]));

  // 2. Upsert producto_descripcion
  const filasDesc = descripciones.map(d => ({
    codigo_interno: d.codigo_interno,
    descripcion_ia: d.descripcion_ia,
    hash_origen: hashDe((prodMap.get(d.codigo_interno) || '').trim()),
    modelo: 'manual_curado'
  }));

  const rDesc = await fetch(SB + '/rest/v1/producto_descripcion?on_conflict=codigo_interno', {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filasDesc)
  });
  console.log('Upsert producto_descripcion status:', rDesc.status);

  // 3. Generar embeddings con OpenAI
  const sinonimos = 'lamina prepintada, lamina de color, lamina canal redonda, lamina ondulada roja azul, lamina techolit, lamina arquitectonica 7 canales, prepintadas 12 pies';
  const textos = prods.map(p => {
    const d = descripciones.find(x => x.codigo_interno === p.codigo_interno);
    const ia = d ? d.descripcion_ia : '';
    return p.descripcion.trim() + ' | ' + ia + ' | categoria: lamina | como lo pide el cliente: ' + sinonimos;
  });

  console.log('Generating embeddings for', textos.length, 'products with OpenAI...');
  const oaiRes = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OAI, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: textos, dimensions: 1536 })
  }).then(r => r.json());

  if (oaiRes.error) throw new Error(JSON.stringify(oaiRes.error));
  const vectores = oaiRes.data.map(d => d.embedding);

  // 4. Upsert productos_embedding
  const filasEmb = prods.map((p, idx) => ({
    codigo_interno: p.codigo_interno,
    descripcion: p.descripcion,
    hash_desc: hashDe(textos[idx]),
    embedding: JSON.stringify(vectores[idx]),
    modelo: 'text-embedding-3-small',
    actualizado_en: new Date().toISOString()
  }));

  const rEmb = await fetch(SB + '/rest/v1/productos_embedding?on_conflict=codigo_interno', {
    method: 'POST',
    headers: { ...H, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(filasEmb)
  });
  console.log('Upsert productos_embedding status:', rEmb.status);
  if (!rEmb.ok) console.log(await rEmb.text());
  else console.log('Successfully generated & upserted embeddings for all 16 SKUs!');
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
