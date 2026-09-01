'use client';

import React, { useEffect, useState } from 'react';
import { TabType } from '@/lib/types';
import { useSound } from '@/components/audio/SoundProvider';
import { useAuth } from '@/components/auth/AuthProvider';
import { RecruiterArchitectureGuide } from './RecruiterArchitectureGuide';
import { Volume2, VolumeX, Cloud, LogOut, User as UserIcon, Sparkles } from 'lucide-react';
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
  const { soundEnabled, toggleSound, playClick, playSuccess } = useSound();
  const { user, isDemoMode, signOut } = useAuth();
  const [isGuideOpen, setIsGuideOpen] = useState(false);
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
    <>
      <header className="sticky top-2 z-50 mb-3 flex flex-wrap items-center justify-between gap-3 border border-graphite bg-[#0e0e0e]/95 px-3.5 py-2.5 backdrop-blur-xl pointer-events-auto">
        {/* Brand & Mission Status */}
        <div className="flex items-center gap-2.5 select-none">
          <img
            src="/crmlogo.svg"
            alt="CRM Logo"
            className="h-6 w-auto object-contain flex-shrink-0"
          />
          <div>
            <div className="font-mono text-[12.5px] font-semibold uppercase tracking-wider text-chalk flex items-center gap-1.5">
              <span>{process.env.NEXT_PUBLIC_AGENT_NAME || 'PERUCHO'}</span>
              <span className="text-compass-gold">//</span>
              <span className="text-smoke">WHATSAPP CRM FLIGHT DECK</span>
            </div>
            <div className="font-mono text-[9.5px] text-smoke uppercase">
              TARGET: {process.env.NEXT_PUBLIC_TARGET_NAME || 'FERRETERÍA EL SERRUCHO'} · 33 NODES · 7,650 SKUs
            </div>
          </div>
        </div>

        {/* Segmented Navigation Capsule */}
        <nav
          className="flex items-center gap-1 rounded-full border border-graphite bg-[#111111]/90 p-1 backdrop-blur-md"
          role="tablist"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabClick(tab.id)}
                className={`relative flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-[11px] font-medium uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-compass-gold/15 text-compass-gold ring-1 ring-compass-gold/40 shadow-[0_0_12px_rgba(212,175,55,0.2)]'
                    : 'text-smoke hover:bg-graphite/40 hover:text-chalk'
                }`}
              >
                <span className={isActive ? 'text-compass-gold' : 'text-smoke'}>
                  {tab.icon}
                </span>
                <span className="hidden sm:inline">{tab.label}</span>
                {isActive && (
                  <span className="h-1 w-1 rounded-full bg-compass-gold animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Right Status Capsule: Recruiter Guide + Tunnels + User + Sound */}
        <div className="flex items-center gap-2">
          {/* Recruiter Guide CTA Button */}
          <button
            onClick={() => {
              playSuccess();
              setIsGuideOpen(true);
            }}
            className="flex items-center gap-1.5 border border-compass-gold/50 bg-compass-gold/10 hover:bg-compass-gold/20 hover:border-compass-gold px-2.5 py-1 font-mono text-[10.5px] text-compass-gold font-semibold uppercase tracking-wider transition-all shadow-[0_0_10px_rgba(212,175,55,0.15)] cursor-pointer"
            title="Abrir resumen arquitectónico para evaluadores técnicos"
          >
            <Sparkles className="h-3 w-3 text-pulse-green animate-pulse" />
            <span className="hidden md:inline">GUÍA ARQUITECTURA</span>
          </button>

          {/* Cloudflare Tunnel Status Badge */}
          <div className="hidden lg:flex items-center gap-2 border border-graphite bg-[#141414] px-2.5 py-1 font-mono text-[10.5px] text-smoke">
            <Cloud className="h-3 w-3 text-blue-400" />
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
                {isDemoMode ? 'RECRUITER DEMO' : user.email?.split('@')[0]}
              </span>
              <button
                onClick={handleSignOut}
                className="text-smoke hover:text-neon-rose ml-1 transition-colors cursor-pointer"
                title={isDemoMode ? 'Salir del Modo Demo' : 'Cerrar sesión de Supabase Auth'}
              >
                <LogOut className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Live / Demo Mode Badge */}
          <div
            className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10.5px] select-none ${
              isDemoMode
                ? 'border-compass-gold/50 bg-compass-gold/15 text-compass-gold font-semibold shadow-[0_0_10px_rgba(212,175,55,0.2)]'
                : 'border-pulse-green/25 bg-pulse-green/[0.08] text-pulse-green'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isDemoMode
                  ? 'bg-compass-gold animate-pulse'
                  : 'bg-pulse-green shadow-[0_0_8px_var(--color-pulse-green)] animate-pulse-glow'
              }`}
            />
            <span>{isDemoMode ? 'DEMO SANDBOX' : 'LIVE'}</span>
          </div>
        </div>
      </header>

      {/* Recruiter Architecture Briefing Modal */}
      <RecruiterArchitectureGuide
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
        onNavigateTab={onSelectTab}
      />
    </>
  );
};
