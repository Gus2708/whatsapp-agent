'use client';

import React from 'react';
import { Conversation } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { getScoreStroke, getScoreTone, getStatusTone } from '@/lib/crm-ui';
import {
  Calendar,
  CheckCircle2,
  DollarSign,
  Target,
  UserCheck,
  X,
} from 'lucide-react';

interface LeadDetailsPaneProps {
  conversation: Conversation;
  /** Provided only when the pane is rendered as a dismissible sheet. */
  onClose?: () => void;
}

const GAUGE_RADIUS = 42;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

interface LeadFactProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}

const LeadFact: React.FC<LeadFactProps> = ({ icon, label, value, valueClassName }) => (
  <div className="flex flex-col gap-1 py-2.5">
    <div className="flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-wider text-smoke">
      {icon}
      <span>{label}</span>
    </div>
    <div className={valueClassName ?? 'break-words text-[13px] font-medium text-chalk'}>
      {value}
    </div>
  </div>
);

export const LeadDetailsPane: React.FC<LeadDetailsPaneProps> = ({
  conversation,
  onClose,
}) => {
  const tone = getStatusTone(conversation.status);
  const score = Math.max(0, Math.min(100, conversation.score));
  const dashOffset = GAUGE_CIRCUMFERENCE * (1 - score / 100);

  return (
    <CrosshairCard className="flex h-full max-h-full min-h-0 flex-1 flex-col bg-[#0c0c0c]">
      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between gap-2 border-b border-graphite bg-[#0e0e0e] px-4 py-3">
        <div>
          <span className="mb-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-gold-bright">
            // Qualification engine
          </span>
          <h4 className="text-[15px] font-normal leading-tight text-chalk">
            Perfil del Lead
          </h4>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar perfil del lead"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-graphite bg-[#141414] text-smoke transition-colors hover:border-ash hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {/* Score gauge */}
        <div className="flex items-center gap-4 border border-graphite bg-[#121212] p-4">
          <div
            className="relative h-[92px] w-[92px] flex-shrink-0"
            role="img"
            aria-label={`Lead score ${score} de 100. Estado: ${conversation.statusLabel}`}
          >
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle
                cx="50"
                cy="50"
                r={GAUGE_RADIUS}
                fill="none"
                stroke="var(--color-graphite)"
                strokeWidth="6"
              />
              <circle
                cx="50"
                cy="50"
                r={GAUGE_RADIUS}
                fill="none"
                stroke={getScoreStroke(score)}
                strokeWidth="6"
                strokeLinecap="butt"
                strokeDasharray={GAUGE_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className="transition-[stroke-dashoffset] duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`font-mono text-[26px] font-light leading-none tabular-nums ${getScoreTone(score)}`}
              >
                {score}
              </span>
              <span className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-smoke">
                Score
              </span>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <span
              className={`inline-flex w-fit items-center gap-1.5 border px-2 py-1 font-mono text-[10px] font-medium uppercase tracking-wide ${tone.badge}`}
            >
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${tone.dot}`} aria-hidden="true" />
              <span className="break-words">{conversation.statusLabel}</span>
            </span>
            <p className="font-mono text-[10.5px] leading-relaxed text-smoke">
              Calificación automática derivada de intención, presupuesto y urgencia
              detectados en el hilo.
            </p>
          </div>
        </div>

        {/* Extracted structured data */}
        <div className="mt-3 flex flex-col divide-y divide-graphite">
          <LeadFact
            icon={<Target className="h-3.5 w-3.5 text-gold-bright" aria-hidden="true" />}
            label="Intención detectada"
            value={conversation.intent}
          />
          <LeadFact
            icon={<DollarSign className="h-3.5 w-3.5 text-gold-bright" aria-hidden="true" />}
            label="Presupuesto estimado"
            value={conversation.budget}
            valueClassName="break-words font-mono text-[14px] font-medium tabular-nums text-chalk"
          />
          <LeadFact
            icon={<Calendar className="h-3.5 w-3.5 text-gold-bright" aria-hidden="true" />}
            label="Horario preferido"
            value={conversation.schedule}
          />
          <LeadFact
            icon={<CheckCircle2 className="h-3.5 w-3.5 text-pulse-green" aria-hidden="true" />}
            label="Validación de esquema"
            value="100% validado (JSON Schema)"
            valueClassName="break-words font-mono text-[12.5px] text-pulse-green"
          />
          <LeadFact
            icon={<UserCheck className="h-3.5 w-3.5 text-gold-bright" aria-hidden="true" />}
            label="Destino CRM"
            value="Supabase · atenciones_pendientes (Realtime)"
            valueClassName="break-words font-mono text-[12.5px] text-pulse-green"
          />
        </div>
      </div>
    </CrosshairCard>
  );
};
