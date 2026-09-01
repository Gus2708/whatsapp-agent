'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import gsap from 'gsap';
import { TabType, Conversation, ChatMessage } from '@/lib/types';
import { INITIAL_CONVERSATIONS } from '@/lib/constants';
import { HeaderNav } from '@/components/hud/HeaderNav';
import { KpiMatrix } from '@/components/telemetry/KpiMatrix';
import { LiveLogStream } from '@/components/telemetry/LiveLogStream';
import { ConversationList } from '@/components/crm/ConversationList';
import { ChatWindow } from '@/components/crm/ChatWindow';
import { LeadDetailsPane } from '@/components/crm/LeadDetailsPane';
import { RagStudio } from '@/components/rag/RagStudio';
import { N8nVisualizer } from '@/components/n8n/N8nVisualizer';
import { DevOpsConsole } from '@/components/devops/DevOpsConsole';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';

export default function FlightDeckDashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('flight');
  const [conversations, setConversations] = useState<Conversation[]>(INITIAL_CONVERSATIONS);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const { toggleSound, playPacket, playSuccess } = useSound();
  const viewContainerRef = useRef<HTMLDivElement | null>(null);

  // Cargar conversaciones reales desde Supabase y WAHA
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) {
        const data: Conversation[] = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setConversations(data);
          setSelectedConversationId((prev) => {
            if (prev && data.some((c) => c.id === prev)) return prev;
            return data[0].id;
          });
        }
      }
    } catch {
      // Usar datos locales si hay error de red
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // GSAP tab switch animation
  useEffect(() => {
    if (viewContainerRef.current) {
      gsap.fromTo(
        viewContainerRef.current,
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }
  }, [activeTab]);

  // Global Keyboard Shortcuts (1-5 for tabs, M for mute)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName) ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      if (e.key === '1') setActiveTab('flight');
      if (e.key === '2') setActiveTab('crm');
      if (e.key === '3') setActiveTab('rag');
      if (e.key === '4') setActiveTab('n8n');
      if (e.key === '5') setActiveTab('devops');
      if (e.key === 'm' || e.key === 'M') toggleSound();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSound]);

  const selectedConversation =
    conversations.find((c) => c.id === selectedConversationId) || conversations[0] || INITIAL_CONVERSATIONS[0];

  const handleToggleSilentMode = async (convId: string) => {
    const targetConv = conversations.find((c) => c.id === convId);
    if (!targetConv) return;

    const newSilentState = !targetConv.silentMode;

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId ? { ...c, silentMode: newSilentState } : c
      )
    );

    // Sincronizar con Supabase chat_sessions
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_silent',
          phone: targetConv.phone,
          silentMode: newSilentState,
        }),
      });
    } catch {
      // Ignorar error de sincronización
    }
  };

  const handleSendMessage = async (convId: string, text: string) => {
    const targetConv = conversations.find((c) => c.id === convId);
    if (!targetConv) return;

    const now = new Date().toTimeString().slice(0, 5);
    const clientMsg: ChatMessage = {
      sender: 'client',
      text,
      time: now,
    };

    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId
          ? {
              ...c,
              lastTime: now,
              messages: [...c.messages, clientMsg],
            }
          : c
      )
    );

    playPacket();

    // Despachar a WhatsApp vía WAHA a través del túnel dinámico
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_message',
          phone: targetConv.phone,
          message: clientMsg,
        }),
      });

      if (res.ok) {
        playSuccess();
      }
    } catch {
      // Mensaje local reflejado en interfaz
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <HeaderNav activeTab={activeTab} onSelectTab={setActiveTab} />

      <div ref={viewContainerRef} className="flex-1 min-h-0 flex flex-col">
        {/* VIEW 1: FLIGHT DECK */}
        {activeTab === 'flight' && (
          <div className="space-y-6 overflow-y-auto pb-6">
            <div className="mb-4">
              <span className="font-mono text-[11px] text-compass-gold uppercase tracking-wider block mb-1">
                // GLOBAL TELEMETRY & FLIGHT RADAR
              </span>
              <h2 className="text-2xl font-normal text-chalk tracking-tight">
                Métricas Operativas del Agente en Producción
              </h2>
            </div>

            <KpiMatrix />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Architecture & Topology Card */}
              <CrosshairCard className="lg:col-span-7 p-6 bg-[#0c0c0c] flex flex-col justify-between">
                <div>
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-compass-gold block mb-1">
                    // RESILIENCE & RUNTIME TOPOLOGY
                  </span>
                  <h3 className="text-lg font-normal text-chalk mb-3">
                    Topología de Microservicios en Producción
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-4">
                    <div className="p-3 bg-[#080808] border border-graphite">
                      <div className="font-mono text-[10px] text-smoke">
                        PASARELA WHATSAPP (WAHA)
                      </div>
                      <div className="text-[13.5px] text-pulse-green font-medium mt-0.5">
                        Docker / Healthy (Port 3000)
                      </div>
                    </div>
                    <div className="p-3 bg-[#080808] border border-graphite">
                      <div className="font-mono text-[10px] text-smoke">
                        ORQUESTADOR N8N
                      </div>
                      <div className="text-[13.5px] text-pulse-green font-medium mt-0.5">
                        33 Nodos / Zero-Desync
                      </div>
                    </div>
                    <div className="p-3 bg-[#080808] border border-graphite">
                      <div className="font-mono text-[10px] text-smoke">
                        BASE VECTORIAL (SUPABASE)
                      </div>
                      <div className="text-[13.5px] text-chalk font-medium mt-0.5">
                        pgvector / HNSW Cosine
                      </div>
                    </div>
                    <div className="p-3 bg-[#080808] border border-graphite">
                      <div className="font-mono text-[10px] text-smoke">
                        AUTONOMOUS SELF-HEAL
                      </div>
                      <div className="text-[13.5px] text-compass-gold font-medium mt-0.5">
                        Claude Sonnet 5 Active
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-smoke leading-relaxed">
                    Sistema diseñado para operar de forma ininterrumpida frente a cortes de
                    energía eléctrica y latencias de inferencia mediante scripts automatizados en
                    PowerShell (<code className="text-chalk">catchup_serrucho.ps1</code>) y
                    desacoplamiento con colas asíncronas.
                  </p>
                </div>
              </CrosshairCard>

              {/* Log Stream */}
              <div className="lg:col-span-5">
                <LiveLogStream />
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: WHATSAPP CRM */}
        {activeTab === 'crm' && (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 h-[calc(100vh-85px)] max-h-[calc(100vh-85px)] min-h-0 overflow-hidden">
            <div className="md:col-span-4 lg:col-span-3 h-full max-h-full min-h-0 overflow-hidden flex flex-col">
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversation.id}
                onSelect={setSelectedConversationId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
            <div className="md:col-span-8 lg:col-span-6 h-full max-h-full min-h-0 overflow-hidden flex flex-col">
              <ChatWindow
                conversation={selectedConversation}
                onToggleSilentMode={handleToggleSilentMode}
                onSendMessage={handleSendMessage}
              />
            </div>
            <div className="hidden lg:flex lg:col-span-3 h-full max-h-full min-h-0 overflow-hidden flex-col">
              <LeadDetailsPane conversation={selectedConversation} />
            </div>
          </div>
        )}

        {/* VIEW 3: RAG STUDIO */}
        {activeTab === 'rag' && <RagStudio />}

        {/* VIEW 4: 33-NODE N8N */}
        {activeTab === 'n8n' && <N8nVisualizer />}

        {/* VIEW 5: COMMAND CENTER */}
        {activeTab === 'devops' && <DevOpsConsole />}
      </div>
    </div>
  );
}
