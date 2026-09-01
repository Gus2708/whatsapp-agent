const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const axios = {
  get: async (url, opts) => {
    const res = await fetch(url, { headers: opts && opts.headers });
    const data = await res.json();
    return { data };
  },
  post: async (url, body, opts) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: opts && opts.headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();
    return { data };
  }
};

const envPath = path.join(__dirname, '..', '.env');
const env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
const pick = k => ((env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1] || process.env[k] || '').trim();
const envMap = { SUPABASE_URL: pick('SUPABASE_URL'), SUPABASE_ANON_KEY: pick('SUPABASE_ANON_KEY') };

async function buscarLive(p_busqueda) {
  const query = { p_busqueda };
  const rawCode = fs.readFileSync(path.join(__dirname, '..', 'scratch_live', 'live_buscar.js'), 'utf8');
  const code = rawCode.replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  const fn = new AsyncFunction('query', 'axios', '$env', code);
  const resultStr = await fn(query, axios, envMap);
  return JSON.parse(resultStr);
}

test('Cliente WhatsApp: Q vale la lámina prepintada canal redonda', async () => {
  const res = await buscarLive('Q vale la lámina prepintada canal redonda');
  assert.strictEqual(res.encontrados > 0, true, 'Debe encontrar láminas');
  const prods = res.productos;
  const hasPrepintadaOndulada = prods.some(p => /Zinc Ondu|Ondulado|Techolit|PVC.*OND/i.test(p.nombre) && /Rojo|Azul/i.test(p.nombre));
  assert.strictEqual(hasPrepintadaOndulada, true, 'Debe incluir láminas prepintadas onduladas');
  assert.strictEqual(prods[0].disponible, true, 'La primera opción debe estar disponible');
});

test('Cliente WhatsApp: Si nesecito de 12 pies canal ondulado prepintada', async () => {
  const res = await buscarLive('Si nesecito de 12 pies canal ondulado prepintada');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const all12Pies = prods.every(p => /12\s*Pies?|12PIES|3\.66/i.test(p.nombre));
  assert.strictEqual(all12Pies, true, 'Todas las opciones deben ser de 12 pies');
  const hasInStock = prods.some(p => p.disponible === true);
  assert.strictEqual(hasInStock, true, 'Debe tener opciones en stock');
});

test('Cliente WhatsApp: de las prepintadas 12 pies', async () => {
  const res = await buscarLive('de las prepintadas 12 pies');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allLaminas = prods.every(p => /Lamina/i.test(p.nombre));
  assert.strictEqual(allLaminas, true, 'Solo debe retornar láminas (no cables ni tornillos)');
});

test('Lámina Arquitectónica 6 metros', async () => {
  const res = await buscarLive('lamina arquitectonica 6 metros');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const hasArquitectonica = prods.some(p => /Arquitectonica|7 Canales/i.test(p.nombre));
  assert.strictEqual(hasArquitectonica, true, 'Debe retornar lámina arquitectónica');
});

test('Lámina Techolit Roja', async () => {
  const res = await buscarLive('lamina techolit roja');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  assert.strictEqual(prods.some(p => /Techolit/i.test(p.nombre)), true, 'Debe retornar lámina Techolit');
});

test('Lámina prepintada azul', async () => {
  const res = await buscarLive('lamina prepintada azul');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allBlue = prods.every(p => /Azul/i.test(p.nombre));
  assert.strictEqual(allBlue, true, 'Todas las opciones deben ser azules');
});

test('Lámina prepintada roja', async () => {
  const res = await buscarLive('lamina prepintada roja');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const allRed = prods.every(p => /Roj[oa]|Techolit/i.test(p.nombre));
  assert.strictEqual(allRed, true, 'Todas las opciones deben ser rojas o Techolit');
});

test('Lámina techo PVC azul', async () => {
  const res = await buscarLive('lamina techo pvc azul');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  assert.strictEqual(prods.some(p => /PVC/i.test(p.nombre) && /Azul/i.test(p.nombre)), true);
});

test('Láminas de colores para techo', async () => {
  const res = await buscarLive('laminas de colores para techo');
  assert.strictEqual(res.encontrados > 0, true);
  const prods = res.productos;
  const hasColor = prods.some(p => /Roj[oa]|Azul|Techolit/i.test(p.nombre));
  assert.strictEqual(hasColor, true, 'Debe sugerir láminas de colores');
});
