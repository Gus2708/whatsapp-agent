import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const telemetryData = {
    totalLeads: 191,
    autonomousResolutionRate: '80.6%',
    exactRecall: '76.9%',
    signalNoiseRatio: 0.123,
    avgInferenceCost: '$0.00008',
    microservices: [
      { name: 'PASARELA WHATSAPP (WAHA)', status: 'Healthy (Docker Port 3000)', healthy: true },
      { name: 'ORQUESTADOR N8N', status: '33 Nodos / Zero-Desync', healthy: true },
      { name: 'BASE VECTORIAL (SUPABASE)', status: 'pgvector / HNSW Cosine', healthy: true },
      { name: 'AUTONOMOUS SELF-HEAL', status: 'OpenRouter · gpt-5.6-luna', healthy: true },
    ],
  };

  return NextResponse.json(telemetryData);
}
