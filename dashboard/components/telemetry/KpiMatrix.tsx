'use client';

import React from 'react';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import {
  MotionUserIcon,
  MotionTargetIcon,
  MotionSignalIcon,
  MotionCostIcon,
} from '@/components/icons/MotionIcons';

export const KpiMatrix: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* KPI 1 */}
      <CrosshairCard className="p-5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[11px] uppercase text-smoke mb-1.5">
          <span>Leads Atendidos</span>
          <MotionUserIcon />
        </div>
        <div className="text-3xl font-light tracking-tight text-chalk">191</div>
        <div className="font-mono text-[11px] text-pulse-green mt-1">
          80.6% Resolución Autónoma
        </div>
      </CrosshairCard>

      {/* KPI 2 */}
      <CrosshairCard className="p-5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[11px] uppercase text-smoke mb-1.5">
          <span>Exact Recall (320 Evals)</span>
          <MotionTargetIcon />
        </div>
        <div className="text-3xl font-light tracking-tight text-chalk">76.9%</div>
        <div className="font-mono text-[11px] text-pulse-green mt-1">
          +4.7% sobre vector puro
        </div>
      </CrosshairCard>

      {/* KPI 3 */}
      <CrosshairCard className="p-5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[11px] uppercase text-smoke mb-1.5">
          <span>Signal / Noise Ratio</span>
          <MotionSignalIcon />
        </div>
        <div className="text-3xl font-light tracking-tight text-chalk">0.123</div>
        <div className="font-mono text-[11px] text-pulse-green mt-1">
          Elevado desde 0.012 (10x gain)
        </div>
      </CrosshairCard>

      {/* KPI 4 */}
      <CrosshairCard className="p-5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[11px] uppercase text-smoke mb-1.5">
          <span>Costo Promedio Inferencia</span>
          <MotionCostIcon />
        </div>
        <div className="text-3xl font-light tracking-tight text-chalk">$0.00008</div>
        <div className="font-mono text-[11px] text-pulse-green mt-1">
          70% resuelto en Capa 1 a $0
        </div>
      </CrosshairCard>
    </div>
  );
};
