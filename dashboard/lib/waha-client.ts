import { getTunnelUrl } from './tunnel';
import fs from 'fs';
import path from 'path';

const getWahaApiKey = (): string => {
  if (process.env.WAHA_API_KEY) {
    return process.env.WAHA_API_KEY.trim();
  }

  // Fallback buscando en archivos de entorno locales
  try {
    const candidates = [
      path.resolve(process.cwd(), '.env.local'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const match = content.match(/^WAHA_API_KEY=(.*)$/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  } catch {}

  return 'agent_waha_secret_2026';
};

export interface WahaChat {
  id: string;
  name?: string;
  unreadCount?: number;
  lastMessage?: {
    id: string;
    timestamp: number;
    body: string;
    fromMe: boolean;
  };
}

export interface WahaMessage {
  id: string;
  timestamp: number;
  from: string;
  fromMe: boolean;
  body: string;
  hasMedia?: boolean;
}

/**
 * Verifica el estado del servidor de WAHA a través del túnel.
 */
export async function checkWahaStatus(): Promise<boolean> {
  const wahaUrl = await getTunnelUrl('waha');
  if (!wahaUrl) return false;

  try {
    const apiKey = getWahaApiKey();
    const res = await fetch(`${wahaUrl}/api/server/status`, {
      headers: {
        'X-Api-Key': apiKey,
      },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Obtiene la lista de chats activos desde la instancia de WAHA a través del túnel dinámico.
 */
export async function fetchWahaChats(): Promise<WahaChat[]> {
  const wahaUrl = await getTunnelUrl('waha');
  if (!wahaUrl) {
    throw new Error('Túnel de WAHA no disponible o caído');
  }

  const apiKey = getWahaApiKey();
  const response = await fetch(`${wahaUrl}/api/default/chats`, {
    headers: {
      'X-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Error en WAHA API: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

/**
 * Obtiene el historial de mensajes de un chat específico desde WAHA.
 */
export async function fetchWahaMessages(chatId: string, limit = 25): Promise<WahaMessage[]> {
  const wahaUrl = await getTunnelUrl('waha');
  if (!wahaUrl) {
    throw new Error('Túnel de WAHA no disponible o caído');
  }

  const apiKey = getWahaApiKey();
  const response = await fetch(
    `${wahaUrl}/api/default/chats/${encodeURIComponent(chatId)}/messages?limit=${limit}&downloadMedia=false`,
    {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!response.ok) {
    throw new Error(`Error al obtener mensajes de WAHA: ${response.status}`);
  }

  return response.json();
}

/**
 * Envía un mensaje de texto de WhatsApp a través de la API de WAHA usando el túnel dinámico.
 */
export async function sendWahaTextMessage(
  chatId: string,
  text: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  const wahaUrl = await getTunnelUrl('waha');
  if (!wahaUrl) {
    return { success: false, error: 'Túnel de WAHA no disponible o fuera de línea' };
  }

  const apiKey = getWahaApiKey();
  const cleanChatId = chatId.includes('@') ? chatId : `${chatId}@c.us`;

  try {
    const response = await fetch(`${wahaUrl}/api/sendText`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: 'default',
        chatId: cleanChatId,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `WAHA HTTP ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message || 'Fallo de conexión con WAHA' };
  }
}
