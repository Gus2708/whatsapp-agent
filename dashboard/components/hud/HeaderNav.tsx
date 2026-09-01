'use client';

import React, { useEffect, useState } from 'react';
import { TabType } from '@/lib/types';
import { useSound } from '@/components/audio/SoundProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { Volume2, VolumeX, Cloud, LogOut, User as UserIcon } from 'lucide-react';
import {
  MotionFlightIcon,
  MotionCrmIcon,
  MotionRagIcon,
  MotionN8nIcon,
  MotionDevOpsIcon,
} from '@/components/icons/MotionIcons';

interface HeaderNavProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({ activeTab, onSelectTab }) => {
  const { soundEnabled, toggleSound, playClick } = useSound();
  const { user, signOut } = useAuth();
  const [tunnels, setTunnels] = useState<{
    wahaOnline: boolean;
    n8nOnline: boolean;
  }>({ wahaOnline: false, n8nOnline: false });

  useEffect(() => {
    const fetchTunnels = async () => {
      try {
        const res = await fetch('/api/tunnel');
        if (res.ok) {
          const data = await res.json();
          setTunnels({
            wahaOnline: Boolean(data?.waha?.isOnline),
            n8nOnline: Boolean(data?.n8n?.isOnline),
          });
        }
      } catch {
        // Suppress background poll errors
      }
    };

    fetchTunnels();
    const interval = setInterval(fetchTunnels, 20000);
    return () => clearInterval(interval);
  }, []);

  const handleTabClick = (tab: TabType) => {
    try {
      playClick();
    } catch {}
    onSelectTab(tab);
  };

  const handleSignOut = async () => {
    try {
      playClick();
      await signOut();
    } catch {}
  };

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'flight', label: 'Flight Deck', icon: <MotionFlightIcon /> },
    { id: 'crm', label: 'WhatsApp CRM', icon: <MotionCrmIcon /> },
    { id: 'rag', label: 'RAG Studio (TUI)', icon: <MotionRagIcon /> },
    { id: 'n8n', label: '33-Node n8n', icon: <MotionN8nIcon /> },
    { id: 'devops', label: 'Command Center', icon: <MotionDevOpsIcon /> },
  ];

  return (
    <header className="sticky top-2 z-50 mb-3 flex flex-wrap items-center justify-between gap-3 border border-graphite bg-[#0e0e0e]/95 px-3.5 py-2.5 backdrop-blur-xl pointer-events-auto">
      {/* Brand & Mission Status */}
      <div className="flex items-center gap-3 select-none">
        <svg
          className="h-[18px] w-[18px] animate-slow-spin text-compass-gold flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="10"></circle>
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
        </svg>
        <div>
          <div className="font-mono text-[12.5px] font-semibold uppercase tracking-wider text-chalk">
            {process.env.NEXT_PUBLIC_AGENT_NAME || 'PERUCHO'} // WHATSAPP AGENT FLIGHT DECK
          </div>
          <div className="font-mono text-[9.5px] text-smoke uppercase">
            TARGET: {process.env.NEXT_PUBLIC_TARGET_NAME || 'FERRETERÍA EL SERRUCHO'} · 33 NODES · 7,650 SKUs
          </div>
        </div>
      </div>

      {/* Segmented Navigation Capsule */}
      <nav className="flex gap-1 border border-graphite bg-[#0a0a0a]/90 p-1 pointer-events-auto">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabClick(tab.id)}
              className={`group flex items-center gap-1.5 px-3 py-1 font-mono text-xs transition-all duration-150 whitespace-nowrap cursor-pointer select-none ${
                isActive
                  ? 'border border-signal-white bg-signal-white font-semibold text-obsidian shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                  : 'border border-transparent text-smoke hover:border-graphite hover:bg-white/[0.06] hover:text-chalk active:scale-95'
              }`}
            >
              <span>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Controls, Tunnels, User Profile & Live Badge */}
      <div className="flex items-center gap-2">
        {/* Dynamic Cloudflare Tunnel Status */}
        <div
          className="hidden xl:inline-flex items-center gap-1.5 border border-graphite bg-[#111111] px-2 py-1 font-mono text-[10.5px] text-smoke"
          title="Túneles Cloudflare dinámicos consultados desde Supabase"
        >
          <Cloud className="h-3 w-3 text-compass-gold" />
          <span className="flex items-center gap-1">
            WAHA:
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                tunnels.wahaOnline ? 'bg-pulse-green' : 'bg-neon-rose'
              }`}
            />
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            n8n:
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                tunnels.n8nOnline ? 'bg-pulse-green' : 'bg-neon-rose'
              }`}
            />
          </span>
        </div>

        {/* Audio Toggle */}
        <button
          type="button"
          onClick={toggleSound}
          className="flex items-center gap-1 border border-graphite bg-[#141414] px-2 py-1 font-mono text-[10.5px] text-smoke transition-colors hover:border-ash hover:text-chalk cursor-pointer"
          title="Alternar sintetizador de sonido"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="h-3 w-3 text-pulse-green" />
              <span className="hidden sm:inline">AUDIO</span>
            </>
          ) : (
            <>
              <VolumeX className="h-3 w-3 text-smoke" />
              <span className="hidden sm:inline">MUTED</span>
            </>
          )}
        </button>

        {/* User Session & Logout */}
        {user && (
          <div className="flex items-center gap-1.5 border border-graphite bg-[#111111] px-2 py-1 font-mono text-[10.5px]">
            <UserIcon className="h-3 w-3 text-compass-gold flex-shrink-0" />
            <span className="text-chalk max-w-[120px] truncate hidden md:inline" title={user.email}>
              {user.email?.split('@')[0]}
            </span>
            <button
              onClick={handleSignOut}
              className="text-smoke hover:text-neon-rose ml-1 transition-colors cursor-pointer"
              title="Cerrar sesión de Supabase Auth"
            >
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Live Badge */}
        <div className="inline-flex items-center gap-1.5 border border-pulse-green/25 bg-pulse-green/[0.08] px-2 py-1 font-mono text-[10.5px] text-pulse-green select-none">
          <span className="h-1.5 w-1.5 rounded-full bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)] animate-pulse-glow" />
          <span>LIVE</span>
        </div>
      </div>
    </header>
  );
};
