'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Conversation } from '@/lib/types';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Shield, ShieldAlert, Send, Zap, Coins } from 'lucide-react';

interface ChatWindowProps {
  conversation: Conversation;
  onToggleSilentMode: (id: string) => void;
  onSendMessage: (id: string, text: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  conversation,
  onToggleSilentMode,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const { playClick, playPacket, playAlert } = useSound();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversation.messages]);

  const handleSend = () => {
    if (!inputText.trim()) return;
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
    <CrosshairCard className="flex flex-col bg-[#0a0a0a] h-full max-h-full min-h-0 flex-1">
      <div className="flex flex-col h-full w-full overflow-hidden min-h-0">
        {/* Header */}
        <div className="p-3.5 bg-[#0e0e0e] border-b border-graphite flex justify-between items-center flex-shrink-0">
          <div>
            <h3 className="text-base font-medium text-chalk">{conversation.name}</h3>
            <span className="font-mono text-[11px] text-smoke">
              {conversation.phone} · WhatsApp Live
            </span>
          </div>

          {/* Silent Mode Toggle */}
          <button
            onClick={handleToggle}
            className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-[11px] transition-all cursor-pointer ${
              conversation.silentMode
                ? 'bg-neon-rose/15 border-neon-rose text-neon-rose font-medium shadow-[0_0_12px_rgba(244,63,94,0.2)]'
                : 'bg-[#141414] border-graphite text-smoke hover:text-chalk hover:border-ash'
            }`}
          >
            {conversation.silentMode ? (
              <>
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>SILENT MODE: ON (HUMANO)</span>
              </>
            ) : (
              <>
                <Shield className="h-3.5 w-3.5 text-pulse-green" />
                <span>SILENT MODE: OFF (IA ACTIVA)</span>
              </>
            )}
          </button>
        </div>

        {/* Messages Stream */}
        <div className="flex-1 p-4 overflow-y-auto min-h-0 flex flex-col gap-3 bg-[#080808]">
          {conversation.messages.map((m, idx) => {
            const isClient = m.sender === 'client';
            return (
              <div
                key={idx}
                className={`flex flex-col max-w-[80%] ${
                  isClient ? 'self-start' : 'self-end'
                }`}
              >
                <div
                  className={`p-3 text-[13px] leading-relaxed border ${
                    isClient
                      ? 'bg-[#141414] text-chalk border-graphite border-l-2 border-l-smoke'
                      : 'bg-[#111827] text-[#f8fafc] border-graphite border-r-2 border-r-compass-gold'
                  }`}
                >
                  {m.text}
                </div>
                <div className="flex gap-3 font-mono text-[9.5px] text-smoke mt-1 px-1">
                  <span>{m.time}</span>
                  {m.latency && (
                    <span className="text-pulse-green flex items-center gap-1">
                      <Zap className="h-3 w-3 inline" /> {m.latency}
                    </span>
                  )}
                  {m.cost && (
                    <span className="text-gold-bright flex items-center gap-1">
                      <Coins className="h-3 w-3 inline" /> {m.cost}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Message Composer - Always pinned at bottom */}
        <div className="p-3 bg-[#0e0e0e] border-t border-graphite flex gap-2.5 flex-shrink-0">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Escribir mensaje como cliente o asesor..."
            className="flex-1 bg-[#141414] border border-graphite text-chalk font-mono text-xs px-3 py-2 outline-none focus:border-compass-gold transition-colors"
          />
          <button
            onClick={handleSend}
            className="bg-signal-white text-obsidian border border-signal-white px-4 py-2 font-mono text-xs font-semibold uppercase flex items-center gap-1.5 hover:bg-[#e4e4e7] transition-all cursor-pointer"
          >
            <span>Enviar</span>
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </CrosshairCard>
  );
};
