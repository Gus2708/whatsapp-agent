'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Conversation, CrmPane } from '@/lib/types';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { LeadDetailsPane } from './LeadDetailsPane';

interface CrmWorkspaceProps {
  conversations: Conversation[];
  selectedConversation: Conversation;
  onSelectConversation: (id: string) => void;
  onToggleSilentMode: (id: string) => void;
  onSendMessage: (id: string, text: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  filter: string;
  onFilterChange: (f: string) => void;
}

/**
 * Responsive shell for the three CRM panes.
 *
 * - below md: one pane at a time (list <-> chat), lead profile as a full-screen sheet
 * - md to lg: list + chat side by side, lead profile as a right-anchored sheet
 * - lg and up: all three panes visible, no sheet
 */
export const CrmWorkspace: React.FC<CrmWorkspaceProps> = ({
  conversations,
  selectedConversation,
  onSelectConversation,
  onToggleSilentMode,
  onSendMessage,
  searchQuery,
  onSearchChange,
  filter,
  onFilterChange,
}) => {
  const [pane, setPane] = useState<CrmPane>('list');
  const [isLeadOpen, setIsLeadOpen] = useState(false);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      onSelectConversation(id);
      setPane('chat');
    },
    [onSelectConversation]
  );

  const closeLead = useCallback(() => setIsLeadOpen(false), []);

  // Sheet: focus management + escape to dismiss
  useEffect(() => {
    if (!isLeadOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => sheetRef.current?.focus(), 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLeadOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [isLeadOpen]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden md:grid md:grid-cols-12 md:gap-3 lg:gap-4">
      {/* Pane 1: conversation list */}
      <section
        aria-label="Lista de conversaciones"
        className={`min-h-0 flex-1 flex-col overflow-hidden md:col-span-5 md:flex md:h-full md:max-h-full lg:col-span-3 ${
          pane === 'list' ? 'flex' : 'hidden'
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConversation.id}
          onSelect={handleSelect}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          filter={filter}
          onFilterChange={onFilterChange}
        />
      </section>

      {/* Pane 2: chat */}
      <section
        aria-label="Conversación activa"
        className={`min-h-0 flex-1 flex-col overflow-hidden md:col-span-7 md:flex md:h-full md:max-h-full lg:col-span-6 ${
          pane === 'chat' ? 'flex' : 'hidden'
        }`}
      >
        <ChatWindow
          conversation={selectedConversation}
          onToggleSilentMode={onToggleSilentMode}
          onSendMessage={onSendMessage}
          onBack={() => setPane('list')}
          onOpenLead={() => setIsLeadOpen(true)}
        />
      </section>

      {/* Pane 3: lead profile, permanent only from lg up */}
      <section
        aria-label="Perfil del lead"
        className="hidden min-h-0 overflow-hidden lg:col-span-3 lg:flex lg:h-full lg:max-h-full lg:flex-col"
      >
        <LeadDetailsPane conversation={selectedConversation} />
      </section>

      {/* Lead profile sheet for viewports without a permanent third column */}
      {isLeadOpen && (
        <div className="fixed inset-0 z-[60] flex justify-end lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/60 backdrop-blur-sm"
            onClick={closeLead}
            aria-hidden="true"
          />
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="Perfil del lead"
            tabIndex={-1}
            className="relative flex h-full w-full animate-sheet-in flex-col p-2 outline-none sm:max-w-sm sm:p-3"
          >
            <LeadDetailsPane conversation={selectedConversation} onClose={closeLead} />
          </div>
        </div>
      )}
    </div>
  );
};
