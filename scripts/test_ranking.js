const https = require('https');
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJnbmlxamZvb2lmY2h5Y3RuYnp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4NDI2NTUsImV4cCI6MjA5MzQxODY1NX0.MwhE9n5DjbWNN42Qsj-yNmF_sSlOWZbf4mXJy2NUnKQ';

function sb(path) {
  return new Promise(resolve => {
    const opts = { hostname: 'rgniqjfooifchyctnbzu.supabase.co', path: '/rest/v1/' + path, headers: { apikey: ANON, Authorization: 'Bearer ' + ANON } };
    https.get(opts, x => {
      let d = '';
      x.on('data', c => d += c);
      x.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { resolve([]); } });
    });
  });
}

function norm(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 .\/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreMatch(desc, q) {
  const d = norm(desc);
  const w = d.split(' ');
  let s = 0, all = true;
  for (const t of q) {
    if (w.includes(t)) s += 10;
    else if (t.length >= 3 && d.includes(t)) s += 5;
    else all = false;
  }
  if (all && q.length > 0) s += 50;
  s -= w.length * 0.1;
  return s;
}

(async () => {
  const tests = [['cabilla', 'estriada', '12mm'], ['cemento', 'gris', 'csc'], ['disco', 'metal']];
  for (const test of tests) {
    const filter = test.map(w => 'descripcion=ilike.*' + encodeURIComponent(w) + '*').join('&');
    const cand = await sb('productos?select=codigo_interno,descripcion,precio_venta,existencia&' + filter + '&existencia=gt.0&limit=30');
    console.log('\n=== ' + test.join(' ') + ' === (' + cand.length + ' candidatos)');
    cand.map(p => ({ d: p.descripcion, pr: p.precio_venta, sc: scoreMatch(p.descripcion, test) }))
        .sort((a, b) => b.sc - a.sc).slice(0, 4)
        .forEach(p => console.log('  score ' + p.sc.toFixed(1) + ' | $' + p.pr + ' | ' + p.d));
  }
})();
