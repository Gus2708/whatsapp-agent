'use client';

import React from 'react';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { ThinkingOrb } from '@/components/orbs/ThinkingOrb';
import { DEMO_ARCHITECTURE_PILLARS } from '@/lib/demoData';
import { useSound } from '@/components/audio/SoundProvider';
import {
  X,
  Sparkles,
  Zap,
  CheckCircle2,
  Cpu,
  Layers,
  GitBranch,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react';

interface RecruiterArchitectureGuideProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: 'flight' | 'crm' | 'rag' | 'n8n' | 'devops') => void;
}

export const RecruiterArchitectureGuide: React.FC<RecruiterArchitectureGuideProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
}) => {
  const { playClick, playSuccess } = useSound();

  if (!isOpen) return null;

  const pillarIcons = [Layers, GitBranch, Zap, ShieldCheck];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in pointer-events-auto">
      <div className="w-full max-w-4xl max-h-[92dvh] flex flex-col">
        <CrosshairCard className="p-3.5 sm:p-5 bg-[#0a0a0a] border border-compass-gold/60 shadow-[0_0_50px_rgba(212,175,55,0.2)] flex flex-col max-h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 sm:pb-3.5 border-b border-graphite/70 flex-shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center flex-shrink-0">
                <ThinkingOrb state="thinking_llm" size={20} showLabel={false} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9.5px] sm:text-[10px] uppercase tracking-wider text-gold-bright font-bold">
                    // RECRUITER & TECH LEAD BRIEFING
                  </span>
                  <span className="px-1.5 sm:px-2 py-0.5 bg-pulse-green/10 border border-pulse-green/40 text-pulse-green font-mono text-[10px] font-semibold">
                    ENTERPRISE ARCHITECTURE
                  </span>
                </div>
                <h2 className="text-sm sm:text-lg font-normal text-chalk tracking-tight">
                  Perucho Agent · Decisiones de Ingeniería & Telemetría
                </h2>
              </div>
            </div>
            <button
              onClick={() => {
                playClick();
                onClose();
              }}
              className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-smoke hover:text-chalk hover:bg-graphite/40 transition-colors cursor-pointer"
              aria-label="Cerrar modal de guía"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body Content - Scrollable */}
          <div className="flex-1 overflow-y-auto py-3 sm:py-4 pr-1 flex flex-col gap-3 sm:gap-4 font-mono">
            {/* Quick Summary Banner */}
            <div className="p-2.5 sm:p-3 bg-[#111111] border border-graphite/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Cpu className="h-4 w-4 text-pulse-green flex-shrink-0" />
                <span className="text-chalk leading-relaxed text-[11px] sm:text-xs">
                  Sistema de IA conversacional y CRM operativo diseñado para alta concurrencia, tolerancia a fallos eléctricos y cero alucinaciones en catálogos extensos.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => {
                    playSuccess();
                    onNavigateTab('rag');
                    onClose();
                  }}
                  className="px-2.5 py-1.5 sm:py-1 bg-compass-gold/15 border border-compass-gold/40 hover:border-compass-gold text-gold-bright text-[10px] sm:text-[10.5px] uppercase font-semibold transition-colors cursor-pointer min-h-[36px] sm:min-h-0"
                >
                  Probar RAG Studio →
                </button>
                <button
                  onClick={() => {
                    playSuccess();
                    onNavigateTab('n8n');
                    onClose();
                  }}
                  className="px-2.5 py-1.5 sm:py-1 bg-pulse-green/15 border border-pulse-green/40 hover:border-pulse-green text-pulse-green text-[10px] sm:text-[10.5px] uppercase font-semibold transition-colors cursor-pointer min-h-[36px] sm:min-h-0"
                >
                  Ver 33 Nodos n8n →
                </button>
              </div>
            </div>

            {/* 4 Pillars Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
              {DEMO_ARCHITECTURE_PILLARS.map((pillar, idx) => {
                const Icon = pillarIcons[idx % pillarIcons.length];
                return (
                  <div
                    key={pillar.title}
                    className="p-3 sm:p-3.5 bg-[#0e0e0e] border border-graphite/90 hover:border-ash transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-gold-bright flex-shrink-0" />
                          <span className="text-[11.5px] sm:text-[12px] font-semibold text-chalk tracking-wide">
                            {pillar.title}
                          </span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 bg-pulse-green/10 border border-pulse-green/30 text-pulse-green font-medium">
                          {pillar.badge}
                        </span>
                      </div>

                      <div className="text-[10.5px] sm:text-[11px] text-pulse-green font-medium mb-1">
                        {pillar.value}
                      </div>

                      <p className="text-[9.5px] sm:text-[10px] text-smoke leading-relaxed mb-2.5">
                        {pillar.description}
                      </p>

                      {/* Technical breakdown list */}
                      <ul className="flex flex-col gap-1 text-[9px] sm:text-[9.5px] text-chalk/80 border-t border-graphite/40 pt-2">
                        {pillar.technicalDetails.map((detail, dIdx) => (
                          <li key={dIdx} className="flex items-start gap-1.5 leading-snug">
                            <span className="text-gold-bright flex-shrink-0">›</span>
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Interactive Benchmark Matrix */}
            <div className="p-2.5 sm:p-3 bg-[#080808] border border-graphite">
              <div className="text-[9.5px] sm:text-[10px] text-gold-bright uppercase tracking-wider mb-2 flex items-center justify-between font-medium">
                <span>// BENCHMARK TÉCNICO: PIPELINE HÍBRIDO VS LLM TRADICIONAL</span>
                <span className="text-smoke">Muestra de 1.000 consultas</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px]">
                <div className="p-2 bg-[#121212] border border-graphite/60 flex flex-col gap-0.5">
                  <span className="text-smoke uppercase text-[10px]">Latencia Mediana (p50)</span>
                  <span className="text-pulse-green font-bold text-xs">14ms (AST Match)</span>
                  <span className="text-smoke text-[9.5px]">vs ~1.800ms llamada LLM</span>
                </div>
                <div className="p-2 bg-[#121212] border border-graphite/60 flex flex-col gap-0.5">
                  <span className="text-smoke uppercase text-[10px]">Tasa de Alucinación</span>
                  <span className="text-pulse-green font-bold text-xs">0.00% en Precios</span>
                  <span className="text-smoke text-[9.5px]">vs 8.4% en RAG simple</span>
                </div>
                <div className="p-2 bg-[#121212] border border-graphite/60 flex flex-col gap-0.5">
                  <span className="text-smoke uppercase text-[10px]">Consumo de Tokens</span>
                  <span className="text-pulse-green font-bold text-xs">80.6% Token Zero</span>
                  <span className="text-smoke text-[9.5px]">Resuelto antes de capa 5</span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Navigation CTA */}
          <div className="pt-2.5 sm:pt-3 border-t border-graphite/70 flex items-center justify-between font-mono text-[9.5px] sm:text-[10px] flex-shrink-0">
            <span className="text-smoke">Modo Sandbox Activo</span>
            <button
              onClick={() => {
                playClick();
                onClose();
              }}
              className="px-3 py-1.5 sm:py-1 bg-graphite/50 hover:bg-graphite text-chalk transition-colors cursor-pointer border border-ash/40 min-h-[36px] sm:min-h-0 flex items-center"
            >
              [ Cerrar Guía ]
            </button>
          </div>
        </CrosshairCard>
      </div>
    </div>
  );
};
