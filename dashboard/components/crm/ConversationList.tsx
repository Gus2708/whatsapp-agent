'use client';

import React from 'react';
import { Conversation, LeadStatus } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { Search } from 'lucide-react';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  selectedId,
  onSelect,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
}) => {
  const getBadgeStyle = (status: LeadStatus) => {
    switch (status) {
      case 'qualified':
        return 'bg-pulse-green/15 text-pulse-green border-pulse-green/30';
      case 'in-progress':
        return 'bg-blue-500/15 text-blue-300 border-blue-500/30';
      case 'escalated':
        return 'bg-neon-rose/15 text-neon-rose border-neon-rose/30';
      case 'closed':
        return 'bg-gold-bright/15 text-gold-bright border-gold-bright/30';
    }
  };

  const filtered = conversations.filter((c) => {
    const matchesFilter = filter === 'all' || c.status === filter;
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(query) || c.phone.includes(query);
    return matchesFilter && matchesSearch;
  });

  return (
    <CrosshairCard className="flex flex-col bg-[#0c0c0c] overflow-hidden h-full">
      {/* Search Bar */}
      <div className="p-3.5 border-b border-graphite bg-[#0e0e0e] flex items-center gap-2">
        <Search className="h-4 w-4 text-smoke flex-shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por teléfono o nombre..."
          className="w-full bg-[#141414] border border-graphite text-chalk font-mono text-xs px-3 py-2 outline-none focus:border-compass-gold transition-colors"
        />
      </div>

      {/* Filter Pills */}
      <div className="flex gap-1 p-2.5 border-b border-graphite bg-[#0a0a0a] overflow-x-auto">
        {[
          { id: 'all', label: `Todos (${conversations.length})` },
          { id: 'qualified', label: 'Calificados' },
          { id: 'in-progress', label: 'En Curso' },
          { id: 'escalated', label: 'Escalados' },
        ].map((btn) => (
          <button
            key={btn.id}
            onClick={() => onFilterChange(btn.id)}
            className={`font-mono text-[10.5px] px-2.5 py-1 whitespace-nowrap border transition-colors ${
              filter === btn.id
                ? 'bg-signal-white text-obsidian border-signal-white font-semibold'
                : 'bg-[#161616] text-smoke border-graphite hover:text-chalk'
            }`}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Conversations Scroll */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((c) => {
          const isSelected = c.id === selectedId;
          const lastMsg = c.messages[c.messages.length - 1];
          return (
            <div
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`p-3.5 border-b border-graphite cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-[#181818] border-l-2 border-l-signal-white'
                  : 'hover:bg-[#141414]'
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-medium text-[13.5px] text-chalk">{c.name}</span>
                <span className="font-mono text-[10.5px] text-smoke">{c.lastTime}</span>
              </div>
              <p className="text-xs text-smoke truncate mb-2">{lastMsg?.text}</p>
              <div>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 border uppercase inline-block ${getBadgeStyle(
                    c.status
                  )}`}
                >
                  {c.statusLabel}
                </span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-6 text-center font-mono text-xs text-smoke">
            No se encontraron conversaciones.
          </div>
        )}
      </div>
    </CrosshairCard>
  );
};
