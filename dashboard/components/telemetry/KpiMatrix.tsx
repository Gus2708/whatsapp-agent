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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3.5 mb-1 sm:mb-2 flex-shrink-0 p-0.5 sm:p-1">
      {/* KPI 1 */}
      <CrosshairCard className="p-2.5 sm:p-3.5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[9.5px] sm:text-[10.5px] uppercase text-smoke mb-1">
          <span className="truncate">Leads Atendidos</span>
          <MotionUserIcon />
        </div>
        <div className="text-xl sm:text-2xl font-light tracking-tight text-chalk">191</div>
        <div className="font-mono text-[8.5px] sm:text-[10px] text-pulse-green mt-0.5 truncate">
          80.6% Res. Autónoma
        </div>
      </CrosshairCard>

      {/* KPI 2 */}
      <CrosshairCard className="p-2.5 sm:p-3.5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[9.5px] sm:text-[10.5px] uppercase text-smoke mb-1">
          <span className="truncate">Exact Recall</span>
          <MotionTargetIcon />
        </div>
        <div className="text-xl sm:text-2xl font-light tracking-tight text-chalk">76.9%</div>
        <div className="font-mono text-[8.5px] sm:text-[10px] text-pulse-green mt-0.5 truncate">
          +2.2 pts vs sin vector
        </div>
      </CrosshairCard>

      {/* KPI 3 */}
      <CrosshairCard className="p-2.5 sm:p-3.5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[9.5px] sm:text-[10.5px] uppercase text-smoke mb-1">
          <span className="truncate">SNR Ratio</span>
          <MotionSignalIcon />
        </div>
        <div className="text-xl sm:text-2xl font-light tracking-tight text-chalk">0.123</div>
        <div className="font-mono text-[8.5px] sm:text-[10px] text-pulse-green mt-0.5 truncate">
          10x gain vs baseline
        </div>
      </CrosshairCard>

      {/* KPI 4 */}
      <CrosshairCard className="p-2.5 sm:p-3.5 bg-[#0d0d0d]">
        <div className="flex justify-between items-center font-mono text-[9.5px] sm:text-[10.5px] uppercase text-smoke mb-1">
          <span className="truncate">Costo Inferencia</span>
          <MotionCostIcon />
        </div>
        <div className="text-xl sm:text-2xl font-light tracking-tight text-chalk">$0.00008</div>
        <div className="font-mono text-[8.5px] sm:text-[10px] text-pulse-green mt-0.5 truncate">
          Capa 1 a $0
        </div>
      </CrosshairCard>
    </div>
  );
};
