'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { N8N_ZONES } from '@/lib/constants';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Zap, ExternalLink, Activity, CheckCircle2, Play, RefreshCw, GitBranch } from 'lucide-react';

interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
}

interface N8nExecution {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt: string;
  workflowId: string;
}

export const N8nVisualizer: React.FC = () => {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [executions, setExecutions] = useState<N8nExecution[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const { playPacket, playSuccess } = useSound();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const topologyRef = useRef<HTMLDivElement | null>(null);

  const fetchN8nTelemetry = async () => {
    try {
      const res = await fetch('/api/n8n');
      if (res.ok) {
        const data = await res.json();
        setIsOnline(Boolean(data.online));
        setTunnelUrl(data.url || null);
        setWorkflows(data.workflows || []);
        setExecutions(data.executions || []);
      }
    } catch {
      setIsOnline(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchN8nTelemetry();
    const interval = setInterval(fetchN8nTelemetry, 10000);
    return () => clearInterval(interval);
  }, []);

  const simulatePacketPulse = (customExecutionId?: string) => {
    if (isSimulating) return;
    setIsSimulating(true);
    setActiveExecutionId(customExecutionId || null);
    playPacket();

    // Scroll smoothly to topology if triggered from execution list
    if (customExecutionId && topologyRef.current) {
      topologyRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    const sequence = [
      'node-waha-webhook',
      'node-200-ack',
      'node-dedup-filter',
      'node-rate-limit',
      'node-silent-check',
      'node-audio-switch',
      'node-debounce-burst',
      'node-sanitize-input',
      'node-load-session',
      'node-intent-router',
      'node-layer1-ast',
      'node-layer3-trgm',
      'node-pydantic-val',
      'node-sanitize-output',
      'node-crm-dispatch',
      'node-waha-send',
    ];

    const tl = gsap.timeline({
      onComplete: () => {
        setIsSimulating(false);
        setActiveNodeId(null);
        setActiveExecutionId(null);
        playSuccess();
      },
    });

    timelineRef.current = tl;

    sequence.forEach((nodeId) => {
      tl.to(
        {},
        {
          duration: 0.14,
          onStart: () => {
            setActiveNodeId(nodeId);
            playPacket();
          },
        }
      );
    });
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Controls */}
      <div className="flex flex-wrap justify-between items-end gap-4 mb-4">
        <div>
          <span className="font-mono text-[11px] text-compass-gold uppercase tracking-wider block mb-1">
            // LIVE CLOUDFLARE TUNNEL · N8N ORCHESTRATION ENGINE
          </span>
          <h2 className="text-2xl font-normal text-chalk tracking-tight">
            Topología de 33 Nodos & Telemetría en Vivo
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Dynamic Tunnel Status Indicator */}
          <div className="flex items-center gap-2 border border-graphite bg-[#111111] px-3 py-1.5 font-mono text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline
                  ? 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)] animate-pulse'
                  : 'bg-neon-rose'
              }`}
            />
            <span className="text-smoke">TÚNEL n8n:</span>
            <span className={isOnline ? 'text-pulse-green font-semibold' : 'text-smoke'}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {tunnelUrl && (
            <a
              href={tunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 font-mono text-xs font-semibold border border-compass-gold bg-compass-gold/10 text-compass-gold hover:bg-compass-gold/20 transition-colors"
            >
              <span>Abrir Editor n8n</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            onClick={() => simulatePacketPulse()}
            disabled={isSimulating}
            className={`inline-flex items-center gap-2 px-4 py-2 font-mono text-xs font-semibold uppercase border transition-all cursor-pointer ${
              isSimulating
                ? 'bg-pulse-green/20 text-pulse-green border-pulse-green cursor-wait'
                : 'bg-signal-white text-obsidian border-signal-white hover:bg-[#e4e4e7]'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{isSimulating ? 'Simulando Pulso...' : 'Simular Pulso'}</span>
          </button>
        </div>
      </div>

      {/* Live Workflows & Recent Executions Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 p-0.5">
        {/* Active Workflows Panel */}
        <CrosshairCard className="lg:col-span-6 p-5 bg-[#0a0a0a]">
          <div className="flex items-center justify-between font-mono text-xs text-smoke uppercase tracking-wider mb-3 pb-2 border-b border-graphite">
            <span className="flex items-center gap-1.5 text-chalk font-semibold">
              <GitBranch className="h-3.5 w-3.5 text-compass-gold" />
              <span>Workflows Activos en Instancia</span>
            </span>
            <span className="text-pulse-green">
              {workflows.filter((w) => w.active).length} ACTIVOS
            </span>
          </div>

          <div className="space-y-2">
            {workflows.length > 0 ? (
              workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between p-2.5 border border-graphite bg-[#121212] font-mono text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        wf.active ? 'bg-pulse-green' : 'bg-smoke'
                      }`}
                    />
                    <span className="text-chalk truncate">{wf.name}</span>
                  </div>
                  <span className="text-[11px] text-smoke ml-2 flex-shrink-0">
                    ID: {wf.id}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-4 text-center font-mono text-xs text-smoke">
                {isLoading ? 'Conectando con n8n...' : 'Sin workflows detectados'}
              </div>
            )}
          </div>
        </CrosshairCard>

        {/* Live Executions Panel with Direct Simulation Trigger */}
        <CrosshairCard className="lg:col-span-6 p-5 bg-[#0a0a0a]">
          <div className="flex items-center justify-between font-mono text-xs text-smoke uppercase tracking-wider mb-3 pb-2 border-b border-graphite">
            <span className="flex items-center gap-1.5 text-chalk font-semibold">
              <Activity className="h-3.5 w-3.5 text-pulse-green" />
              <span>Últimas Ejecuciones en Tiempo Real</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-smoke">Haz click para simular</span>
              <button
                onClick={fetchN8nTelemetry}
                className="text-smoke hover:text-chalk transition-colors cursor-pointer"
                title="Refrescar"
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {executions.length > 0 ? (
              executions.map((ex) => {
                const isSelectedForSim = isSimulating && activeExecutionId === ex.id;
                return (
                  <div
                    key={ex.id}
                    onClick={() => simulatePacketPulse(ex.id)}
                    className={`flex items-center justify-between p-2.5 border cursor-pointer transition-all duration-200 ${
                      isSelectedForSim
                        ? 'border-pulse-green bg-pulse-green/15 shadow-[0_0_12px_rgba(152,255,56,0.2)]'
                        : 'border-graphite bg-[#121212] hover:border-compass-gold/60 hover:bg-[#181818]'
                    }`}
                    title="Click para simular el pulso de esta ejecución abajo"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-pulse-green flex-shrink-0" />
                      <span className="text-chalk font-mono text-xs">Ejecución #{ex.id}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-smoke">
                        {new Date(ex.startedAt).toLocaleTimeString('es-VE', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          simulatePacketPulse(ex.id);
                        }}
                        className="flex items-center gap-1 font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-compass-gold/40 text-compass-gold bg-compass-gold/10 hover:bg-compass-gold/25 transition-colors"
                      >
                        <Play className="h-2.5 w-2.5 fill-current" />
                        <span>Simular</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center font-mono text-xs text-smoke">
                {isLoading ? 'Cargando telemetría de ejecuciones...' : 'Esperando ejecuciones...'}
              </div>
            )}
          </div>
        </CrosshairCard>
      </div>

      {/* 33-Node Visualizer Topology Grid */}
      <div ref={topologyRef} className="p-0.5">
        <CrosshairCard className="p-6 bg-[#080808]">
          <div className="flex items-center justify-between font-mono text-xs text-smoke uppercase tracking-wider mb-4 pb-2 border-b border-graphite">
            <span className="flex items-center gap-2 text-chalk font-semibold">
              <Zap className="h-3.5 w-3.5 text-pulse-green" />
              <span>Pipeline Visual de 33 Nodos</span>
            </span>
            {activeExecutionId && (
              <span className="font-mono text-xs text-pulse-green font-semibold animate-pulse">
                SIMULANDO EJECUCIÓN #{activeExecutionId}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 overflow-x-auto">
            {N8N_ZONES.map((zone) => (
              <div
                key={zone.zone}
                className="bg-[#0e0e0e] border border-graphite p-4 flex flex-col gap-2.5"
              >
                <div className="font-mono text-[11px] text-compass-gold uppercase tracking-wider border-b border-graphite pb-2 mb-1">
                  {zone.title}
                </div>

                {zone.nodes.map((node) => {
                  const isFiring = activeNodeId === node.id;
                  return (
                    <div
                      key={node.id}
                      className={`p-3 border flex items-center gap-2.5 text-xs text-chalk cursor-pointer transition-all duration-200 ${
                        isFiring
                          ? 'border-pulse-green bg-pulse-green/15 shadow-[0_0_14px_rgba(152,255,56,0.25)] scale-[1.02]'
                          : 'border-graphite bg-[#141414] hover:border-ash hover:bg-[#1c1c1c]'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 transition-all ${
                          isFiring
                            ? 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)]'
                            : 'bg-compass-gold'
                        }`}
                      />
                      <span className="font-mono text-[11.5px] truncate">{node.name}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </CrosshairCard>
      </div>
    </div>
  );
};
