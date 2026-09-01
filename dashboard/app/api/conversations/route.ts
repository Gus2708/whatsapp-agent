import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendWahaTextMessage } from '@/lib/waha-client';
import { Conversation, ChatMessage, LeadStatus } from '@/lib/types';
import { INITIAL_CONVERSATIONS } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Consultar cola de atenciones humanas en Supabase
    const { data: atenciones } = await supabase
      .from('atenciones_pendientes')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(15);

    // 2. Consultar sesiones activas de chat
    const { data: sessions } = await supabase
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(15);

    // 3. Consultar solicitudes de ayuda
    const { data: ayudas } = await supabase
      .from('solicitudes_ayuda')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(10);

    const conversationsMap: Map<string, Conversation> = new Map();

    // Agregar atenciones pendientes primero (Prioridad Alta)
    (atenciones || []).forEach((at, idx) => {
      const cleanPhone = at.telefono.replace('@lid', '').replace('@c.us', '');
      const isPending = at.status === 'pendiente';
      const status: LeadStatus = isPending ? 'escalated' : 'closed';
      const statusLabel = isPending ? 'Atención Requerida' : 'Atendido';

      const msgs: ChatMessage[] = [
        {
          sender: 'client',
          text: at.motivo || 'Hola, requiero comunicarme con un asesor de la ferretería.',
          time: new Date(at.creado_en).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        },
      ];

      if (at.atendido_en) {
        msgs.push({
          sender: 'agent',
          text: '👨🏻‍🔧 Atención tomada por el asesor de mostrador.',
          time: new Date(at.atendido_en).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          latency: '0.8s',
          cost: '$0.0000',
        });
      }

      conversationsMap.set(cleanPhone, {
        id: `atencion-${at.id || idx}`,
        name: at.nombre || `Cliente (+${cleanPhone.slice(-4)})`,
        phone: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
        status,
        statusLabel,
        score: isPending ? 98 : 80,
        silentMode: isPending,
        lastTime: new Date(at.creado_en).toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        intent: at.motivo?.includes('RESERVA')
          ? 'Reserva de Material'
          : 'Atención Personalizada en Mostrador',
        budget: at.motivo?.includes('RESERVA') ? '$ Divisas / Bs.' : '$ —',
        schedule: 'Retiro en Tienda (Mene Mauroa)',
        messages: msgs,
      });
    });

    // Agregar solicitudes de ayuda
    (ayudas || []).forEach((ay) => {
      const cleanPhone = ay.telefono.replace('@lid', '').replace('@c.us', '');
      if (!conversationsMap.has(cleanPhone)) {
        const isSent = ay.status === 'enviado';
        const msgs: ChatMessage[] = [
          {
            sender: 'client',
            text: ay.consulta || 'Consulta de inventario',
            time: new Date(ay.creado_en).toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          },
        ];

        if (ay.enviado_en) {
          msgs.push({
            sender: 'agent',
            text: '👨🏻‍🔧 ' + (ay.no_disponible ? 'El producto solicitado no está disponible.' : 'Cotización enviada al cliente.'),
            time: new Date(ay.enviado_en).toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
            latency: '1.4s',
            cost: '$0.0000',
          });
        }

        conversationsMap.set(cleanPhone, {
          id: `ayuda-${ay.id}`,
          name: ay.nombre || `Cliente (+${cleanPhone.slice(-4)})`,
          phone: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
          status: isSent ? 'in-progress' : 'escalated',
          statusLabel: isSent ? 'Cotización Enviada' : 'Ayuda Solicitada',
          score: 88,
          silentMode: false,
          lastTime: new Date(ay.creado_en).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          intent: 'Consulta de Producto Especial',
          budget: '$ —',
          schedule: 'Retiro en Tienda',
          messages: msgs,
        });
      }
    });

    // Agregar sesiones generales de chat
    (sessions || []).forEach((s) => {
      const cleanPhone = String(s.telefono || '').replace('@lid', '').replace('@c.us', '');
      if (cleanPhone && cleanPhone !== 'undefined' && !conversationsMap.has(cleanPhone)) {
        const isManual = s.estado === 'manual';
        conversationsMap.set(cleanPhone, {
          id: `session-${s.id || cleanPhone}`,
          name: `Cliente (+${cleanPhone.slice(-4)})`,
          phone: cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`,
          status: isManual ? 'escalated' : 'in-progress',
          statusLabel: isManual ? 'Modo Manual' : 'IA Activa (Perucho)',
          score: 75,
          silentMode: isManual,
          lastTime: new Date(s.updated_at).toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          intent: 'Consulta de Inventario y Precios',
          budget: '$ —',
          schedule: 'Retiro en Tienda',
          messages: [
            {
              sender: 'client',
              text: 'Buenas tardes, tienen disponibilidad de materiales?',
              time: new Date(s.updated_at).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            },
            {
              sender: 'agent',
              text: '¡Hola! 👨🏻‍🔧 Te atiende Perucho de Ferretería El Serrucho. Contamos con 7.650 SKUs en inventario. ¿Qué material necesitas cotizar?',
              time: new Date(s.updated_at).toLocaleTimeString('es-VE', {
                hour: '2-digit',
                minute: '2-digit',
              }),
              latency: '0.9s',
              cost: '$0.0000',
            },
          ],
        });
      }
    });

    const realList = Array.from(conversationsMap.values());
    if (realList.length > 0) {
      return NextResponse.json(realList);
    }

    return NextResponse.json(INITIAL_CONVERSATIONS);
  } catch (error: any) {
    return NextResponse.json(INITIAL_CONVERSATIONS);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, phone, silentMode, message } = body;

    const cleanPhone = String(phone || '').replace(/[^\d]/g, '');

    // 1. Alternar modo silencioso / manual en Supabase
    if (action === 'toggle_silent' && cleanPhone) {
      try {
        await supabase.from('chat_sessions').upsert({
          telefono: cleanPhone,
          estado: silentMode ? 'manual' : 'automatico',
          manual_since: silentMode ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        });
      } catch {}

      return NextResponse.json({ success: true, silentMode: Boolean(silentMode) });
    }

    // 2. Enviar mensaje real a WhatsApp vía WAHA
    if (action === 'send_message' && cleanPhone && message?.text) {
      const sendResult = await sendWahaTextMessage(cleanPhone, message.text);
      return NextResponse.json({
        success: sendResult.success,
        wahaDispatched: sendResult.success,
        error: sendResult.error,
      });
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error procesando solicitud', details: error.message },
      { status: 500 }
    );
  }
}
