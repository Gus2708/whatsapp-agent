import crypto from 'crypto';
import type { RagResult } from '@/lib/types';

export interface ServerKeyEnv {
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_SERVICE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface ResolvedServerKey {
  key: string;
  source: 'service_role' | 'anon' | 'none';
}

let anonFallbackWarned = false;

export function resetSupabaseKeyWarningForTests(): void {
  anonFallbackWarned = false;
}

/**
 * Resolves the server-side Supabase key: prefers SUPABASE_SERVICE_ROLE_KEY,
 * then SUPABASE_SERVICE_KEY, falling back to SUPABASE_ANON_KEY with a
 * one-time warning per process. Never logs any key value.
 */
export function resolveServerSupabaseKey(
  env: ServerKeyEnv,
  warnFn: (msg: string) => void = console.warn
): ResolvedServerKey {
  const serviceKey = (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '').trim();
  if (serviceKey) {
    return { key: serviceKey, source: 'service_role' };
  }

  const anonKey = (env.SUPABASE_ANON_KEY || '').trim();
  if (anonKey) {
    if (!anonFallbackWarned) {
      anonFallbackWarned = true;
      warnFn(
        '[api/rag] SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY not set; falling back to SUPABASE_ANON_KEY'
      );
    }
    return { key: anonKey, source: 'anon' };
  }

  return { key: '', source: 'none' };
}

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderSource, name: string): string {
  if (typeof (headers as Headers).get === 'function') {
    return ((headers as Headers).get(name) || '').trim();
  }
  const record = headers as Record<string, string | string[] | undefined>;
  const target = name.toLowerCase();
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === target) {
      const value = record[key];
      if (Array.isArray(value)) return (value[0] || '').trim();
      return (value || '').trim();
    }
  }
  return '';
}

function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface VerifyUserResult {
  userId: string | null;
  error?: string | null;
}

export interface CheckActiveEmployeeResult {
  active: boolean;
  error?: string | null;
}

export interface AuthorizeRagOptions {
  ragApiSecret?: string;
  verifyUser: (token: string) => Promise<VerifyUserResult>;
  checkActiveEmployee: (token: string, userId: string) => Promise<CheckActiveEmployeeResult>;
}

export type AuthorizeRagResult =
  | { authorized: true; method: 'supabase_jwt'; userId: string }
  | { authorized: true; method: 'api_key' }
  | { authorized: false; status: 401 | 403; error: string };

/**
 * Gates /api/rag BEFORE any service-key read.
 * Primary path: Authorization: Bearer <supabase-jwt> verified server-side via
 * supabase.auth.getUser(token) AND rpc('is_active_employee') (both using the
 * anon key + user token, never the service key).
 * Optional server-to-server path: x-rag-api-key matching server-only RAG_API_SECRET.
 */
export async function authorizeRagRequest(
  headers: HeaderSource,
  options: AuthorizeRagOptions
): Promise<AuthorizeRagResult> {
  const secret = (options.ragApiSecret || '').trim();
  const apiKeyHeader = readHeader(headers, 'x-rag-api-key');
  if (secret && apiKeyHeader) {
    if (timingSafeEqualString(apiKeyHeader, secret)) {
      return { authorized: true, method: 'api_key' };
    }
    return { authorized: false, status: 401, error: 'Credencial de API inválida' };
  }

  const authHeader = readHeader(headers, 'authorization');
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  const token = match ? match[1].trim() : '';

  if (!token || token === 'demo-token') {
    return { authorized: false, status: 401, error: 'Autenticación requerida' };
  }

  let userId: string;
  try {
    const verification = await options.verifyUser(token);
    if (!verification || verification.error || !verification.userId) {
      return { authorized: false, status: 401, error: 'Sesión inválida o expirada' };
    }
    userId = verification.userId;
  } catch {
    return { authorized: false, status: 401, error: 'No se pudo verificar la sesión' };
  }

  if (typeof options.checkActiveEmployee !== 'function') {
    return { authorized: false, status: 403, error: 'Acceso restringido a empleados activos' };
  }

  try {
    const employee = await options.checkActiveEmployee(token, userId);
    if (!employee || employee.error || employee.active !== true) {
      return { authorized: false, status: 403, error: 'Acceso restringido a empleados activos' };
    }
    return { authorized: true, method: 'supabase_jwt', userId };
  } catch {
    return { authorized: false, status: 403, error: 'No se pudo verificar permisos de empleado' };
  }
}

/**
 * Deterministic local demo result for Demo Mode so guests never touch
 * /api/rag with a service key and the UI stays responsive.
 */
export function getDemoRagResult(query: string): RagResult {
  const q = String(query || '').trim();
  const qLower = q.toLowerCase();

  if (qLower.includes('tornillo') || qLower.includes('drywall')) {
    return {
      hitLayer: 1,
      layerName: 'Capa 1: Parser Determinístico AST',
      sku: 'DEMO-SKU-001',
      productName: 'Tornillo Drywall 1/2" x 100u [DEMO]',
      price: '$2.50 USD (Bs. 150.00)',
      stock: 'Demo Local',
      latencyMs: 6,
      costEstimate: '$0.0000 (Modo Demo)',
      confidence: 0.96,
      method: 'Modo Demo Local · Exact / Dimension Match',
      query: q,
    };
  }

  if (qLower.includes('pega loca') || qLower.includes('bonder')) {
    return {
      hitLayer: 2,
      layerName: 'Capa 2: Diccionario Local & Jerga',
      sku: 'DEMO-SKU-002',
      productName: 'Adhesivo Instantáneo Cianoacrilato 3g [DEMO]',
      price: '$1.80 USD (Bs. 108.00)',
      stock: 'Demo Local',
      latencyMs: 12,
      costEstimate: '$0.0000 (Modo Demo)',
      confidence: 0.93,
      method: 'Modo Demo Local · Synonym Normalization',
      query: q,
    };
  }

  if (qLower.includes('gotera') || qLower.includes('techo') || qLower.includes('filtracion')) {
    return {
      hitLayer: 4,
      layerName: 'Capa 4: Vector Embeddings (pgvector HNSW)',
      sku: 'DEMO-SKU-003',
      productName: 'Impermeabilizante Asfáltico / Manto para Techo [DEMO]',
      price: '$18.00 USD (Bs. 1,080.00)',
      stock: 'Demo Local',
      latencyMs: 42,
      costEstimate: '$0.0000 (Modo Demo)',
      confidence: 0.91,
      method: 'Modo Demo Local · Semantic Vector Preview',
      query: q,
    };
  }

  return {
    hitLayer: 1,
    layerName: 'Capa 1: Parser Determinístico AST',
    sku: 'DEMO-SKU-004',
    productName: `Vista previa demo para "${q || 'consulta'}" (inicia sesión para catálogo en vivo)`,
    price: '$ — (Modo Demo)',
    stock: 'Demo Local',
    latencyMs: 8,
    costEstimate: '$0.0000 (Modo Demo)',
    confidence: 0.85,
    method: 'Modo Demo Local (sin consulta a base de datos)',
    query: q,
  };
}
