import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_CONVERSATIONS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { sendWahaTextMessage, fetchWahaChats } from '@/lib/waha-client';
import { Conversation, ChatMessage, LeadStatus } from '@/lib/types';

let localConversations = [...INITIAL_CONVERSATIONS];

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Consultar sesiones activas y cola humana en Supabase
    const { data: dbSessions } = await supabase
      .from('chat_sessions')
      .select('telefono, estado, msg_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(10);

    const { data: atenciones } = await supabase
      .from('atenciones_pendientes')
      .select('telefono, nombre, motivo, status, creado_en')
      .eq('status', 'pendiente');

    // 2. Consultar WAHA si el túnel está online
    let wahaChatsMap: Record<string, any> = {};
    try {
      const chats = await fetchWahaChats();
      if (Array.isArray(chats)) {
        chats.forEach((c) => {
          const tel = c.id.replace('@c.us', '');
          wahaChatsMap[tel] = c;
        });
      }
    } catch {
      // WAHA tunnel offline o reiniciando, fallback transparente
    }

    // 3. Mapear o enriquecer conversaciones con tipado exacto
    if (dbSessions && dbSessions.length > 0) {
      const liveList: Conversation[] = dbSessions.map((s, idx) => {
        const tel = s.telefono;
        const matchingAtencion = atenciones?.find((a) => a.telefono === tel);
        const wahaChat = wahaChatsMap[tel];

        const isManual = s.estado === 'manual' || Boolean(matchingAtencion);
        const status: LeadStatus = isManual ? 'escalated' : 'in-progress';
        const statusLabel = isManual ? 'Atención Humana' : 'En Atención (IA)';

        const msgs: ChatMessage[] = [
          {
            sender: 'client',
            text: matchingAtencion?.motivo || wahaChat?.lastMessage?.body || 'Hola, buenos días',
            time: new Date(s.updated_at).toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
          {
            sender: 'agent',
            text: isManual
              ? '👨🏻‍🔧 Un asesor de mostrador de Ferretería El Serrucho ha tomado tu chat.'
              : '¡Hola! 👨🏻‍🔧 Te atiende Perucho de Ferretería El Serrucho. ¿En qué te puedo colaborar hoy?',
            time: new Date(s.updated_at).toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            latency: '1.2s',
            cost: '$0.0000',
          },
        ];

        return {
          id: `conv-db-${idx + 1}`,
          name: matchingAtencion?.nombre || wahaChat?.name || `Cliente (${tel.slice(-4)})`,
          phone: tel.startsWith('+') ? tel : `+${tel}`,
          status,
          statusLabel,
          score: isManual ? 95 : 75,
          silentMode: isManual,
          lastTime: new Date(s.updated_at).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          intent: isManual ? 'Atención Humana Solicitada' : 'Consulta de Inventario y Precios',
          budget: '$ —',
          schedule: 'Retiro en Tienda (Mene Mauroa)',
          messages: msgs,
        };
      });

      return NextResponse.json(liveList);
    }

    return NextResponse.json(localConversations);
  } catch (error) {
    return NextResponse.json(localConversations);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, conversationId, message, phone, silentMode } = body;

    // Alternar Silent Mode / Handoff Manual en Supabase
    if (action === 'toggle_silent') {
      const cleanPhone = String(phone || '').replace(/[^\d]/g, '');
      if (cleanPhone) {
        try {
          await supabase.from('chat_sessions').upsert({
            telefono: cleanPhone,
            estado: silentMode ? 'manual' : 'automatico',
            updated_at: new Date().toISOString(),
          });
        } catch {
          // Ignorar error de red si Supabase está offline
        }
      }

      localConversations = localConversations.map((c) =>
        c.id === conversationId ? { ...c, silentMode: Boolean(silentMode) } : c
      );
      return NextResponse.json({ success: true, conversations: localConversations });
    }

    // Enviar mensaje real por WhatsApp vía túnel dinámico WAHA
    if (action === 'send_message') {
      let wahaDispatched = false;
      const cleanPhone = String(phone || '').replace(/[^\d]/g, '');

      if (cleanPhone && message?.text) {
        const sendResult = await sendWahaTextMessage(cleanPhone, message.text);
        wahaDispatched = sendResult.success;
      }

      localConversations = localConversations.map((c) => {
        if (c.id === conversationId) {
          const updatedMessages: ChatMessage[] = [...c.messages, message];
          return {
            ...c,
            lastTime: message.time || 'Ahora',
            messages: updatedMessages,
          };
        }
        return c;
      });

      return NextResponse.json({
        success: true,
        wahaDispatched,
        conversations: localConversations,
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to process conversation update', details: error.message },
      { status: 500 }
    );
  }
}
