'use client';

import React, { useMemo } from 'react';
import { Conversation, LeadStatus } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { getInitials, getScoreTone, getStatusTone } from '@/lib/crm-ui';
import { BellOff, Inbox, Search, X } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
}

const FILTERS: { id: string; label: string; status?: LeadStatus }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'qualified', label: 'Calificados', status: 'qualified' },
  { id: 'in-progress', label: 'En curso', status: 'in-progress' },
  { id: 'escalated', label: 'Escalados', status: 'escalated' },
  { id: 'closed', label: 'Cerrados', status: 'closed' },
];

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
}) => {
  const counts = useMemo(() => {
    const base: Record<string, number> = { all: conversations.length };
    for (const f of FILTERS) {
      if (!f.status) continue;
      base[f.id] = conversations.filter((c) => c.status === f.status).length;
    }
    return base;
  }, [conversations]);

  const filtered = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return conversations.filter((c) => {
      const matchesFilter = filter === 'all' || c.status === filter;
      const matchesSearch =
        query.length === 0 ||
        c.name.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  }, [conversations, filter, searchQuery]);

  return (
    <CrosshairCard className="flex h-full max-h-full min-h-0 flex-1 flex-col bg-[#0c0c0c]">
      {/* Pane title + inbox counter */}
      <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-graphite bg-[#0e0e0e] px-3 py-2.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold-bright">
          {'//'} Inbox
        </span>
        <span className="font-mono text-[10px] tabular-nums text-smoke">
          {filtered.length}/{conversations.length}
        </span>
      </div>

      {/* Search */}
      <div className="flex-shrink-0 border-b border-graphite bg-[#0e0e0e] px-3 py-2.5">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-3 h-4 w-4 text-smoke"
            aria-hidden="true"
          />
          <input
            id="crm-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar lead..."
            aria-label="Buscar conversaciones por nombre o teléfono"
            className="h-11 w-full border border-graphite bg-[#141414] pl-9 pr-10 font-mono text-base text-chalk outline-none transition-colors placeholder:text-smoke focus:border-compass-gold focus:ring-1 focus:ring-compass-gold/50 md:h-9 md:text-xs"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-1 flex h-9 w-9 items-center justify-center text-smoke transition-colors hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Status filters */}
      <div
        role="group"
        aria-label="Filtrar por estado del lead"
        className="scroll-fade-x flex flex-shrink-0 gap-1.5 overflow-x-auto border-b border-graphite bg-[#0a0a0a] px-3 py-2"
      >
        {FILTERS.map((btn) => {
          const isActive = filter === btn.id;
          const count = counts[btn.id] ?? 0;
          return (
            <button
              key={btn.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onFilterChange(btn.id)}
              className={`flex min-h-[36px] flex-shrink-0 items-center gap-1.5 whitespace-nowrap border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-compass-gold ${
                isActive
                  ? 'border-gold-bright/60 bg-gold-bright/15 font-semibold text-gold-bright'
                  : 'border-graphite bg-[#161616] text-smoke hover:border-ash hover:text-chalk'
              }`}
            >
              <span>{btn.label}</span>
              <span className={`tabular-nums ${isActive ? 'text-gold-bright' : 'text-smoke'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Conversations */}
      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
          <Inbox className="h-8 w-8 text-iron" aria-hidden="true" />
          <p className="text-sm text-chalk">Sin conversaciones</p>
          <p className="max-w-[26ch] font-mono text-xs leading-relaxed text-smoke">
            Ningún lead coincide con la búsqueda o el filtro activo.
          </p>
          {(searchQuery.length > 0 || filter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                onSearchChange('');
                onFilterChange('all');
              }}
              className="min-h-[36px] border border-graphite bg-[#161616] px-3 font-mono text-[11px] uppercase tracking-wider text-chalk transition-colors hover:border-compass-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtered.map((c) => {
            const isSelected = c.id === selectedId;
            const lastMsg = c.messages[c.messages.length - 1];
            const tone = getStatusTone(c.status);
            return (
              <li key={c.id} className="border-b border-graphite/40 last:border-b-0">
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`flex w-full items-start gap-3 py-3 pr-3 text-left transition-colors focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-compass-gold ${
                    isSelected
                      ? 'border-l-2 border-l-gold-bright bg-[#181818] pl-[10px]'
                      : 'border-l-2 border-l-transparent pl-[10px] hover:bg-[#141414]'
                  }`}
                >
                  {/* Avatar monogram, ringed by lead status */}
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 flex-shrink-0 items-center justify-center bg-[#151515] font-mono text-[13px] font-semibold uppercase text-chalk ring-1 ${tone.ring}`}
                  >
                    {getInitials(c.name)}
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13.5px] font-medium text-chalk" title={c.name}>
                        {c.name}
                      </span>
                      <span className="flex-shrink-0 font-mono text-[10px] tabular-nums text-smoke">
                        {c.lastTime}
                      </span>
                    </span>

                    <span className="truncate text-xs leading-relaxed text-smoke">
                      {lastMsg?.text ?? 'Sin mensajes todavía'}
                    </span>

                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5">
                      <span
                        className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wide ${tone.badge}`}
                      >
                        <span
                          className={`h-1 w-1 flex-shrink-0 rounded-full ${tone.dot}`}
                          aria-hidden="true"
                        />
                        {c.statusLabel}
                      </span>
                      <span className={`font-mono text-[9.5px] tabular-nums ${getScoreTone(c.score)}`}>
                        SCORE {c.score}
                      </span>
                      {c.silentMode && (
                        <span
                          className="inline-flex items-center gap-1 font-mono text-[9.5px] uppercase text-neon-rose"
                          title="Silent mode activo: responde un humano"
                        >
                          <BellOff className="h-2.5 w-2.5" aria-hidden="true" />
                          Humano
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </CrosshairCard>
  );
};
