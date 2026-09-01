'use client';

import React from 'react';
import {
  BarChart3,
  MessagesSquare,
  Terminal,
  Network,
  Wrench,
  Users,
  Target,
  Radio,
  Coins,
  Zap,
} from 'lucide-react';

export const MotionFlightIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
    <BarChart3 className={`${className} transition-transform duration-200 group-hover:-translate-y-0.5`} />
  </span>
);

export const MotionCrmIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
    <MessagesSquare className={`${className} transition-transform duration-200 group-hover:rotate-6`} />
  </span>
);

export const MotionRagIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
    <Terminal className={`${className} transition-transform duration-200 group-hover:translate-x-0.5`} />
  </span>
);

export const MotionN8nIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
    <Network className={`${className} transition-transform duration-300 group-hover:rotate-45`} />
  </span>
);

export const MotionDevOpsIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-transform duration-200 group-hover:scale-110">
    <Wrench className={`${className} transition-transform duration-200 group-hover:-rotate-12`} />
  </span>
);

export const MotionUserIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-all duration-200 text-smoke hover:text-pulse-green hover:scale-110">
    <Users className={`${className} transition-transform duration-200`} />
  </span>
);

export const MotionTargetIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-all duration-200 text-smoke hover:text-pulse-green hover:scale-110">
    <Target className={`${className} transition-transform duration-300 hover:rotate-90`} />
  </span>
);

export const MotionSignalIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-all duration-200 text-smoke hover:text-pulse-green hover:scale-110">
    <Radio className={`${className} transition-transform duration-200 animate-pulse`} />
  </span>
);

export const MotionCostIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <span className="inline-flex items-center justify-center transition-all duration-200 text-smoke hover:text-gold-bright hover:scale-110">
    <Coins className={`${className} transition-transform duration-300 hover:-rotate-12`} />
  </span>
);

export const MotionZapIcon: React.FC<{ className?: string }> = ({ className = 'h-3.5 w-3.5' }) => (
  <span className="inline-flex items-center justify-center text-pulse-green">
    <Zap className={`${className} transition-transform duration-150 hover:scale-125`} />
  </span>
);
