import { getTunnelUrl } from './tunnel';

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
 * Obtiene la lista de chats activos desde la instancia de WAHA a través del túnel dinámico.
 */
export async function fetchWahaChats(): Promise<WahaChat[]> {
  const wahaUrl = await getTunnelUrl('waha');
  if (!wahaUrl) {
    throw new Error('Túnel de WAHA no disponible o caído');
  }

  const apiKey = process.env.WAHA_API_KEY || 'perucho_waha_secret_2026';
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

  const apiKey = process.env.WAHA_API_KEY || 'perucho_waha_secret_2026';
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

  const apiKey = process.env.WAHA_API_KEY || 'perucho_waha_secret_2026';
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
