'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { buildFakeAxios } = require('./support/load-live-buscar');

// Load dashboard/lib/rag-auth.ts directly with no network and no external deps
// by transpiling/stripping its TypeScript syntax via Node's vm/strip or regex-free fallback.
async function loadRagAuthModule() {
  const filePath = path.join(ROOT, 'dashboard', 'lib', 'rag-auth.ts');
  const raw = fs.readFileSync(filePath, 'utf8');
  // Strip TS-only syntax (interfaces, type aliases, type imports, return/param types, `as` casts)
  // using a small deterministic transform compatible with Node 22 without node_modules.
  const crypto = require('node:crypto');
  const mod = { exports: {} };
  const stripped = raw
    .replace(/^import crypto from 'crypto';\r?\n/m, '')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export interface [\s\S]*?^\}\r?\n/gm, '')
    .replace(/^export type [\s\S]*?;\r?\n/gm, '')
    .replace(/export async function (\w+)/g, 'async function $1')
    .replace(/export function (\w+)/g, 'function $1')
    .replace(/let userId: string;/g, 'let userId;')
    // Strip parameter & return type annotations on function signatures in this module
    .replace(/resetSupabaseKeyWarningForTests\(\): void/g, 'resetSupabaseKeyWarningForTests()')
    .replace(
      /resolveServerSupabaseKey\(\s*env: ServerKeyEnv,\s*warnFn: \(msg: string\) => void = console\.warn\s*\): ResolvedServerKey/s,
      'resolveServerSupabaseKey(env, warnFn = console.warn)'
    )
    .replace(/readHeader\(headers: HeaderSource, name: string\): string/g, 'readHeader(headers, name)')
    .replace(/timingSafeEqualString\(a: string, b: string\): boolean/g, 'timingSafeEqualString(a, b)')
    .replace(
      /authorizeRagRequest\(\s*headers: HeaderSource,\s*options: AuthorizeRagOptions\s*\): Promise<AuthorizeRagResult>/s,
      'authorizeRagRequest(headers, options)'
    )
    .replace(/getDemoRagResult\(query: string\): RagResult/g, 'getDemoRagResult(query)')
    .replace(/\(headers as Headers\)/g, 'headers')
    .replace(/headers as Record<string, string \| string\[\] \| undefined>/g, 'headers');

  const factory = new Function(
    'crypto',
    'module',
    'exports',
    stripped +
      '\nmodule.exports = { resolveServerSupabaseKey, resetSupabaseKeyWarningForTests, authorizeRagRequest, getDemoRagResult };'
  );
  factory(crypto, mod, mod.exports);
  return mod.exports;
}

test('workflow JSON files contain zero hardcoded JWTs and prefer service key over anon key', () => {
  const workflowFiles = [
    'n8n_workflow.json',
    'workflows/production-baseline.json',
    'workflows/workflow_automejora.json',
    'workflows/workflow_reenviar_ayuda.json',
    'workflows/workflow_vocabulario.json',
  ];

  for (const rel of workflowFiles) {
    const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    assert.doesNotMatch(raw, /eyJhbGci/, `${rel} must not contain any hardcoded JWT`);
    assert.match(raw, /SUPABASE_SERVICE_ROLE_KEY/, `${rel} must reference SUPABASE_SERVICE_ROLE_KEY`);
    assert.match(raw, /SUPABASE_SERVICE_KEY/, `${rel} must reference SUPABASE_SERVICE_KEY`);
  }
});

test('docker-compose.yml injects Supabase service key env vars by reference without literal values', () => {
  const compose = fs.readFileSync(path.join(ROOT, 'docker-compose.yml'), 'utf8');
  assert.match(compose, /SUPABASE_SERVICE_ROLE_KEY=\$\{SUPABASE_SERVICE_ROLE_KEY:-\}/);
  assert.match(compose, /SUPABASE_SERVICE_KEY=\$\{SUPABASE_SERVICE_KEY:-\}/);
  assert.doesNotMatch(compose, /eyJhbGci/);
});

test('scratch_live/live_buscar.js prefers SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY and warns once on anon fallback', async () => {
  const raw = fs.readFileSync(path.join(ROOT, 'scratch_live', 'live_buscar.js'), 'utf8');
  const source = raw.replace("const axios = require('axios');", '');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

  const makeHeaderSpyAxios = () => {
    const base = buildFakeAxios();
    const calls = [];
    return {
      calls,
      get: (url, cfg) => {
        calls.push({ method: 'GET', url, headers: (cfg && cfg.headers) || {} });
        return base.get(url, cfg);
      },
      post: (url, body, cfg) => {
        calls.push({ method: 'POST', url, headers: (cfg && cfg.headers) || {} });
        return base.post(url, body, cfg);
      },
    };
  };

  // 1) Service key present -> sent in headers, no warning
  {
    delete globalThis.__sbAnonFallbackWarned;
    const warnings = [];
    const fake = makeHeaderSpyAxios();
    const fn = new AsyncFunction('query', 'axios', '$env', 'console', source);
    await fn(
      { p_busqueda: 'cemento' },
      fake,
      {
        SUPABASE_URL: 'http://supabase.test',
        SUPABASE_SERVICE_ROLE_KEY: 'svc-role-live',
        SUPABASE_ANON_KEY: 'anon-fallback',
      },
      { log: () => {}, info: () => {}, warn: (m) => warnings.push(m), error: () => {} }
    );
    assert.ok(fake.calls.length > 0);
    assert.equal(fake.calls[0].headers.apikey, 'svc-role-live');
    assert.equal(fake.calls[0].headers.Authorization, 'Bearer svc-role-live');
    assert.equal(warnings.length, 0);
  }

  // 2) SUPABASE_SERVICE_KEY alias present -> sent in headers, no warning
  {
    delete globalThis.__sbAnonFallbackWarned;
    const warnings = [];
    const fake = makeHeaderSpyAxios();
    const fn = new AsyncFunction('query', 'axios', '$env', 'console', source);
    await fn(
      { p_busqueda: 'cemento' },
      fake,
      {
        SUPABASE_URL: 'http://supabase.test',
        SUPABASE_SERVICE_KEY: 'svc-alias-live',
        SUPABASE_ANON_KEY: 'anon-fallback',
      },
      { log: () => {}, info: () => {}, warn: (m) => warnings.push(m), error: () => {} }
    );
    assert.equal(fake.calls[0].headers.apikey, 'svc-alias-live');
    assert.equal(fake.calls[0].headers.Authorization, 'Bearer svc-alias-live');
    assert.equal(warnings.length, 0);
  }

  // 3) Only anon key present -> falls back to anon key with ONE warning across multiple runs
  {
    delete globalThis.__sbAnonFallbackWarned;
    const warnings = [];
    const mockConsole = { log: () => {}, info: () => {}, warn: (m) => warnings.push(m), error: () => {} };
    const fn = new AsyncFunction('query', 'axios', '$env', 'console', source);
    for (let i = 0; i < 2; i++) {
      const fake = makeHeaderSpyAxios();
      await fn(
        { p_busqueda: 'cemento' },
        fake,
        { SUPABASE_URL: 'http://supabase.test', SUPABASE_ANON_KEY: 'anon-only-key' },
        mockConsole
      );
      assert.equal(fake.calls[0].headers.apikey, 'anon-only-key');
      assert.equal(fake.calls[0].headers.Authorization, 'Bearer anon-only-key');
    }
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /SUPABASE_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(warnings[0], /anon-only-key/);
  }
});

test('/api/rag auth: rejects missing token, demo-token, and invalid token with 401 before service key access', async () => {
  const { authorizeRagRequest } = await loadRagAuthModule();
  let verifyCalls = 0;
  let employeeCalls = 0;

  // No token -> 401
  const noAuth = await authorizeRagRequest(
    {},
    {
      verifyUser: async () => {
        verifyCalls++;
        return { userId: 'should-not-run' };
      },
      checkActiveEmployee: async () => {
        employeeCalls++;
        return { active: true };
      },
    }
  );
  assert.equal(noAuth.authorized, false);
  assert.equal(noAuth.status, 401);
  assert.equal(verifyCalls, 0);
  assert.equal(employeeCalls, 0);

  // Demo mode token -> 401 (never allowed to hit live DB with service key)
  const demoAuth = await authorizeRagRequest(
    { authorization: 'Bearer demo-token' },
    {
      verifyUser: async () => {
        verifyCalls++;
        return { userId: 'should-not-run' };
      },
      checkActiveEmployee: async () => {
        employeeCalls++;
        return { active: true };
      },
    }
  );
  assert.equal(demoAuth.authorized, false);
  assert.equal(demoAuth.status, 401);
  assert.equal(verifyCalls, 0);
  assert.equal(employeeCalls, 0);

  // Invalid JWT -> 401
  const invalidAuth = await authorizeRagRequest(
    { authorization: 'Bearer invalid.jwt.token' },
    {
      verifyUser: async (token) => {
        verifyCalls++;
        assert.equal(token, 'invalid.jwt.token');
        return { userId: null, error: 'JWT expired' };
      },
      checkActiveEmployee: async () => {
        employeeCalls++;
        return { active: true };
      },
    }
  );
  assert.equal(invalidAuth.authorized, false);
  assert.equal(invalidAuth.status, 401);
  assert.equal(verifyCalls, 1);
  assert.equal(employeeCalls, 0);
});

test('/api/rag auth: requires active employee (403 on inactive or rpc error), allows active JWT and optional x-rag-api-key, and resolves service key', async () => {
  const {
    authorizeRagRequest,
    resolveServerSupabaseKey,
    resetSupabaseKeyWarningForTests,
  } = await loadRagAuthModule();

  // Valid Supabase JWT + active employee -> authorized (200 path)
  const validJwt = await authorizeRagRequest(
    { Authorization: 'Bearer real.supabase.jwt' },
    {
      verifyUser: async (token) => {
        assert.equal(token, 'real.supabase.jwt');
        return { userId: 'emp-123', error: null };
      },
      checkActiveEmployee: async (token, userId) => {
        assert.equal(token, 'real.supabase.jwt');
        assert.equal(userId, 'emp-123');
        return { active: true, error: null };
      },
    }
  );
  assert.deepEqual(validJwt, {
    authorized: true,
    method: 'supabase_jwt',
    userId: 'emp-123',
  });

  // Valid JWT + inactive employee -> 403
  const inactiveJwt = await authorizeRagRequest(
    { Authorization: 'Bearer inactive.supabase.jwt' },
    {
      verifyUser: async () => ({ userId: 'outsider-1', error: null }),
      checkActiveEmployee: async () => ({ active: false, error: null }),
    }
  );
  assert.equal(inactiveJwt.authorized, false);
  assert.equal(inactiveJwt.status, 403);

  // Valid JWT + RPC error -> 403
  const rpcErrorJwt = await authorizeRagRequest(
    { Authorization: 'Bearer err.supabase.jwt' },
    {
      verifyUser: async () => ({ userId: 'emp-123', error: null }),
      checkActiveEmployee: async () => ({ active: false, error: 'rpc failed' }),
    }
  );
  assert.equal(rpcErrorJwt.authorized, false);
  assert.equal(rpcErrorJwt.status, 403);

  // Optional server-to-server x-rag-api-key: valid secret succeeds, wrong secret returns 401
  const validApiKey = await authorizeRagRequest(
    { 'x-rag-api-key': 'server-only-secret' },
    {
      ragApiSecret: 'server-only-secret',
      verifyUser: async () => {
        throw new Error('should not verify JWT when API key matched');
      },
      checkActiveEmployee: async () => {
        throw new Error('should not check employee when API key matched');
      },
    }
  );
  assert.deepEqual(validApiKey, { authorized: true, method: 'api_key' });

  const badApiKey = await authorizeRagRequest(
    { 'x-rag-api-key': 'wrong-secret' },
    {
      ragApiSecret: 'server-only-secret',
      verifyUser: async () => ({ userId: null }),
      checkActiveEmployee: async () => ({ active: false }),
    }
  );
  assert.equal(badApiKey.authorized, false);
  assert.equal(badApiKey.status, 401);

  // Server key resolution: service key preferred; anon fallback warns once
  resetSupabaseKeyWarningForTests();
  const warnings = [];
  const svc = resolveServerSupabaseKey(
    { SUPABASE_SERVICE_ROLE_KEY: 'srv-role', SUPABASE_ANON_KEY: 'anon-key' },
    (m) => warnings.push(m)
  );
  assert.deepEqual(svc, { key: 'srv-role', source: 'service_role' });
  assert.equal(warnings.length, 0);

  const anon1 = resolveServerSupabaseKey({ SUPABASE_ANON_KEY: 'anon-key' }, (m) => warnings.push(m));
  const anon2 = resolveServerSupabaseKey({ SUPABASE_ANON_KEY: 'anon-key' }, (m) => warnings.push(m));
  assert.deepEqual(anon1, { key: 'anon-key', source: 'anon' });
  assert.deepEqual(anon2, { key: 'anon-key', source: 'anon' });
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /anon-key/);
});

test('/api/rag demo mode returns deterministic local result without network or service key, and route.ts gates before reading service key', async () => {
  const { getDemoRagResult } = await loadRagAuthModule();
  const demoRes = getDemoRagResult('Tornillo drywall 1/2 x 100u');
  assert.equal(demoRes.hitLayer, 1);
  assert.match(demoRes.productName, /DEMO/);
  assert.equal(demoRes.query, 'Tornillo drywall 1/2 x 100u');

  const routeSource = fs.readFileSync(path.join(ROOT, 'dashboard', 'app', 'api', 'rag', 'route.ts'), 'utf8');
  const authIdx = routeSource.indexOf('authorizeRagRequest(');
  const serviceKeyIdx = routeSource.indexOf("getEnvVar('SUPABASE_SERVICE_ROLE_KEY')");
  assert.ok(authIdx > 0, 'route.ts must call authorizeRagRequest');
  assert.ok(serviceKeyIdx > authIdx, 'route.ts must authorize BEFORE reading SUPABASE_SERVICE_ROLE_KEY');
  assert.match(routeSource, /createClient\(supabaseUrl,\s*supabaseAnonKey/, 'JWT verification must use anon key, not service key');
  assert.match(routeSource, /status:\s*authResult\.status/, 'route.ts must return 401 on auth failure');

  const ragStudioSource = fs.readFileSync(path.join(ROOT, 'dashboard', 'components', 'rag', 'RagStudio.tsx'), 'utf8');
  assert.match(ragStudioSource, /if\s*\(isDemoMode\)/, 'RagStudio must handle demo mode locally');
  assert.match(ragStudioSource, /Authorization\s*=\s*`Bearer \$\{accessToken\}`/, 'RagStudio must forward Bearer token for authenticated users');
  assert.doesNotMatch(ragStudioSource, /x-rag-api-key|RAG_API_SECRET|SUPABASE_SERVICE/, 'Browser component must never touch server secrets');
});

test('/api/rag route.ts POST handler: 401 without/invalid token, 403 on inactive/rpc-error, 200 for active employee using service key (mocked, no network)', async () => {
  const ragAuth = await loadRagAuthModule();
  const rawRoute = fs.readFileSync(path.join(ROOT, 'dashboard', 'app', 'api', 'rag', 'route.ts'), 'utf8');

  const strippedRoute = rawRoute
    .replace(/^import\s+\{[^}]*\}\s+from\s+'[^']+';\r?\n/gm, '')
    .replace(/^import\s+\w+\s+from\s+'[^']+';\r?\n/gm, '')
    .replace(/const getEnvVar = \(key: string, defaultValue: string = ''\): string =>/g, "const getEnvVar = (key, defaultValue = '') =>")
    .replace(/process\.env\[key\]!\.trim\(\)/g, 'process.env[key].trim()')
    .replace(/async get\(url: string, cfg: any\)/g, 'async get(url, cfg)')
    .replace(/async post\(url: string, body: any, cfg: any\)/g, 'async post(url, body, cfg)')
    .replace(/const getLiveBuscarCode = \(\): string \| null =>/g, 'const getLiveBuscarCode = () =>')
    .replace(/export async function POST\(req: NextRequest\)/g, 'async function POST(req)')
    .replace(/const makeUserClient = \(token: string\) =>/g, 'const makeUserClient = (token) =>')
    .replace(/verifyUser: async \(token: string\) =>/g, 'verifyUser: async (token) =>')
    .replace(/checkActiveEmployee: async \(token: string\) =>/g, 'checkActiveEmployee: async (token) =>')
    .replace(/let hitLayer: 1 \| 2 \| 3 \| 4 \| 5 = 1;/g, 'let hitLayer = 1;')
    .replace(/const result: RagResult = \{/g, 'const result = {')
    .replace(/catch \(err: any\)/g, 'catch (err)');

  const authClientsCreated = [];
  const rpcCalls = [];
  const fetchCalls = [];
  const fakeCreateClient = (url, key, opts) => {
    authClientsCreated.push({ url, key, opts });
    const bearer = opts && opts.global && opts.global.headers && opts.global.headers.Authorization;
    return {
      auth: {
        async getUser(token) {
          if (['valid-employee-jwt', 'inactive-user-jwt', 'rpc-error-jwt'].includes(token)) {
            return { data: { user: { id: 'user-' + token } }, error: null };
          }
          return { data: { user: null }, error: { message: 'invalid jwt' } };
        },
      },
      async rpc(fnName) {
        rpcCalls.push({ fnName, key, bearer });
        if (fnName !== 'is_active_employee') return { data: null, error: { message: 'unexpected rpc' } };
        if (bearer === 'Bearer valid-employee-jwt') return { data: true, error: null };
        if (bearer === 'Bearer inactive-user-jwt') return { data: false, error: null };
        return { data: null, error: { message: 'rpc failed' } };
      },
    };
  };

  const NextResponse = {
    json(body, init) {
      return { status: (init && init.status) || 200, body };
    },
  };

  const fakeFetch = async (url, init) => {
    fetchCalls.push({ url: String(url), headers: (init && init.headers) || {} });
    const u = String(url);
    if (u.includes('/rest/v1/tazas')) return { json: async () => [{ bcv_usd: 60 }] };
    if (u.includes('/rest/v1/presupuesto_config')) return { json: async () => [{ markup_porcentaje: 40 }] };
    if (u.includes('/rest/v1/productos')) {
      return {
        json: async () => [
          { codigo_interno: 'CEM-1', descripcion: 'CEMENTO GRIS 42.5KG', precio_venta: 8.5, existencia: 25 },
        ],
      };
    }
    return { json: async () => [] };
  };

  const envBackup = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY,
    RAG_API_SECRET: process.env.RAG_API_SECRET,
  };

  try {
    process.env.SUPABASE_URL = 'https://unit-test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'unit-anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'unit-service-role-key';
    delete process.env.SUPABASE_SERVICE_KEY;
    delete process.env.RAG_API_SECRET;

    const factory = new Function(
      'fs',
      'path',
      'NextResponse',
      'createClient',
      'authorizeRagRequest',
      'resolveServerSupabaseKey',
      'fetch',
      strippedRoute + '\nreturn POST;'
    );
    const POST = factory(
      fs,
      path,
      NextResponse,
      fakeCreateClient,
      ragAuth.authorizeRagRequest,
      ragAuth.resolveServerSupabaseKey,
      fakeFetch
    );

    const makeReq = (headers, body) => ({
      headers: new Headers(headers),
      async json() {
        return body;
      },
    });

    // 1) No token -> 401, zero DB fetches
    const rNoAuth = await POST(makeReq({}, { query: 'cemento gris' }));
    assert.equal(rNoAuth.status, 401);
    assert.equal(fetchCalls.length, 0);

    // 2) Invalid token -> 401, auth client used anon key, zero RPC/DB fetches
    const rBad = await POST(makeReq({ Authorization: 'Bearer bad-jwt' }, { query: 'cemento gris' }));
    assert.equal(rBad.status, 401);
    assert.equal(authClientsCreated[0].key, 'unit-anon-key');
    assert.equal(rpcCalls.length, 0);
    assert.equal(fetchCalls.length, 0);

    // 3) Valid JWT but inactive employee -> 403, RPC called with user JWT + anon key, zero DB fetches
    const rInactive = await POST(makeReq({ Authorization: 'Bearer inactive-user-jwt' }, { query: 'cemento gris' }));
    assert.equal(rInactive.status, 403);
    assert.equal(rpcCalls[0].fnName, 'is_active_employee');
    assert.equal(rpcCalls[0].key, 'unit-anon-key');
    assert.equal(rpcCalls[0].bearer, 'Bearer inactive-user-jwt');
    assert.equal(fetchCalls.length, 0);

    // 4) Valid JWT + RPC error -> 403, zero DB fetches
    const rRpcErr = await POST(makeReq({ Authorization: 'Bearer rpc-error-jwt' }, { query: 'cemento gris' }));
    assert.equal(rRpcErr.status, 403);
    assert.equal(fetchCalls.length, 0);

    // 5) Active employee token -> 200, DB queries sent SUPABASE_SERVICE_ROLE_KEY
    const rOk = await POST(makeReq({ Authorization: 'Bearer valid-employee-jwt' }, { query: 'cemento gris' }));
    assert.equal(rOk.status, 200);
    assert.equal(rOk.body.query, 'cemento gris');
    assert.ok(fetchCalls.length > 0);
    assert.equal(fetchCalls[0].headers.apikey, 'unit-service-role-key');
    assert.equal(fetchCalls[0].headers.Authorization, 'Bearer unit-service-role-key');
  } finally {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
