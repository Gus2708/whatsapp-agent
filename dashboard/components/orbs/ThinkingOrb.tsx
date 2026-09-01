'use client';

import React from 'react';
import { ThinkingOrb as OfficialOrb, OrbState as OfficialOrbState } from 'thinking-orbs';
import { OrbState } from '@/lib/types';

interface ThinkingOrbProps {
  state?: OrbState;
  currentScanningLayer?: 1 | 2 | 3 | 4 | 5 | null;
  size?: 64 | 20;
  label?: string;
  className?: string;
}

export const ThinkingOrb: React.FC<ThinkingOrbProps> = ({
  state = 'idle',
  currentScanningLayer = null,
  size = 64,
  label,
  className = '',
}) => {
  let officialState: OfficialOrbState = 'breathing';

  if (state === 'searching_rag' && !currentScanningLayer) {
    officialState = 'searching';
  } else if (currentScanningLayer === 1) {
    officialState = 'working';
  } else if (currentScanningLayer === 2) {
    officialState = 'composing';
  } else if (currentScanningLayer === 3) {
    officialState = 'connecting';
  } else if (currentScanningLayer === 4) {
    officialState = 'weaving';
  } else if (currentScanningLayer === 5 || state === 'thinking_llm') {
    officialState = 'solving';
  } else if (state === 'dispatched') {
    officialState = 'shaping';
  } else if (state === 'error') {
    officialState = 'listening';
  }

  const layerLabels: Record<number, string> = {
    1: 'CAPA 1: PARSER DETERMINÍSTICO (AST)',
    2: 'CAPA 2: DICCIONARIO & JERGA REGIONAL',
    3: 'CAPA 3: SIMILITUD TRIGRAMAS (PG_TRGM)',
    4: 'CAPA 4: EMBEDDINGS HNSW (PGVECTOR)',
    5: 'CAPA 5: RESCATE SEMÁNTICO (SONNET 5)',
  };

  const stateLabels: Record<OrbState, string> = {
    idle: 'COGNITIVE ENGINE IDLE',
    searching_rag: 'INICIALIZANDO MOTOR RAG (7.650 SKUs)...',
    thinking_llm: 'SONNET 5 REASONING...',
    dispatched: 'MATCH ENCONTRADO EN BASE DE DATOS',
    error: 'ERROR EN CONSULTA',
  };

  const currentLabel = currentScanningLayer
    ? layerLabels[currentScanningLayer]
    : label || stateLabels[state];

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {/* Frameless, clean orb presentation */}
      <div className="relative flex items-center justify-center my-1">
        {/* Very subtle ambient glow */}
        <div
          className={`absolute inset-0 pointer-events-none rounded-full opacity-[0.06] blur-2xl transition-all duration-500 scale-150 ${
            currentScanningLayer === 1
              ? 'bg-pulse-green'
              : currentScanningLayer === 2
              ? 'bg-amber-400'
              : currentScanningLayer === 3
              ? 'bg-cyan-400'
              : currentScanningLayer === 4
              ? 'bg-purple-500'
              : currentScanningLayer === 5
              ? 'bg-neon-rose'
              : state === 'searching_rag'
              ? 'bg-cyan-300'
              : 'bg-compass-gold'
          }`}
        />

        {/* Official ThinkingOrb Canvas from Jakub Antalik */}
        <div className="relative z-10 scale-125">
          <OfficialOrb state={officialState} size={size} theme="dark" speed={1.1} />
        </div>
      </div>

      {/* State & Layer Label */}
      <div className="mt-3 text-center max-w-[280px]">
        <div className="font-mono text-[10px] text-smoke uppercase tracking-wider mb-0.5">
          STATE: <span className="text-chalk font-semibold">{officialState}</span>
        </div>
        <span
          className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${
            currentScanningLayer === 1
              ? 'text-pulse-green'
              : currentScanningLayer === 2
              ? 'text-amber-400'
              : currentScanningLayer === 3
              ? 'text-cyan-400'
              : currentScanningLayer === 4
              ? 'text-purple-400'
              : currentScanningLayer === 5
              ? 'text-neon-rose'
              : state === 'searching_rag'
              ? 'text-cyan-300'
              : 'text-compass-gold'
          }`}
        >
          {currentScanningLayer ? `[L0${currentScanningLayer}] ` : ''}
          {currentLabel}
        </span>
      </div>
    </div>
  );
};
