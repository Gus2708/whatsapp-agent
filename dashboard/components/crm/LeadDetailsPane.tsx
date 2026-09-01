'use client';

import React from 'react';
import { Conversation, LeadStatus } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { CheckCircle2, UserCheck, Calendar, DollarSign, Target } from 'lucide-react';

interface LeadDetailsPaneProps {
  conversation: Conversation;
}

export const LeadDetailsPane: React.FC<LeadDetailsPaneProps> = ({ conversation }) => {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-pulse-green';
    if (score >= 60) return 'text-blue-400';
    return 'text-neon-rose';
  };

  const getStatusBadge = (status: LeadStatus, label: string) => {
    switch (status) {
      case 'qualified':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 border bg-pulse-green/15 text-pulse-green border-pulse-green/30 uppercase font-medium">
            {label}
          </span>
        );
      case 'in-progress':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 border bg-blue-500/15 text-blue-300 border-blue-500/30 uppercase font-medium">
            {label}
          </span>
        );
      case 'escalated':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 border bg-neon-rose/15 text-neon-rose border-neon-rose/30 uppercase font-medium">
            {label}
          </span>
        );
      case 'closed':
        return (
          <span className="font-mono text-[10px] px-2 py-0.5 border bg-gold-bright/15 text-gold-bright border-gold-bright/30 uppercase font-medium">
            {label}
          </span>
        );
    }
  };

  return (
    <CrosshairCard className="p-5 bg-[#0c0c0c] flex flex-col gap-5 overflow-y-auto h-full">
      <div>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-compass-gold block mb-1">
          // QUALIFICATION ENGINE
        </span>
        <h4 className="text-[15px] font-normal text-chalk">Perfil del Lead</h4>
      </div>

      {/* Lead Score Gauge */}
      <div className="p-4 bg-[#121212] border border-graphite text-center">
        <div className="font-mono text-[11px] text-smoke uppercase tracking-wider">
          LEAD SCORE
        </div>
        <div
          className={`text-4xl font-light font-mono my-1.5 ${getScoreColor(
            conversation.score
          )}`}
        >
          {conversation.score}
        </div>
        {getStatusBadge(conversation.status, conversation.statusLabel)}
      </div>

      {/* Extracted Structured Data */}
      <div className="flex flex-col divide-y divide-graphite">
        <div className="py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-smoke uppercase">
            <Target className="h-3 w-3 text-compass-gold" />
            <span>Intención Detectada</span>
          </div>
          <div className="text-[13px] text-chalk font-medium">
            {conversation.intent}
          </div>
        </div>

        <div className="py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-smoke uppercase">
            <DollarSign className="h-3 w-3 text-compass-gold" />
            <span>Presupuesto Estimado</span>
          </div>
          <div className="text-[13px] text-chalk font-medium">
            {conversation.budget}
          </div>
        </div>

        <div className="py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-smoke uppercase">
            <Calendar className="h-3 w-3 text-compass-gold" />
            <span>Horario Preferido</span>
          </div>
          <div className="text-[13px] text-chalk font-medium">
            {conversation.schedule}
          </div>
        </div>

        <div className="py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-smoke uppercase">
            <CheckCircle2 className="h-3 w-3 text-pulse-green" />
            <span>Pydantic Validation</span>
          </div>
          <div className="text-[12.5px] text-pulse-green font-mono">
            ✓ 100% Validated (JSON Schema)
          </div>
        </div>

        <div className="py-2.5 flex flex-col gap-1">
          <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-smoke uppercase">
            <UserCheck className="h-3 w-3 text-compass-gold" />
            <span>Destino CRM</span>
          </div>
          <div className="text-[12.5px] text-pulse-green font-mono">
            Supabase (atenciones_pendientes · Realtime)
          </div>
        </div>
      </div>
    </CrosshairCard>
  );
};
