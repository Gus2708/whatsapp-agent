'use strict';

const MAX_AGE_MS = 90_000;
const MAX_FUTURE_SKEW_MS = 5_000;

function validatedSupabaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('unsafe Supabase URL'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('unsafe Supabase URL');
  }
  return url;
}

function validatedTunnelUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('unsafe tunnel URL'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/i.test(url.hostname) ||
      url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('unsafe tunnel URL');
  }
  return url.origin;
}

async function resolveTunnelUrl(service, options = {}) {
  if (!['n8n', 'waha'].includes(service)) throw new Error('service must be n8n or waha');
  const { supabaseUrl, anonKey, fetchImpl = fetch, now = Date.now() } = options;
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY is required');
  const base = validatedSupabaseUrl(supabaseUrl);
  const query = new URL('/rest/v1/tunnel_config', base);
  query.searchParams.set('select', 'servicio,url,tunnel_state,updated_at');
  query.searchParams.set('servicio', `eq.${service}`);
  query.searchParams.set('limit', '1');

  let response;
  try {
    response = await fetchImpl(query, {
      method: 'GET',
      headers: { apikey: anonKey },
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
  } catch { throw new Error('Supabase tunnel lookup failed'); }
  if (!response.ok) throw new Error(`Supabase tunnel lookup failed (HTTP ${response.status})`);
  let rows;
  try { rows = await response.json(); } catch { throw new Error('invalid tunnel response'); }
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || rows[0].servicio !== service) {
    throw new Error('no tunnel record');
  }
  const record = rows[0];
  if (record.tunnel_state !== 'running') throw new Error('tunnel not active');
  const updated = Date.parse(record.updated_at);
  if (!Number.isFinite(updated)) throw new Error('stale tunnel heartbeat');
  if (updated - now > MAX_FUTURE_SKEW_MS) throw new Error('future tunnel heartbeat');
  if (now - updated > MAX_AGE_MS) throw new Error('stale tunnel heartbeat');
  const url = validatedTunnelUrl(record.url);

  let probe;
  try {
    probe = await fetchImpl(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5_000) });
  } catch { throw new Error('tunnel probe failed'); }
  if (!probe.ok && !(service === 'waha' && probe.status === 401)) {
    throw new Error(`tunnel probe failed (HTTP ${probe.status})`);
  }
  return url;
}

if (require.main === module) {
  const { leerCredenciales } = require('./_lib_credenciales');
  const credentials = leerCredenciales();
  resolveTunnelUrl(process.argv[2], {
    supabaseUrl: credentials.SUPABASE_URL,
    anonKey: credentials.SUPABASE_ANON_KEY,
  }).then(url => process.stdout.write(`${url}\n`), error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { resolveTunnelUrl };
