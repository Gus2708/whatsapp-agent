import { NextResponse } from 'next/server';
import { getAllTunnels } from '@/lib/tunnel';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const tunnels = await getAllTunnels();
    return NextResponse.json(tunnels);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Error al consultar estado de túneles', details: error.message },
      { status: 500 }
    );
  }
}
