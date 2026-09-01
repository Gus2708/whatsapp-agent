'use client';

import React, { useState } from 'react';
import { LogEntry } from '@/lib/types';
import { INITIAL_LOGS } from '@/lib/constants';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Zap } from 'lucide-react';

export const LiveLogStream: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const { playPacket } = useSound();

  const injectSimulatedEvent = () => {
    playPacket();
    const phone = `+58 412-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toTimeString().slice(0, 8);
    const newLog: LogEntry = {
      id: `log-${Date.now()}`,
      time: now,
      tag: 'info',
      tagLabel: 'INBOUND',
      msg: `Nuevo mensaje recibido desde ${phone} · Disparando pipeline n8n...`,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 19)]);
  };

  const getTagClass = (tag: LogEntry['tag']) => {
    switch (tag) {
      case 'success':
        return 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40';
      case 'info':
        return 'bg-slate-900/80 text-blue-300 border border-blue-800/40';
      case 'warn':
        return 'bg-amber-950/60 text-amber-300 border border-amber-800/40';
      case 'error':
        return 'bg-rose-950/60 text-rose-300 border border-rose-800/40';
    }
  };

  return (
    <CrosshairCard className="p-6 bg-[#0c0c0c]">
      <div className="flex justify-between items-center mb-3">
        <span className="font-mono text-[11px] uppercase tracking-wider text-compass-gold">
          // RUNTIME LOG STREAM
        </span>
        <button
          onClick={injectSimulatedEvent}
          className="inline-flex items-center gap-1 border border-graphite bg-transparent px-2 py-1 font-mono text-[10px] text-chalk uppercase hover:border-ash hover:bg-white/[0.05] transition-colors"
        >
          <Zap className="h-3 w-3 text-pulse-green" />
          <span>Inyectar Evento</span>
        </button>
      </div>

      <div className="h-[360px] overflow-y-auto bg-[#080808] border border-graphite p-3.5 font-mono text-xs flex flex-col gap-2.5">
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 border-b border-[#161616] pb-2">
            <span className="text-compass-gold flex-shrink-0">{log.time}</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] flex-shrink-0 font-medium ${getTagClass(
                log.tag
              )}`}
            >
              {log.tagLabel}
            </span>
            <span className="text-[#d4d4d8] flex-1 break-all">{log.msg}</span>
          </div>
        ))}
      </div>
    </CrosshairCard>
  );
};
