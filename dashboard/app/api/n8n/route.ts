import { NextResponse } from 'next/server';
import { getTunnelUrl } from '@/lib/tunnel';
import fs from 'fs';
import path from 'path';

const getN8nApiKey = (): string => {
  if (process.env.N8N_API_KEY) {
    return process.env.N8N_API_KEY.trim();
  }

  try {
    const candidates = [
      path.resolve(process.cwd(), '.env.local'),
      path.resolve(process.cwd(), '.env'),
      path.resolve(process.cwd(), '..', '.env'),
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const match = content.match(/^N8N_API_KEY=(.*)$/m);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
    }
  } catch {}

  return '';
};

export const dynamic = 'force-dynamic';

export async function GET() {
  const n8nUrl = await getTunnelUrl('n8n');
  if (!n8nUrl) {
    return NextResponse.json({
      online: false,
      error: 'Túnel de n8n no disponible',
      workflows: [],
      executions: [],
    });
  }

  const apiKey = getN8nApiKey();

  try {
    const [wfRes, execRes] = await Promise.all([
      fetch(`${n8nUrl}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
        cache: 'no-store',
      }),
      fetch(`${n8nUrl}/api/v1/executions?limit=6`, {
        headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
        cache: 'no-store',
      }),
    ]);

    const workflows = wfRes.ok ? (await wfRes.json())?.data || [] : [];
    const executions = execRes.ok ? (await execRes.json())?.data || [] : [];

    return NextResponse.json({
      online: true,
      url: n8nUrl,
      workflows,
      executions,
    });
  } catch (error: any) {
    return NextResponse.json({
      online: false,
      url: n8nUrl,
      error: error.message,
      workflows: [],
      executions: [],
    });
  }
}
