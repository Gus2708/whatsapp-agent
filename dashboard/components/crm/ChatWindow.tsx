'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Conversation } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { getInitials, getStatusTone } from '@/lib/crm-ui';
import { ArrowLeft, Coins, MessageSquare, Send, Shield, ShieldAlert, User, Zap } from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation;
  onToggleSilentMode: (id: string) => void;
  onSendMessage: (id: string, text: string) => void;
  /** Shown only on viewports where the list and the chat cannot coexist. */
  onBack?: () => void;
  /** Shown only on viewports where the lead pane is not permanently visible. */
  onOpenLead?: () => void;
}

const AGENT_NAME = process.env.NEXT_PUBLIC_AGENT_NAME || 'AGENT';

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  onToggleSilentMode,
  onSendMessage,
  onBack,
  onOpenLead,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { playClick, playAlert } = useSound();
  const tone = getStatusTone(conversation.status);
  const canSend = inputText.trim().length > 0;

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: prefersReduced ? 'auto' : 'smooth',
      block: 'end',
    });
  }, [conversation.messages, conversation.id]);

  const handleSend = () => {
    if (!canSend) return;
    playClick();
    onSendMessage(conversation.id, inputText.trim());
    setInputText('');
  };

  const handleToggle = () => {
    if (!conversation.silentMode) {
      playAlert();
    } else {
      playClick();
    }
    onToggleSilentMode(conversation.id);
  };

  return (
    <CrosshairCard className="flex h-full max-h-full min-h-0 flex-1 flex-col bg-[#0a0a0a]">
      <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-shrink-0 flex-col gap-2 border-b border-graphite bg-[#0e0e0e] px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Volver a la lista de conversaciones"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-graphite bg-[#141414] text-smoke transition-colors hover:border-ash hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold md:hidden"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            <span
              aria-hidden="true"
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center bg-[#151515] font-mono text-[13px] font-semibold uppercase text-chalk ring-1 ${tone.ring}`}
            >
              {getInitials(conversation.name)}
            </span>

            <div className="min-w-0">
              <h3 className="truncate text-[15px] font-medium leading-tight text-chalk" title={conversation.name}>
                {conversation.name}
              </h3>
              <p className="flex flex-wrap items-center gap-x-1.5 font-mono text-[10.5px] text-smoke">
                <span className="tabular-nums">{conversation.phone}</span>
                <span aria-hidden="true">·</span>
                <span className={tone.text}>{conversation.statusLabel}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-shrink-0 items-center gap-2">
            {onOpenLead && (
              <button
                type="button"
                onClick={onOpenLead}
                className="flex min-h-[36px] items-center gap-1.5 border border-graphite bg-[#141414] px-2.5 font-mono text-[11px] uppercase tracking-wider text-smoke transition-colors hover:border-compass-gold hover:text-chalk focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold lg:hidden"
              >
                <User className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Lead</span>
              </button>
            )}

            {/* Silent mode toggle */}
            <button
              type="button"
              onClick={handleToggle}
              aria-pressed={conversation.silentMode}
              aria-label={
                conversation.silentMode
                  ? 'Silent mode activo: responde un humano. Pulsa para devolver el control a la IA'
                  : 'Silent mode inactivo: responde la IA. Pulsa para tomar el control humano'
              }
              className={`flex min-h-[36px] flex-1 items-center justify-center gap-2 border px-2.5 font-mono text-[11px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-compass-gold lg:flex-none ${
                conversation.silentMode
                  ? 'border-neon-rose bg-neon-rose/15 font-medium text-neon-rose shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                  : 'border-graphite bg-[#141414] text-smoke hover:border-ash hover:text-chalk'
              }`}
            >
              {conversation.silentMode ? (
                <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
              ) : (
                <Shield className="h-3.5 w-3.5 flex-shrink-0 text-pulse-green" aria-hidden="true" />
              )}
              <span className="truncate">
                <span className="hidden sm:inline">
                  {conversation.silentMode ? 'SILENT MODE: ON ' : 'SILENT MODE: OFF '}
                </span>
                {conversation.silentMode ? 'HUMANO' : 'IA ACTIVA'}
              </span>
            </button>
          </div>
        </div>

        {/* Message stream */}
        <div
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-[#080808] px-3 py-4 sm:px-4"
          role="log"
          aria-label="Historial de la conversación"
          aria-live="polite"
        >
          {conversation.messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <MessageSquare className="h-8 w-8 text-iron" aria-hidden="true" />
              <p className="text-sm text-chalk">Conversación vacía</p>
              <p className="max-w-[30ch] font-mono text-xs leading-relaxed text-smoke">
                Escribe el primer mensaje para ver responder al agente.
              </p>
            </div>
          ) : (
            conversation.messages.map((m, idx) => {
              const isClient = m.sender === 'client';
              const isSystem = m.sender === 'system';
              const startsGroup = idx === 0 || conversation.messages[idx - 1].sender !== m.sender;

              if (isSystem) {
                return (
                  <div key={m.id ?? idx} className="self-center px-2 py-1 text-center">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-smoke">
                      {m.text}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={m.id ?? idx}
                  className={`flex max-w-[88%] flex-col sm:max-w-[78%] ${
                    isClient ? 'self-start items-start' : 'self-end items-end'
                  }`}
                >
                  {startsGroup && (
                    <span className="mb-1 px-1 font-mono text-[9.5px] uppercase tracking-wider text-smoke">
                      {isClient ? 'Cliente' : `${AGENT_NAME} · IA`}
                    </span>
                  )}

                  <div
                    className={`overflow-hidden break-words border p-3 text-[13.5px] leading-relaxed ${
                      isClient
                        ? 'border-graphite border-l-2 border-l-smoke bg-[#141414] text-chalk'
                        : 'border-graphite border-r-2 border-r-compass-gold bg-[#111827] text-[#f8fafc]'
                    }`}
                  >
                    {m.text}
                  </div>

                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 px-1 font-mono text-[9.5px] text-smoke">
                    <span className="tabular-nums">{m.time}</span>
                    {m.latency && (
                      <span className="flex items-center gap-1 text-pulse-green">
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        <span className="tabular-nums">{m.latency}</span>
                      </span>
                    )}
                    {m.cost && (
                      <span className="flex items-center gap-1 text-gold-bright">
                        <Coins className="h-3 w-3" aria-hidden="true" />
                        <span className="tabular-nums">{m.cost}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="flex flex-shrink-0 gap-2 border-t border-graphite bg-[#0e0e0e] px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSend();
            }}
            placeholder="Escribir mensaje..."
            aria-label="Escribir mensaje en la conversación"
            enterKeyHint="send"
            className="h-11 min-w-0 flex-1 border border-graphite bg-[#141414] px-3 font-mono text-base text-chalk outline-none transition-colors placeholder:text-smoke focus:border-compass-gold focus:ring-1 focus:ring-compass-gold/50 md:h-10 md:text-xs"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            aria-label="Enviar mensaje"
            className="flex h-11 flex-shrink-0 items-center gap-1.5 border border-signal-white bg-signal-white px-3 font-mono text-xs font-semibold uppercase text-obsidian transition-all hover:bg-[#e4e4e7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-compass-gold disabled:cursor-not-allowed disabled:border-graphite disabled:bg-[#161616] disabled:text-ash sm:px-4 md:h-10"
          >
            <span className="hidden sm:inline">Enviar</span>
            <Send className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </CrosshairCard>
  );
};
