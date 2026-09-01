'use client';

import React, { useState, useRef, useEffect } from 'react';
import gsap from 'gsap';
import { N8N_ZONES } from '@/lib/constants';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Zap, ExternalLink, Activity, Radio, Layout } from 'lucide-react';

export const N8nVisualizer: React.FC = () => {
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [tunnelState, setTunnelState] = useState<'running' | 'offline' | 'loading'>('loading');
  const [viewMode, setViewMode] = useState<'topology' | 'iframe'>('topology');
  const { playPacket, playSuccess } = useSound();
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  // Consultar el túnel dinámico de n8n desde Supabase
  useEffect(() => {
    const checkTunnel = async () => {
      try {
        const res = await fetch('/api/tunnel');
        if (res.ok) {
          const data = await res.json();
          if (data?.n8n?.isOnline && data?.n8n?.url) {
            setTunnelUrl(data.n8n.url);
            setTunnelState('running');
          } else {
            setTunnelUrl(data?.n8n?.url || null);
            setTunnelState(data?.n8n?.state === 'running' ? 'running' : 'offline');
          }
        }
      } catch {
        setTunnelState('offline');
      }
    };

    checkTunnel();
    const interval = setInterval(checkTunnel, 15000);
    return () => clearInterval(interval);
  }, []);

  const simulatePacketPulse = () => {
    if (isSimulating) return;
    setIsSimulating(true);
    playPacket();

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
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-4 mb-4">
        <div>
          <span className="font-mono text-[11px] text-compass-gold uppercase tracking-wider block mb-1">
            // PRODUCTION N8N TOPOLOGY & DYNAMIC TUNNEL
          </span>
          <h2 className="text-2xl font-normal text-chalk tracking-tight">
            Flujo de los 33 Nodos Dividido en 4 Zonas
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Dynamic Tunnel Badge */}
          <div className="flex items-center gap-2 border border-graphite bg-[#111111] px-3 py-1.5 font-mono text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                tunnelState === 'running'
                  ? 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)] animate-pulse'
                  : 'bg-neon-rose'
              }`}
            />
            <span className="text-smoke">TÚNEL n8n:</span>
            <span
              className={
                tunnelState === 'running' ? 'text-pulse-green font-semibold' : 'text-smoke'
              }
            >
              {tunnelState === 'running' ? 'ONLINE (Cloudflare)' : 'OFFLINE'}
            </span>
          </div>

          {tunnelUrl && (
            <a
              href={tunnelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs border border-compass-gold text-compass-gold hover:bg-compass-gold/10 transition-colors"
            >
              <span>Abrir n8n</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <button
            onClick={() => setViewMode(viewMode === 'topology' ? 'iframe' : 'topology')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-xs border border-graphite bg-[#111111] text-smoke hover:text-chalk transition-colors"
          >
            <Layout className="h-3 w-3" />
            <span>{viewMode === 'topology' ? 'Ver n8n Embebido' : 'Ver Topología'}</span>
          </button>

          <button
            onClick={simulatePacketPulse}
            disabled={isSimulating}
            className={`inline-flex items-center gap-2 px-4 py-2 font-mono text-xs font-semibold uppercase border transition-all ${
              isSimulating
                ? 'bg-pulse-green/20 text-pulse-green border-pulse-green cursor-wait'
                : 'bg-signal-white text-obsidian border-signal-white hover:bg-[#e4e4e7]'
            }`}
          >
            <Zap className="h-3.5 w-3.5" />
            <span>{isSimulating ? 'Simulando...' : 'Simular Pulso'}</span>
          </button>
        </div>
      </div>

      {viewMode === 'iframe' && tunnelUrl ? (
        <CrosshairCard className="p-2 bg-[#080808] min-h-[650px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-graphite text-xs font-mono text-smoke">
            <span>INSTANCIA EN VIVO: {tunnelUrl}</span>
            <span className="text-pulse-green">● SINCRONIZADO</span>
          </div>
          <iframe
            src={tunnelUrl}
            className="w-full flex-1 min-h-[600px] border-0 bg-obsidian"
            title="n8n Live Workflow Canvas"
          />
        </CrosshairCard>
      ) : (
        <CrosshairCard className="p-6 bg-[#080808] overflow-x-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 min-w-[880px]">
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
      )}
    </div>
  );
};
