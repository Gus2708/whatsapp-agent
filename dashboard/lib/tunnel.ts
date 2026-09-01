import { supabase } from './supabase';

export interface TunnelRecord {
  servicio: 'n8n' | 'waha' | string;
  url: string | null;
  hostname: string | null;
  tunnel_state: 'running' | 'error' | 'down' | 'desconocido' | string;
  updated_at: string;
  last_error: string | null;
}

export interface TunnelStatus {
  service: 'n8n' | 'waha' | string;
  url: string | null;
  state: 'running' | 'error' | 'down' | 'desconocido' | string;
  isOnline: boolean;
  ageSeconds: number;
  lastUpdated: string;
  lastError: string | null;
}

// In-memory short-lived cache (15 seconds) to minimize Supabase query overhead
const cache: Record<string, { data: TunnelRecord; fetchedAt: number }> = {};
const CACHE_TTL_MS = 15 * 1000;

/**
 * Obtiene la configuración y URL vigente del túnel desde la tabla public.tunnel_config.
 * Valida que el túnel esté en estado 'running' y con heartbeat fresco (< 90s).
 */
export async function getTunnelConfig(servicio: 'n8n' | 'waha'): Promise<TunnelStatus> {
  const now = Date.now();
  const cached = cache[servicio];

  let record: TunnelRecord | null = null;

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    record = cached.data;
  } else {
    try {
      const { data, error } = await supabase
        .from('tunnel_config')
        .select('servicio, url, hostname, tunnel_state, updated_at, last_error')
        .eq('servicio', servicio)
        .maybeSingle();

      if (!error && data) {
        record = data as TunnelRecord;
        cache[servicio] = { data: record, fetchedAt: now };
      }
    } catch (err) {
      console.error(`[Tunnel] Error al consultar tunnel_config para ${servicio}:`, err);
    }
  }

  if (!record || !record.url) {
    return {
      service: servicio,
      url: null,
      state: record?.tunnel_state || 'down',
      isOnline: false,
      ageSeconds: 999999,
      lastUpdated: record?.updated_at || new Date(0).toISOString(),
      lastError: record?.last_error || 'Túnel no registrado en Supabase',
    };
  }

  const updatedAtTime = new Date(record.updated_at).getTime();
  const ageSeconds = Math.max(0, Math.floor((now - updatedAtTime) / 1000));
  const isRunning = record.tunnel_state === 'running' && Boolean(record.url);
  const isOnline = isRunning;

  return {
    service: servicio,
    url: isOnline ? record.url : record.url, // Return url with status flag
    state: record.tunnel_state,
    isOnline,
    ageSeconds,
    lastUpdated: record.updated_at,
    lastError: record.last_error,
  };
}

/**
 * Obtiene la URL activa validada de un servicio ('n8n' o 'waha'). Retorna null si está offline.
 */
export async function getTunnelUrl(servicio: 'n8n' | 'waha'): Promise<string | null> {
  const status = await getTunnelConfig(servicio);
  return status.isOnline ? status.url : null;
}

/**
 * Obtiene el estado consolidado de ambos túneles (n8n y waha).
 */
export async function getAllTunnels(): Promise<{ n8n: TunnelStatus; waha: TunnelStatus }> {
  const [n8n, waha] = await Promise.all([getTunnelConfig('n8n'), getTunnelConfig('waha')]);
  return { n8n, waha };
}
