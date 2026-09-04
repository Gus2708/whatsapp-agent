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
            // Auto-scroll to the active node so the animation is visible on mobile.
            // The global `scroll-behavior: auto` rule does NOT affect the
            // `behavior` option passed here, so reduced motion is checked directly.
            requestAnimationFrame(() => {
              const el = document.querySelector(`[data-node-id="${nodeId}"]`);
              if (!el) return;
              const prefersReduced = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
              ).matches;
              el.scrollIntoView({
                behavior: prefersReduced ? 'auto' : 'smooth',
                block: 'nearest',
              });
            });
          },
        }
      );
    });
  };

  return (
    <div className="crosshair-safe space-y-4 sm:space-y-6 pb-8 overflow-x-hidden">
      {/* Header & Controls */}
      <div className="flex flex-wrap justify-between items-start sm:items-end gap-3 mb-2 sm:mb-4">
        <div>
          <span className="font-mono text-[10px] sm:text-[11px] text-gold-bright uppercase tracking-wider block mb-1 font-medium">
            {'//'} LIVE CLOUDFLARE TUNNEL · N8N ORCHESTRATION ENGINE
          </span>
          <h2 className="text-xl sm:text-2xl font-normal text-chalk tracking-tight">
            Topología de 33 Nodos & Telemetría en Vivo
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Dynamic Tunnel Status Indicator */}
          <div className="flex items-center gap-2 border border-graphite bg-[#111111] px-2.5 sm:px-3 py-1.5 font-mono text-[11px] sm:text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline
                  ? 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)] animate-pulse'
                  : 'bg-neon-rose'
              }`}
            />
            <span className="text-smoke">TÚNEL:</span>
            <span className={isOnline ? 'text-pulse-green font-semibold' : 'text-smoke'}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>

          {tunnelUrl && (
            <a
              href={tunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] sm:text-xs font-semibold border border-compass-gold bg-compass-gold/10 text-gold-bright hover:bg-compass-gold/20 transition-colors min-h-[36px] sm:min-h-0"
            >
              <span>Editor n8n</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}

          <button
            onClick={() => simulatePacketPulse()}
            disabled={isSimulating}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 font-mono text-xs font-semibold uppercase border transition-all cursor-pointer min-h-[36px] sm:min-h-0 ${
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-5 p-0.5">
        {/* Active Workflows Panel */}
        <CrosshairCard className="lg:col-span-6 p-3.5 sm:p-5 bg-[#0a0a0a]">
          <div className="flex items-center justify-between font-mono text-[11px] sm:text-xs text-smoke uppercase tracking-wider mb-3 pb-2 border-b border-graphite">
            <span className="flex items-center gap-1.5 text-chalk font-semibold">
              <GitBranch className="h-3.5 w-3.5 text-gold-bright" />
              <span>Workflows Activos en Instancia</span>
            </span>
            <span className="text-pulse-green font-semibold">
              {workflows.filter((w) => w.active).length} ACTIVOS
            </span>
          </div>

          <div className="space-y-2">
            {workflows.length > 0 ? (
              workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between p-2 sm:p-2.5 border border-graphite bg-[#121212] font-mono text-[11.5px] sm:text-xs min-w-0"
                >
                  <div className="flex items-center gap-2 truncate min-w-0">
                    <span
                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                        wf.active ? 'bg-pulse-green' : 'bg-smoke'
                      }`}
                    />
                    <span className="text-chalk truncate">{wf.name}</span>
                  </div>
                  <span className="text-[10.5px] sm:text-[11px] text-smoke ml-2 flex-shrink-0 max-w-[120px] truncate">
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
        <CrosshairCard className="lg:col-span-6 p-3.5 sm:p-5 bg-[#0a0a0a]">
          <div className="flex items-center justify-between font-mono text-[11px] sm:text-xs text-smoke uppercase tracking-wider mb-3 pb-2 border-b border-graphite">
            <span className="flex items-center gap-1.5 text-chalk font-semibold">
              <Activity className="h-3.5 w-3.5 text-pulse-green" />
              <span>Últimas Ejecuciones en Tiempo Real</span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-smoke hidden sm:inline">Click para simular</span>
              <button
                onClick={fetchN8nTelemetry}
                className="hud-tap-target flex items-center justify-center text-smoke transition-colors hover:text-chalk cursor-pointer p-1"
                aria-label="Refrescar telemetria de n8n"
                title="Refrescar"
              >
                <RefreshCw className="h-3.5 w-3.5" />
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
                    className={`flex items-center justify-between p-2 sm:p-2.5 border cursor-pointer transition-all duration-200 min-h-[40px] ${
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

                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className="text-[10px] sm:text-[11px] text-smoke">
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
                        className="hud-tap-target flex items-center justify-center gap-1 font-mono text-[10px] uppercase font-semibold px-2 py-0.5 border border-compass-gold/40 text-gold-bright bg-compass-gold/10 hover:bg-compass-gold/25 transition-colors"
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
        <CrosshairCard className="p-3.5 sm:p-6 bg-[#080808]">
          <div className="flex items-center justify-between font-mono text-[11px] sm:text-xs text-smoke uppercase tracking-wider mb-3 sm:mb-4 pb-2 border-b border-graphite">
            <span className="flex items-center gap-2 text-chalk font-semibold">
              <Zap className="h-3.5 w-3.5 text-pulse-green" />
              <span>Pipeline Visual de 33 Nodos</span>
            </span>
            {activeExecutionId && (
              <span className="font-mono text-[11px] sm:text-xs text-pulse-green font-semibold animate-pulse">
                SIMULANDO EJECUCIÓN #{activeExecutionId}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5 sm:gap-5">
            {N8N_ZONES.map((zone) => (
              <div
                key={zone.zone}
                className="bg-[#0e0e0e] border border-graphite p-3 sm:p-4 flex flex-col gap-2 sm:gap-2.5"
              >
                <div className="font-mono text-[10.5px] sm:text-[11px] text-gold-bright uppercase tracking-wider border-b border-graphite pb-1.5 sm:pb-2 mb-1 font-semibold">
                  {zone.title}
                </div>

                {zone.nodes.map((node) => {
                  const isFiring = activeNodeId === node.id;
                  return (
                    <div
                      key={node.id}
                      data-node-id={node.id}
                      className={`p-2.5 sm:p-3 border flex items-center gap-2 sm:gap-2.5 text-xs text-chalk cursor-pointer transition-all duration-200 min-h-[38px] ${
                        isFiring
                          ? 'border-pulse-green bg-pulse-green/15 shadow-[0_0_14px_rgba(152,255,56,0.25)] scale-[1.02]'
                          : 'border-graphite bg-[#141414] hover:border-ash hover:bg-[#1c1c1c]'
                      }`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full flex-shrink-0 transition-all ${
                          isFiring
                            ? 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)]'
                            : 'bg-gold-bright'
                        }`}
                      />
                      <span className="font-mono text-[11px] sm:text-[11.5px] truncate">{node.name}</span>
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
