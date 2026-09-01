import { NextRequest, NextResponse } from 'next/server';
import { INITIAL_CONVERSATIONS } from '@/lib/constants';

let conversationsStore = [...INITIAL_CONVERSATIONS];

export async function GET() {
  return NextResponse.json(conversationsStore);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, conversationId, message, silentMode } = body;

    if (action === 'toggle_silent') {
      conversationsStore = conversationsStore.map((c) =>
        c.id === conversationId ? { ...c, silentMode: Boolean(silentMode) } : c
      );
      return NextResponse.json({ success: true, conversations: conversationsStore });
    }

    if (action === 'send_message') {
      conversationsStore = conversationsStore.map((c) => {
        if (c.id === conversationId) {
          const updatedMessages = [...c.messages, message];
          return {
            ...c,
            lastTime: message.time || 'Ahora',
            messages: updatedMessages,
          };
        }
        return c;
      });
      return NextResponse.json({ success: true, conversations: conversationsStore });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to process conversation update' }, { status: 500 });
  }
}
