'use client';

import React, { useState } from 'react';
import { RagResult, OrbState } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { ThinkingOrb } from '@/components/orbs/ThinkingOrb';
import { useSound } from '@/components/audio/SoundProvider';
import { Database, Send } from 'lucide-react';

interface HistoryItem {
  id: string;
  query: string;
  status: 'loading' | 'done' | 'error';
  result?: RagResult;
}

export const RagStudio: React.FC = () => {
  const [query, setQuery] = useState('');
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [activeLayer, setActiveLayer] = useState<number | null>(null);
  const [currentLayer, setCurrentLayer] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [evaluatedLayers, setEvaluatedLayers] = useState<number[]>([]);
  const [result, setResult] = useState<RagResult | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { playClick, playPacket, playSuccess } = useSound();

  const sampleQueries = [
    { text: 'Tornillo drywall 1/2 x 100u', layer: 1, desc: 'Capa 1: AST' },
    { text: 'Pega loca super bonder', layer: 2, desc: 'Capa 2: Jerga' },
    { text: 'Algo para tapar gotera techo', layer: 4, desc: 'Capa 4: pgvector' },
    { text: 'Cemento gris para hoy', layer: 1, desc: 'Capa 1: Supabase' },
  ];

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const handleRunQuery = async (queryText: string) => {
    if (!queryText.trim() || isLoading) return;
    playClick();

    const cleanQuery = queryText.trim();
    setQuery('');
    setIsLoading(true);
    setOrbState('searching_rag');
    setActiveLayer(null);
    setCurrentLayer(null);
    setEvaluatedLayers([]);
    setResult(null);

    const itemId = `hist-${Date.now()}`;
    const initialItem: HistoryItem = {
      id: itemId,
      query: cleanQuery,
      status: 'loading',
    };
    setHistoryItems((prev) => [initialItem, ...prev]);

    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQuery }),
      });
      const data: RagResult = await res.json();
      const targetLayer = data.hitLayer;

      await sleep(120);

      const evalHistory: number[] = [];
      for (let l = 1; l <= targetLayer; l++) {
        const stepLayer = l as 1 | 2 | 3 | 4 | 5;
        setCurrentLayer(stepLayer);
        playPacket();

        if (l < targetLayer) {
          await sleep(220);
          evalHistory.push(l);
          setEvaluatedLayers([...evalHistory]);
        }
      }

      setActiveLayer(targetLayer);
      setCurrentLayer(targetLayer);
      setOrbState(targetLayer === 5 ? 'thinking_llm' : 'dispatched');
      setResult(data);
      playSuccess();

      setHistoryItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, status: 'done', result: data } : item
        )
      );
    } catch {
      setOrbState('alert');
      setHistoryItems((prev) =>
        prev.map((item) => (item.id === itemId ? { ...item, status: 'error' } : item))
      );
    } finally {
      setIsLoading(false);
    }
  };

  const getLayerCardStyle = (layerNum: number) => {
    if (currentLayer === layerNum && activeLayer !== layerNum) {
      return 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_14px_rgba(34,211,238,0.3)] scale-[1.01]';
    }

    if (activeLayer === layerNum) {
      if (layerNum === 1) return 'border-pulse-green bg-pulse-green/20 shadow-[0_0_16px_rgba(152,255,56,0.25)] scale-[1.01] font-semibold';
      if (layerNum === 2) return 'border-amber-400 bg-amber-400/20 shadow-[0_0_16px_rgba(251,191,36,0.25)] scale-[1.01] font-semibold';
      if (layerNum === 3) return 'border-cyan-400 bg-cyan-400/20 shadow-[0_0_16px_rgba(56,189,248,0.25)] scale-[1.01] font-semibold';
      if (layerNum === 4) return 'border-purple-400 bg-purple-400/20 shadow-[0_0_16px_rgba(168,85,247,0.25)] scale-[1.01] font-semibold';
      if (layerNum === 5) return 'border-neon-rose bg-neon-rose/20 shadow-[0_0_16px_rgba(244,63,94,0.25)] scale-[1.01] font-semibold';
    }

    if (evaluatedLayers.includes(layerNum)) {
      return 'border-graphite bg-[#121212] opacity-60';
    }

    if (activeLayer !== null && layerNum > activeLayer) {
      return 'border-graphite bg-[#080808] opacity-25 border-dashed';
    }

    return 'border-graphite bg-[#0d0d0d]';
  };

  return (
    <div className="flex flex-col h-full max-h-full min-h-0 justify-between overflow-hidden gap-2.5">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-2 flex-shrink-0">
        <div>
          <span className="font-mono text-[10px] text-compass-gold uppercase tracking-wider block mb-0.5">
            // CLI TUI STUDIO & RETRIEVAL LAB · LIVE DATABASE CONNECTED
          </span>
          <h2 className="text-xl font-normal text-chalk tracking-tight">
            Pruebas de Búsqueda Híbrida & SNR (7.650 SKUs)
          </h2>
        </div>
        <div className="flex items-center gap-2 bg-[#121212] border border-graphite px-2.5 py-1 font-mono text-[11px] text-pulse-green">
          <Database className="h-3 w-3" />
          <span>SUPABASE PGVECTOR LIVE</span>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 flex-1 min-h-0 overflow-hidden">
        {/* Left: Terminal Console */}
        <CrosshairCard className="lg:col-span-7 p-4 bg-[#050505] flex flex-col justify-between h-full max-h-full min-h-0 flex-1">
          <div className="flex flex-col justify-between h-full min-h-0">
            <div>
              {/* HUD Blueprint Terminal Banner */}
              <div className="border border-compass-gold/30 bg-compass-gold/[0.03] p-2.5 mb-2.5 select-none font-mono">
                <div className="flex items-center justify-between text-xs text-compass-gold font-semibold tracking-wide">
                  <span>PERUCHO HYBRID RETRIEVAL BENCHMARK v2.4</span>
                  <span className="text-[10px] text-smoke font-normal">7,650 SKUs</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10.5px] text-smoke mt-0.5">
                  <span>Exact Recall: <span className="text-pulse-green font-medium">76.9%</span></span>
                  <span>·</span>
                  <span>SNR: <span className="text-pulse-green font-medium">0.123</span></span>
                  <span>·</span>
                  <span>Postgres HNSW Cosine Index</span>
                </div>
              </div>

              {/* Quick Sample Chips */}
              <div className="mb-2">
                <span className="font-mono text-[10px] text-compass-gold uppercase block mb-1">
                  Consultas recomendadas:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {sampleQueries.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleRunQuery(s.text)}
                      disabled={isLoading}
                      className="font-mono text-[11px] border border-graphite bg-[#111111] px-2.5 py-1 text-smoke hover:text-chalk hover:border-ash hover:bg-white/[0.04] transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <span className="text-chalk">{s.text}</span>
                      <span className="text-[9.5px] text-compass-gold">({s.desc})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* History Output Stream */}
            <div className="flex-1 p-2.5 bg-[#080808] border border-graphite overflow-y-auto font-mono text-xs space-y-2 min-h-0 my-2">
              {historyItems.length > 0 ? (
                historyItems.map((item) => (
                  <div key={item.id} className="space-y-0.5">
                    <div className="text-pulse-green font-semibold text-[11.5px]">
                      perucho@rag:~$ {item.query}
                    </div>
                    {item.status === 'loading' ? (
                      <div className="text-cyan-400 animate-pulse pl-2 text-[11px]">
                        ⎿ [SYSTEM] Inicializando pipeline y evaluando en Supabase...
                      </div>
                    ) : item.status === 'error' ? (
                      <div className="text-neon-rose pl-2 text-[11px]">
                        ⎿ [ERROR] No se pudo completar la consulta en Supabase.
                      </div>
                    ) : item.result ? (
                      <div className="text-[#e4e4e7] pl-2 space-y-0.5 text-[11.5px]">
                        <div>
                          ↳ <span className="text-compass-gold">[CAPA 0{item.result.hitLayer}]</span>{' '}
                          <span className="font-semibold">{item.result.productName}</span>
                        </div>
                        <div className="text-smoke text-[10.5px]">
                          Precio: <span className="text-pulse-green">{item.result.price}</span> · Latencia:{' '}
                          <span className="text-cyan-300">{item.result.latencyMs}ms</span> · Costo:{' '}
                          <span className="text-gold-bright">{item.result.costEstimate}</span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="text-smoke text-center py-4 text-[11.5px]">
                  [SYSTEM] Selecciona una consulta rápida o escribe en el prompt inferior.
                </div>
              )}
            </div>

            {/* Input Prompt */}
            <div className="flex items-center gap-2 bg-[#0f0f0f] border border-graphite p-2 flex-shrink-0">
              <span className="font-mono text-xs font-semibold text-pulse-green pl-1">
                perucho@rag:~$
              </span>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleRunQuery(query)}
                disabled={isLoading}
                placeholder={isLoading ? 'Evaluando consulta...' : 'Escribir consulta técnica para evaluar cascada en vivo...'}
                className="flex-1 bg-transparent border-none text-chalk font-mono text-xs outline-none disabled:opacity-50"
              />
              <button
                onClick={() => handleRunQuery(query)}
                disabled={isLoading}
                className="bg-signal-white text-obsidian px-3 py-1 font-mono text-xs font-semibold uppercase flex items-center gap-1 hover:bg-[#e4e4e7] transition-colors cursor-pointer disabled:opacity-50"
              >
                <span>{isLoading ? '...' : 'Evaluar'}</span>
                <Send className="h-3 w-3" />
              </button>
            </div>
          </div>
        </CrosshairCard>

        {/* Right: Live Layer Scanning Thinking Orb & 5-Layer Waterfall */}
        <CrosshairCard className="lg:col-span-5 p-4 bg-[#0c0c0c] flex flex-col justify-between h-full max-h-full min-h-0 flex-1">
          <div className="flex flex-col justify-between h-full min-h-0 gap-2.5">
            {/* Header with inline Orb state */}
            <div className="flex items-center justify-between pb-2 border-b border-graphite/60 flex-shrink-0">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-compass-gold block mb-0.5">
                  // CASCADE WATERFALL TELEMETRY
                </span>
                <h3 className="text-[15px] font-normal text-chalk">
                  Resolución por Capas en Tiempo Real
                </h3>
              </div>
              <div className="scale-75 origin-right">
                <ThinkingOrb state={orbState} currentScanningLayer={currentLayer} size={64} showLabel={false} />
              </div>
            </div>

            {/* 5-Layer Cascade Waterfall */}
            <div className="space-y-1.5 flex-1 flex flex-col justify-between min-h-0">
              {[
                { num: 1, name: 'Parser Determinístico (Medidas)', lat: '< 8 ms', cost: '$0.0000' },
                { num: 2, name: 'Diccionario Local & Jerga', lat: '< 15 ms', cost: '$0.0000' },
                { num: 3, name: 'Búsqueda Trigramas pg_trgm', lat: '< 45 ms', cost: '$0.0000' },
                { num: 4, name: 'Vector Embeddings (pgvector)', lat: '< 120 ms', cost: '$0.00002' },
                { num: 5, name: 'Rescate LLM + Guardrails', lat: '~ 850 ms', cost: '$0.00035' },
              ].map((layer) => {
                const isEvaluatedMiss = evaluatedLayers.includes(layer.num);
                const isResolvedHit = activeLayer === layer.num;
                const isBypassed = activeLayer !== null && layer.num > activeLayer;

                return (
                  <div
                    key={layer.num}
                    className={`p-2 border transition-all duration-200 flex justify-between items-center ${getLayerCardStyle(
                      layer.num
                    )}`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-mono text-[9px] text-compass-gold">
                        <span>CAPA 0{layer.num}</span>
                        {isResolvedHit && (
                          <span className="text-pulse-green font-bold">[MATCH ENCONTRADO]</span>
                        )}
                        {isEvaluatedMiss && (
                          <span className="text-smoke">[NO COINCIDE]</span>
                        )}
                        {isBypassed && (
                          <span className="text-smoke/60">[BYPASS PREVIO]</span>
                        )}
                      </div>
                      <div className="text-[12px] font-medium text-chalk">
                        {layer.name}
                      </div>
                    </div>
                    <div className="text-right font-mono text-[10px] text-smoke">
                      {layer.lat} · {layer.cost}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Evaluated Result Preview */}
            <div className="p-2.5 bg-[#080808] border border-graphite font-mono text-xs flex-shrink-0">
              <div className="text-compass-gold mb-0.5 uppercase text-[9.5px]">
                RESULTADO EVALUADO EN VIVO:
              </div>
              {result ? (
                <div>
                  <div className="text-chalk font-semibold text-[12px]">{result.productName}</div>
                  <div className="text-pulse-green text-[10.5px] mt-0.5 font-medium">
                    Precio: {result.price}
                  </div>
                  <div className="text-smoke text-[9.5px] mt-0.5">
                    Frenó en Capa 0{result.hitLayer} ({result.method}) · {result.latencyMs}ms
                  </div>
                </div>
              ) : isLoading ? (
                <div className="text-cyan-300 animate-pulse flex items-center gap-1.5 text-[11px]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                  <span>Evaluando cascada RAG...</span>
                </div>
              ) : (
                <div className="text-smoke text-[11px]">Esperando ejecución de consulta...</div>
              )}
            </div>
          </div>
        </CrosshairCard>
      </div>
    </div>
  );
};
