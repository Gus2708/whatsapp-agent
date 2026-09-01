'use client';

import React from 'react';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import {
  Server,
  Database,
  GitBranch,
  BrainCircuit,
  Cloud,
  Zap,
  ShieldCheck,
  Radio,
  ArrowRight,
} from 'lucide-react';

export const MicroservicesTopologyCard: React.FC = () => {
  const microservices = [
    {
      id: 'waha',
      title: 'PASARELA WHATSAPP (WAHA)',
      status: 'Healthy (Docker Port 3000)',
      statusType: 'online',
      latency: '<12ms Ack',
      detail: 'NOWEB Engine · Multi-Session',
      icon: Radio,
    },
    {
      id: 'n8n',
      title: 'ORQUESTADOR N8N',
      status: '33 Nodos / Zero-Desync',
      statusType: 'online',
      latency: '4 Flujos Activos',
      detail: 'Deduplicación & Rate Limiter',
      icon: GitBranch,
    },
    {
      id: 'supabase',
      title: 'BASE VECTORIAL (SUPABASE)',
      status: 'pgvector / HNSW Cosine',
      statusType: 'online',
      latency: '7.650 SKUs',
      detail: 'PostgreSQL 15 + pg_trgm GIN',
      icon: Database,
    },
    {
      id: 'ai-engine',
      title: 'AUTONOMOUS SELF-HEAL',
      status: 'Claude Sonnet 5 Active',
      statusType: 'gold',
      latency: 'Pydantic Output',
      detail: 'Recuperación de Fallos en Vivo',
      icon: BrainCircuit,
    },
    {
      id: 'tunnels',
      title: 'TÚNELES CLOUDFLARE',
      status: 'Dynamic Ingress Active',
      statusType: 'online',
      latency: 'Heartbeat 30s',
      detail: 'Supabase tunnel_config Sync',
      icon: Cloud,
    },
    {
      id: 'catchup',
      title: 'CATCH-UP RESILIENCE',
      status: 'PowerShell Auto-Recovery',
      statusType: 'gold',
      latency: 'Zero Data Loss',
      detail: 'Tolerancia a Cortes Eléctricos',
      icon: Zap,
    },
  ];

  const pipelineStages = [
    { label: 'WAHA Inbound', sub: 'Webhook' },
    { label: 'Deduplicación', sub: '<12ms' },
    { label: '33 Nodos n8n', sub: 'Pipeline' },
    { label: 'RAG 5 Capas', sub: 'pgvector' },
    { label: 'Pydantic Output', sub: 'JSON' },
    { label: 'WAHA Dispatch', sub: 'WhatsApp' },
  ];

  return (
    <CrosshairCard className="p-4 bg-[#0c0c0c] flex flex-col justify-between h-full max-h-full min-h-0 flex-1">
      <div className="flex flex-col gap-3 h-full justify-between min-h-0">
        {/* Header with status badge */}
        <div className="flex justify-between items-center flex-shrink-0">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-compass-gold block mb-0.5">
              // RESILIENCE & RUNTIME TOPOLOGY
            </span>
            <h3 className="text-[15px] font-normal text-chalk">
              Topología de Microservicios & Pipeline en Producción
            </h3>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-pulse-green/10 border border-pulse-green/30 font-mono text-[10px] text-pulse-green">
            <span className="h-1.5 w-1.5 rounded-full bg-pulse-green animate-pulse" />
            <span>ALTA DISPONIBILIDAD ACTIVA</span>
          </div>
        </div>

        {/* 6 Microservice HUD Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 flex-shrink-0">
          {microservices.map((srv) => {
            const Icon = srv.icon;
            const isGold = srv.statusType === 'gold';
            return (
              <div
                key={srv.id}
                className="p-2.5 bg-[#080808] border border-graphite/80 hover:border-ash hover:bg-[#101010] transition-colors flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 font-mono text-[9px] text-smoke uppercase truncate">
                    <Icon className="h-3 w-3 text-compass-gold flex-shrink-0" />
                    <span className="truncate">{srv.title}</span>
                  </div>
                  <span
                    className={`font-mono text-[9px] px-1 py-0.2 border flex-shrink-0 ${
                      isGold
                        ? 'text-gold-bright border-gold-bright/30 bg-gold-bright/10'
                        : 'text-pulse-green border-pulse-green/30 bg-pulse-green/10'
                    }`}
                  >
                    {srv.latency}
                  </span>
                </div>

                <div>
                  <div
                    className={`text-[11.5px] font-medium truncate ${
                      isGold ? 'text-compass-gold' : 'text-pulse-green'
                    }`}
                  >
                    {srv.status}
                  </div>
                  <div className="font-mono text-[9.5px] text-smoke truncate mt-0.5">
                    {srv.detail}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Interactive Linear DAG Pipeline Flow */}
        <div className="p-2.5 bg-[#080808] border border-graphite flex flex-col gap-1.5 flex-shrink-0">
          <div className="font-mono text-[9px] uppercase tracking-wider text-compass-gold flex items-center justify-between">
            <span>Flujo de Ejecución de Eventos en Tiempo Real</span>
            <span className="text-smoke">Latencia Total ~42ms</span>
          </div>

          <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
            {pipelineStages.map((stage, idx) => (
              <React.Fragment key={stage.label}>
                <div className="flex flex-col items-center bg-[#141414] border border-graphite px-2 py-1 flex-1 min-w-[70px] text-center">
                  <span className="font-mono text-[9.5px] text-chalk font-medium truncate w-full">
                    {stage.label}
                  </span>
                  <span className="font-mono text-[8.5px] text-pulse-green truncate">
                    {stage.sub}
                  </span>
                </div>
                {idx < pipelineStages.length - 1 && (
                  <ArrowRight className="h-2.5 w-2.5 text-smoke flex-shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Operational Resilience Guarantees Footer */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-graphite/40 flex-shrink-0 font-mono text-[9.5px]">
          <div className="flex items-center gap-1.5 text-smoke truncate">
            <ShieldCheck className="h-3 w-3 text-pulse-green flex-shrink-0" />
            <span className="text-chalk truncate">Deduplicación 100%</span>
          </div>
          <div className="flex items-center gap-1.5 text-smoke truncate">
            <Server className="h-3 w-3 text-compass-gold flex-shrink-0" />
            <span className="text-chalk truncate">7.650 SKUs Catálogo</span>
          </div>
          <div className="flex items-center gap-1.5 text-smoke truncate">
            <Zap className="h-3 w-3 text-gold-bright flex-shrink-0" />
            <span className="text-chalk truncate">Zero Data Loss Queue</span>
          </div>
          <div className="flex items-center gap-1.5 text-smoke truncate">
            <Cloud className="h-3 w-3 text-blue-400 flex-shrink-0" />
            <span className="text-chalk truncate">Cloudflare Resilient</span>
          </div>
        </div>
      </div>
    </CrosshairCard>
  );
};
