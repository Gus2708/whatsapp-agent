import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

import { POST } from '@/app/api/rag/route';
import {
  authorizeRagRequest,
  getDemoRagResult,
  resetSupabaseKeyWarningForTests,
  resolveServerSupabaseKey,
} from '@/lib/rag-auth';

describe('/api/rag active-employee authorization', () => {
  const originalFetch = global.fetch;
  const envKeys = [
    'SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'RAG_API_SECRET',
    'OPENROUTER_API_KEY',
    'OPENAI_API_KEY',
  ] as const;
  const envSnapshot: Record<string, string | undefined> = {};

  let fetchCalls: Array<{ url: string; headers: Record<string, string> }> = [];

  beforeEach(() => {
    for (const key of envKeys) {
      envSnapshot[key] = process.env[key];
    }
    process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'unit-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-service-role-key';
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.RAG_API_SECRET;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.OPENAI_API_KEY;

    createClientMock.mockReset();
    resetSupabaseKeyWarningForTests();
    fetchCalls = [];

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const headers = (init?.headers || {}) as Record<string, string>;
      fetchCalls.push({ url, headers });
      if (url.includes('/rest/v1/tazas')) {
        return { json: async () => [{ bcv_usd: 60 }] } as Response;
      }
      if (url.includes('/rest/v1/presupuesto_config')) {
        return { json: async () => [{ markup_porcentaje: 40 }] } as Response;
      }
      if (url.includes('/rest/v1/productos')) {
        return {
          json: async () => [
            { codigo_interno: 'CEM-1', descripcion: 'CEMENTO GRIS 42.5KG', precio_venta: 8.5, existencia: 25 },
          ],
        } as Response;
      }
      return { json: async () => [] } as Response;
    }) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (envSnapshot[key] === undefined) delete process.env[key];
      else process.env[key] = envSnapshot[key];
    }
  });

  function makeReq(headers: Record<string, string>, body: Record<string, unknown>) {
    return new NextRequest('http://localhost:3001/api/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  function mockSupabaseUser(opts: {
    userId?: string | null;
    authError?: string | null;
    rpcResult?: { data: unknown; error: { message: string } | null };
    rpcThrows?: boolean;
  }) {
    const rpcMock = vi.fn(async () => {
      if (opts.rpcThrows) throw new Error('network boom');
      return opts.rpcResult ?? { data: true, error: null };
    });
    const getUserMock = vi.fn(async () => ({
      data: { user: opts.userId ? { id: opts.userId } : null },
      error: opts.authError ? { message: opts.authError } : null,
    }));
    createClientMock.mockImplementation(() => ({
      auth: { getUser: getUserMock },
      rpc: rpcMock,
    }));
    return { getUserMock, rpcMock };
  }

  it('returns 401 when Authorization header is missing and never hits Supabase', async () => {
    const res = await POST(makeReq({}, { query: 'cemento gris' }));
    expect(res.status).toBe(401);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns 401 when token is invalid and never invokes rpc or service-key reads', async () => {
    const { rpcMock } = mockSupabaseUser({ userId: null, authError: 'invalid jwt' });
    const res = await POST(makeReq({ Authorization: 'Bearer bad-jwt' }, { query: 'cemento gris' }));
    expect(res.status).toBe(401);
    expect(createClientMock).toHaveBeenCalledWith(
      'https://unit-test.supabase.co',
      'unit-anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer bad-jwt' } },
      })
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns 401 for demo-token without calling Supabase', async () => {
    const res = await POST(makeReq({ Authorization: 'Bearer demo-token' }, { query: 'cemento gris' }));
    expect(res.status).toBe(401);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns 200 for an active employee, calling is_active_employee with user JWT + anon key and querying catalog with service key', async () => {
    const { rpcMock } = mockSupabaseUser({
      userId: 'emp-42',
      rpcResult: { data: true, error: null },
    });

    const res = await POST(makeReq({ Authorization: 'Bearer active-emp-jwt' }, { query: 'cemento gris' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe('cemento gris');
    expect(rpcMock).toHaveBeenCalledWith('is_active_employee');

    for (const call of createClientMock.mock.calls) {
      expect(call[1]).toBe('unit-anon-key');
      expect(call[2]).toMatchObject({
        global: { headers: { Authorization: 'Bearer active-emp-jwt' } },
      });
    }

    expect(fetchCalls.length).toBeGreaterThan(0);
    expect(fetchCalls[0].headers.apikey).toBe('unit-service-role-key');
    expect(fetchCalls[0].headers.Authorization).toBe('Bearer unit-service-role-key');
  });

  it('returns 403 for a valid user whose is_active_employee() is false and never reads with service key', async () => {
    const { rpcMock } = mockSupabaseUser({
      userId: 'non-emp-99',
      rpcResult: { data: false, error: null },
    });

    const res = await POST(makeReq({ Authorization: 'Bearer inactive-jwt' }, { query: 'cemento gris' }));
    expect(res.status).toBe(403);
    expect(rpcMock).toHaveBeenCalledWith('is_active_employee');
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns 403 when is_active_employee() returns an RPC error and never reads with service key', async () => {
    const { rpcMock } = mockSupabaseUser({
      userId: 'emp-42',
      rpcResult: { data: null, error: { message: 'permission denied' } },
    });

    const res = await POST(makeReq({ Authorization: 'Bearer err-jwt' }, { query: 'cemento gris' }));
    expect(res.status).toBe(403);
    expect(rpcMock).toHaveBeenCalledWith('is_active_employee');
    expect(fetchCalls).toHaveLength(0);
  });

  it('returns 403 when is_active_employee() throws unexpectedly', async () => {
    mockSupabaseUser({ userId: 'emp-42', rpcThrows: true });

    const res = await POST(makeReq({ Authorization: 'Bearer throw-jwt' }, { query: 'cemento gris' }));
    expect(res.status).toBe(403);
    expect(fetchCalls).toHaveLength(0);
  });

  it('keeps x-rag-api-key server-to-server path working without calling Supabase Auth/RPC', async () => {
    process.env.RAG_API_SECRET = 'top-secret-s2s';
    const res = await POST(makeReq({ 'x-rag-api-key': 'top-secret-s2s' }, { query: 'cemento gris' }));
    expect(res.status).toBe(200);
    expect(createClientMock).not.toHaveBeenCalled();
    expect(fetchCalls[0].headers.apikey).toBe('unit-service-role-key');

    const bad = await POST(makeReq({ 'x-rag-api-key': 'wrong' }, { query: 'cemento gris' }));
    expect(bad.status).toBe(401);
  });

  it('fails closed (403) in authorizeRagRequest if checkActiveEmployee returns non-true or errors', async () => {
    const res = await authorizeRagRequest(
      { Authorization: 'Bearer some-jwt' },
      {
        verifyUser: async () => ({ userId: 'u1', error: null }),
        checkActiveEmployee: async () => ({ active: false, error: null }),
      }
    );
    expect(res).toEqual({
      authorized: false,
      status: 403,
      error: 'Acceso restringido a empleados activos',
    });
  });

  it('returns deterministic local demo result and resolves service key with one-time anon warning', () => {
    const demo = getDemoRagResult('Tornillo drywall 1/2 x 100u');
    expect(demo.hitLayer).toBe(1);
    expect(demo.productName).toContain('[DEMO]');

    const warns: string[] = [];
    const r1 = resolveServerSupabaseKey({ SUPABASE_ANON_KEY: 'anon-x' }, (m) => warns.push(m));
    const r2 = resolveServerSupabaseKey({ SUPABASE_ANON_KEY: 'anon-x' }, (m) => warns.push(m));
    expect(r1).toEqual({ key: 'anon-x', source: 'anon' });
    expect(r2).toEqual({ key: 'anon-x', source: 'anon' });
    expect(warns).toHaveLength(1);
  });
});
