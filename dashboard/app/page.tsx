'use client';

import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { TabType, Conversation } from '@/lib/types';
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
  const [selectedConversationId, setSelectedConversationId] = useState<string>('c1');
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const { toggleSound, playPacket } = useSound();
  const viewContainerRef = useRef<HTMLDivElement | null>(null);

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
      // Don't trigger when typing in inputs
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
    conversations.find((c) => c.id === selectedConversationId) || conversations[0];

  const handleToggleSilentMode = (convId: string) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId ? { ...c, silentMode: !c.silentMode } : c
      )
    );
  };

  const handleSendMessage = (convId: string, text: string) => {
    const now = new Date().toTimeString().slice(0, 5);
    const clientMsg = {
      sender: 'client' as const,
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

    // If Silent Mode is OFF, simulate AI Autonomous Agent Response
    const conv = conversations.find((c) => c.id === convId);
    if (conv && !conv.silentMode) {
      setTimeout(() => {
        playPacket();
        const agentMsg = {
          sender: 'agent' as const,
          text: `[Perucho Agent]: Recibido tu mensaje "${text.slice(
            0,
            32
          )}...". He consultado el catálogo de 7.650 SKUs y procesado la disponibilidad en tiempo real.`,
          time: new Date().toTimeString().slice(0, 5),
          latency: '24ms (pg_trgm Match)',
          cost: '$0.0000',
        };

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: [...c.messages, agentMsg],
                }
              : c
          )
        );
      }, 550);
    }
  };

  return (
    <div>
      <HeaderNav activeTab={activeTab} onSelectTab={setActiveTab} />

      <div ref={viewContainerRef}>
        {/* VIEW 1: FLIGHT DECK */}
        {activeTab === 'flight' && (
          <div className="space-y-6">
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
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5 h-[calc(100vh-190px)] min-h-[640px]">
            <div className="md:col-span-4 lg:col-span-3 h-full">
              <ConversationList
                conversations={conversations}
                selectedId={selectedConversationId}
                onSelect={setSelectedConversationId}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filter={filter}
                onFilterChange={setFilter}
              />
            </div>
            <div className="md:col-span-8 lg:col-span-6 h-full">
              <ChatWindow
                conversation={selectedConversation}
                onToggleSilentMode={handleToggleSilentMode}
                onSendMessage={handleSendMessage}
              />
            </div>
            <div className="hidden lg:block lg:col-span-3 h-full">
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
