const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveTunnelUrl } = require('../scripts/resolve_tunnel_url');

const config = {
  supabaseUrl: 'https://rgniqjfooifchyctnbzu.supabase.co',
  anonKey: 'public-test-key',
  now: Date.parse('2026-09-30T12:00:00.000Z'),
};
const row = (overrides = {}) => ({
  servicio: 'n8n',
  url: 'https://fresh-link.trycloudflare.com',
  tunnel_state: 'running',
  updated_at: '2026-09-30T11:59:30.000Z',
  ...overrides,
});

test('resolves fresh running n8n tunnel, checking host without sending Supabase key', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([String(url), options]);
    if (calls.length === 1) return { ok: true, status: 200, json: async () => [row()] };
    return { ok: true, status: 200 };
  };
  const result = await resolveTunnelUrl('n8n', { ...config, fetchImpl });
  assert.equal(result, row().url);
  assert.match(calls[0][0], /tunnel_config\?select=servicio%2Curl%2Ctunnel_state%2Cupdated_at/);
  assert.equal(calls[0][1].headers.apikey, config.anonKey);
  assert.equal(calls[1][0], result);
  assert.equal(calls[1][1].method, 'HEAD');
  assert.equal(calls[1][1].redirect, 'manual');
  assert.equal(calls[1][1].headers, undefined);
});

test('rejects stopped, stale, and future tunnel records before network probe', async () => {
  for (const bad of [
    row({ tunnel_state: 'down' }),
    row({ updated_at: '2026-09-30T11:58:29.000Z' }),
    row({ updated_at: '2026-09-30T12:00:20.000Z' }),
  ]) {
    let calls = 0;
    await assert.rejects(resolveTunnelUrl('n8n', { ...config, fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: async () => [bad] };
    } }), /not active|stale|future/);
    assert.equal(calls, 1);
  }
});

test('rejects unexpected or unsafe tunnel URL before network probe', async () => {
  for (const url of [
    'https://evil.example',
    'http://fresh-link.trycloudflare.com',
    'https://fresh-link.trycloudflare.com.evil.example',
    'https://user:pass@fresh-link.trycloudflare.com',
    'https://fresh-link.trycloudflare.com/webhook',
  ]) {
    let calls = 0;
    await assert.rejects(resolveTunnelUrl('n8n', { ...config, fetchImpl: async () => {
      calls++;
      return { ok: true, status: 200, json: async () => [row({ url })] };
    } }), /unsafe tunnel URL/);
    assert.equal(calls, 1);
  }
});

test('rejects redirects, missing rows, and unsafe Supabase URL', async () => {
  await assert.rejects(resolveTunnelUrl('waha', { ...config, fetchImpl: async () => ({ ok: true, json: async () => [] }) }), /no tunnel record/);
  await assert.rejects(resolveTunnelUrl('n8n', { ...config, fetchImpl: async (url) => String(url).includes('supabase.co')
    ? { ok: true, json: async () => [row()] } : { ok: false, status: 302 } }), /probe failed/);
  await assert.rejects(resolveTunnelUrl('n8n', { ...config, supabaseUrl: 'https://evil.example', fetchImpl: async () => { throw Error('unexpected'); } }), /unsafe Supabase URL/);
});

test('accepts WAHA authentication challenge as reachable without sending a secret', async () => {
  const calls = [];
  const url = await resolveTunnelUrl('waha', { ...config, fetchImpl: async (target, options) => {
    calls.push([String(target), options]);
    if (calls.length === 1) return { ok: true, status: 200, json: async () => [row({ servicio: 'waha' })] };
    return { ok: false, status: 401 };
  } });
  assert.equal(url, row().url);
  assert.equal(calls[1][1].headers, undefined);
});
