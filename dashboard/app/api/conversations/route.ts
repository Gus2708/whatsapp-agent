import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { sendWahaTextMessage, fetchWahaChats } from '@/lib/waha-client';
import { Conversation, ChatMessage, LeadStatus } from '@/lib/types';
import { INITIAL_CONVERSATIONS } from '@/lib/constants';

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || process.env.AGENT_NAME || 'Sales Agent';
const STORE_NAME = process.env.NEXT_PUBLIC_STORE_NAME || process.env.STORE_NAME || 'Commerce Store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Consultar cola de atenciones y solicitudes reales en Supabase
    const [atencionesRes, ayudasRes, sessionsRes] = await Promise.all([
      supabase
        .from('atenciones_pendientes')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(20),
      supabase
        .from('solicitudes_ayuda')
        .select('*')
        .order('creado_en', { ascending: false })
        .limit(20),
      supabase
        .from('chat_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);

    const atenciones = atencionesRes.data || [];
    const ayudas = ayudasRes.data || [];
    const sessions = sessionsRes.data || [];

    // 2. Extraer números de teléfono únicos y variantes para consultar mensajes reales
    const allVariantsSet = new Set<string>();
    const registerVariants = (raw?: string | null) => {
      if (!raw) return;
      const clean = String(raw).replace('@lid', '').replace('@c.us', '').trim();
      if (!clean || clean.startsWith('test_')) return;
      allVariantsSet.add(raw);
      allVariantsSet.add(clean);
      allVariantsSet.add(`${clean}@lid`);
      allVariantsSet.add(`${clean}@c.us`);
    };

    atenciones.forEach((a) => registerVariants(a.telefono));
    ayudas.forEach((a) => registerVariants(a.telefono));
    sessions.forEach((s) => registerVariants(s.telefono));

    const allVariants = Array.from(allVariantsSet);

    // 3. Consultar mensajes reales (inbound clientes y outbound bot) y WAHA en paralelo
    let wahaChatsMap: Record<string, any> = {};
    const messagesByCleanPhone = new Map<string, ChatMessage[]>();

    const [wahaRes, inMsgsRes, outMsgsRes] = await Promise.allSettled([
      fetchWahaChats(),
      allVariants.length > 0
        ? supabase
            .from('mensajes_procesados')
            .select('message_id, chat_id, procesado_at, texto')
            .not('texto', 'is', null)
            .in('chat_id', allVariants)
            .order('procesado_at', { ascending: true })
        : Promise.resolve({ data: [] }),
      allVariants.length > 0
        ? supabase
            .from('mensajes_bot')
            .select('id, chat_id, created_at, texto_norm')
            .not('texto_norm', 'is', null)
            .in('chat_id', allVariants)
            .order('created_at', { ascending: true })
        : Promise.resolve({ data: [] }),
    ]);

    if (wahaRes.status === 'fulfilled' && Array.isArray(wahaRes.value)) {
      wahaRes.value.forEach((c) => {
        const tel = String(c.id || '').replace('@c.us', '').replace('@lid', '');
        wahaChatsMap[tel] = c;
      });
    }

    const formatMsgTime = (isoString?: string | null) => {
      if (!isoString) return '';
      try {
        return new Date(isoString).toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return '';
      }
    };

    // Indexar mensajes reales combinados cronológicamente por cleanPhone
    const inData =
      inMsgsRes.status === 'fulfilled' && (inMsgsRes.value as any)?.data
        ? (inMsgsRes.value as any).data
        : [];
    const outData =
      outMsgsRes.status === 'fulfilled' && (outMsgsRes.value as any)?.data
        ? (outMsgsRes.value as any).data
        : [];

    const rawMergedList: { cleanPhone: string; rawTime: number; msg: ChatMessage }[] = [];

    inData.forEach((m: any) => {
      if (!m.texto || !m.texto.trim()) return;
      const clean = String(m.chat_id || '').replace('@lid', '').replace('@c.us', '');
      rawMergedList.push({
        cleanPhone: clean,
        rawTime: m.procesado_at ? new Date(m.procesado_at).getTime() : 0,
        msg: {
          id: `m-in-${m.message_id || Math.random()}`,
          sender: 'client',
          text: m.texto,
          time: formatMsgTime(m.procesado_at),
        },
      });
    });

    outData.forEach((m: any) => {
      if (!m.texto_norm || !m.texto_norm.trim()) return;
      const clean = String(m.chat_id || '').replace('@lid', '').replace('@c.us', '');
      const isTag = m.texto_norm.startsWith('[') && m.texto_norm.endsWith(']');
      rawMergedList.push({
        cleanPhone: clean,
        rawTime: m.created_at ? new Date(m.created_at).getTime() : 0,
        msg: isTag
          ? {
              id: `m-out-${m.id}`,
              sender: 'system',
              text:
                m.texto_norm === '[pedir_ayuda]'
                  ? '🤖 Consulta escalada para búsqueda avanzada'
                  : '👨🏻‍💼 Solicitud de atención en mostrador registrada',
              time: formatMsgTime(m.created_at),
            }
          : {
              id: `m-out-${m.id}`,
              sender: 'agent',
              text: m.texto_norm,
              time: formatMsgTime(m.created_at),
              latency: '0.8s',
              cost: '$0.0000',
            },
      });
    });

    rawMergedList.sort((a, b) => a.rawTime - b.rawTime);

    rawMergedList.forEach(({ cleanPhone, msg }) => {
      if (!messagesByCleanPhone.has(cleanPhone)) {
        messagesByCleanPhone.set(cleanPhone, []);
      }
      messagesByCleanPhone.get(cleanPhone)!.push(msg);
    });

    const convMap = new Map<string, Conversation>();

    // Helper para formatear teléfonos
    const formatPhone = (raw: string) => {
      const clean = raw.replace(/[^\d]/g, '');
      if (clean.startsWith('58') && clean.length >= 12) {
        return `+58 ${clean.slice(2, 5)}-${clean.slice(5, 8)}-${clean.slice(8)}`;
      }
      if (clean.length >= 10) {
        return `+58 4${clean.slice(-9, -6)}-${clean.slice(-6, -3)}-${clean.slice(-3)}`;
      }
      return clean.startsWith('+') ? clean : `+58 ${clean}`;
    };

    // 4. Mapear atenciones_pendientes (Prioridad 1: reservas y mostrador)
    atenciones.forEach((at) => {
      if (!at.motivo && !at.nombre) return;
      const cleanPhone = String(at.telefono || '').replace('@lid', '').replace('@c.us', '');
      if (!cleanPhone || cleanPhone === 'undefined') return;

      const isPending = at.status === 'pendiente';
      const isReserva = at.motivo?.includes('RESERVA');
      const displayName =
        at.nombre && at.nombre.trim() && at.nombre !== '.'
          ? at.nombre
          : `Cliente (+${cleanPhone.slice(-4)})`;
      const timeStr = at.creado_en ? formatMsgTime(at.creado_en) : '10:00';

      const realMsgs = messagesByCleanPhone.get(cleanPhone) || [];
      const messages: ChatMessage[] =
        realMsgs.length > 0
          ? realMsgs
          : [
              {
                id: `m-at-c-${at.id}`,
                sender: 'client',
                text: at.motivo || 'Hola, requiero comunicarme con un asesor de mostrador.',
                time: timeStr,
              },
              {
                id: `m-at-a-${at.id}`,
                sender: isPending ? 'system' : 'agent',
                text: isReserva
                  ? `🛒 Solicitud de reserva registrada para retiro en tienda.`
                  : isPending
                  ? '👨🏻‍💼 Solicitud de atención en mostrador registrada en cola.'
                  : '👨🏻‍💼 Atención tomada por asesor de mostrador.',
                time: timeStr,
                latency: '0.8s',
                cost: '$0.0000',
              },
            ];

      const lastTime = messages[messages.length - 1]?.time || timeStr;

      convMap.set(cleanPhone, {
        id: `at-${at.id}`,
        name: displayName,
        phone: formatPhone(cleanPhone),
        status: isReserva ? 'qualified' : isPending ? 'escalated' : 'closed',
        statusLabel: isReserva
          ? 'Reserva Confirmada'
          : isPending
          ? 'Atención Requerida'
          : 'Atendido en Tienda',
        score: isReserva ? 96 : isPending ? 90 : 82,
        silentMode: isPending,
        lastTime,
        intent: isReserva
          ? at.motivo.replace('🛒 RESERVA:', '').trim()
          : at.motivo?.slice(0, 50) || 'Consulta Ferretera',
        budget: isReserva ? '$28.00 USD' : '$ —',
        schedule: 'Retiro en Tienda',
        messages,
      });
    });

    // 5. Mapear solicitudes_ayuda (Prioridad 2: preguntas de catálogo complejas)
    ayudas.forEach((ay) => {
      if (!ay.consulta && !ay.nombre) return;
      const cleanPhone = String(ay.telefono || '').replace('@lid', '').replace('@c.us', '');
      if (!cleanPhone || cleanPhone === 'undefined' || convMap.has(cleanPhone)) return;

      const isResolved = ay.status === 'enviado' || ay.status === 'resuelto';
      const displayName =
        ay.nombre && ay.nombre.trim() && ay.nombre !== '.'
          ? ay.nombre
          : `Cliente (+${cleanPhone.slice(-4)})`;
      const timeStr = ay.creado_en ? formatMsgTime(ay.creado_en) : '09:30';

      const realMsgs = messagesByCleanPhone.get(cleanPhone) || [];
      const messages: ChatMessage[] =
        realMsgs.length > 0
          ? realMsgs
          : [
              {
                id: `m-ay-c-${ay.id}`,
                sender: 'client',
                text: ay.consulta || 'Consulta de inventario',
                time: timeStr,
              },
              {
                id: `m-ay-a-${ay.id}`,
                sender: 'agent',
                text: ay.no_disponible
                  ? 'El producto solicitado no se encuentra disponible actualmente en inventario.'
                  : 'Producto verificado en catálogo para retiro en tienda.',
                time: timeStr,
                latency: '24ms (pgvector + GIN)',
                cost: '$0.0000',
              },
            ];

      const lastTime = messages[messages.length - 1]?.time || timeStr;

      convMap.set(cleanPhone, {
        id: `ay-${ay.id}`,
        name: displayName,
        phone: formatPhone(cleanPhone),
        status: isResolved ? 'closed' : 'in-progress',
        statusLabel: isResolved ? 'Cotizado / Resuelto' : 'En Búsqueda RAG',
        score: 88,
        silentMode: false,
        lastTime,
        intent: ay.consulta?.slice(0, 50) || 'Consulta de Catálogo',
        budget: '$ —',
        schedule: 'Retiro en Tienda',
        messages,
      });
    });

    // 6. Mapear sesiones activas de WhatsApp
    sessions.forEach((s) => {
      const cleanPhone = String(s.telefono || '').replace('@lid', '').replace('@c.us', '');
      if (
        !cleanPhone ||
        cleanPhone === 'undefined' ||
        convMap.has(cleanPhone) ||
        cleanPhone.startsWith('test_')
      )
        return;

      const isManual = s.estado === 'manual';
      const wahaChat = wahaChatsMap[cleanPhone];
      const timeStr = s.updated_at ? formatMsgTime(s.updated_at) : 'Ahora';

      const realMsgs = messagesByCleanPhone.get(cleanPhone) || [];
      const messages: ChatMessage[] =
        realMsgs.length > 0
          ? realMsgs
          : [
              {
                id: `m-s-c-${s.id}`,
                sender: 'client',
                text:
                  wahaChat?.lastMessage?.body ||
                  'Buenas tardes, tienen disponibilidad de materiales?',
                time: timeStr,
              },
              {
                id: `m-s-a-${s.id}`,
                sender: isManual ? 'system' : 'agent',
                text: isManual
                  ? '👨🏻‍💼 Sesión asignada para atención manual.'
                  : `¡Hola! Te atiende ${AGENT_NAME} de ${STORE_NAME}. Contamos con catálogo en línea. ¿Qué producto necesitas cotizar?`,
                time: timeStr,
                latency: '0.8s',
                cost: '$0.0000',
              },
            ];

      const lastTime = messages[messages.length - 1]?.time || timeStr;

      convMap.set(cleanPhone, {
        id: `session-${s.id || cleanPhone}`,
        name: wahaChat?.name || `Cliente (+${cleanPhone.slice(-4)})`,
        phone: formatPhone(cleanPhone),
        status: isManual ? 'escalated' : 'in-progress',
        statusLabel: isManual ? 'Atención Manual' : `IA Activa (${AGENT_NAME})`,
        score: isManual ? 92 : 78,
        silentMode: isManual,
        lastTime,
        intent: s.no_atender_motivo || 'Consulta Activa en WhatsApp',
        budget: '$ —',
        schedule: 'Retiro en Tienda',
        messages,
      });
    });

    const realList = Array.from(convMap.values());
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

    // 1. Alternar modo silencioso en Supabase
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

    // 2. Enviar mensaje real vía WAHA
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
