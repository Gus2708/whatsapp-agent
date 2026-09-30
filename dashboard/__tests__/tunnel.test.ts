import { describe, expect, it } from 'vitest';
import { isUsableTunnelRecord } from '../lib/tunnel';

const now = Date.parse('2026-09-30T12:00:00.000Z');
const record = {
  servicio: 'n8n',
  url: 'https://fresh-link.trycloudflare.com',
  hostname: 'fresh-link.trycloudflare.com',
  tunnel_state: 'running',
  updated_at: '2026-09-30T11:59:30.000Z',
  last_error: null,
};

describe('tunnel availability', () => {
  it('accepts only a fresh, running HTTPS quick tunnel', () => {
    expect(isUsableTunnelRecord(record, now)).toBe(true);
  });

  it('rejects stale, stopped, future, and unexpected hosts', () => {
    expect(isUsableTunnelRecord({ ...record, updated_at: '2026-09-30T11:58:29.000Z' }, now)).toBe(false);
    expect(isUsableTunnelRecord({ ...record, tunnel_state: 'down' }, now)).toBe(false);
    expect(isUsableTunnelRecord({ ...record, updated_at: '2026-09-30T12:00:20.000Z' }, now)).toBe(false);
    expect(isUsableTunnelRecord({ ...record, url: 'https://evil.example' }, now)).toBe(false);
  });
});
