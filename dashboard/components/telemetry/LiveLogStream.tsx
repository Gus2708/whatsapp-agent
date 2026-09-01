'use client';

import React, { useState, useRef } from 'react';
import { LogEntry } from '@/lib/types';
import { INITIAL_LOGS } from '@/lib/constants';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Zap, Play } from 'lucide-react';

export const LiveLogStream: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>(INITIAL_LOGS);
  const [isInjecting, setIsInjecting] = useState(false);
  const { playPacket, playSuccess } = useSound();
  const logContainerRef = useRef<HTMLDivElement | null>(null);

  const injectSimulatedEvent = () => {
    if (isInjecting) return;
    setIsInjecting(true);

    const phone = `+58 412-${Math.floor(100 + Math.random() * 900)}-${Math.floor(1000 + Math.random() * 9000)}`;
    const products = [
      { name: 'Cemento Gris Tipo I 42.5kg', sku: 'SKU-1092', price: '$8.50' },
      { name: 'Tornillo Drywall 1/2 Punta Broca', sku: 'SKU-4921', price: '$12.50' },
      { name: 'Tubo Estructural 2x1 Calibre 16', sku: 'SKU-8812', price: '$14.20' },
      { name: 'Protector de Voltaje Vitron 110V', sku: 'SKU-3011', price: '$28.00' },
    ];
    const selectedProd = products[Math.floor(Math.random() * products.length)];

    const steps = [
      {
        tag: 'info' as const,
        tagLabel: 'INBOUND',
        msg: `Mensaje recibido de ${phone}: "¿Tienen disponible ${selectedProd.name}?"`,
        delay: 0,
      },
      {
        tag: 'success' as const,
        tagLabel: '200 OK',
        msg: `WAHA Webhook Ack <12ms · Payload verificado y deduplicado`,
        delay: 200,
      },
      {
        tag: 'info' as const,
        tagLabel: 'LAYER 1 AST',
        msg: `Determinismo AST: Coincidencia exacta "${selectedProd.name}" (${selectedProd.sku}) en catálogo de 7.650 SKUs`,
        delay: 500,
      },
      {
        tag: 'success' as const,
        tagLabel: 'DISPATCH',
        msg: `JSON validado con Pydantic · Respuesta enviada a WhatsApp vía WAHA (${selectedProd.price} USD)`,
        delay: 850,
      },
    ];

    steps.forEach((step) => {
      setTimeout(() => {
        playPacket();
        const now = new Date().toTimeString().slice(0, 8);
        const newLog: LogEntry = {
          id: `log-${Date.now()}-${Math.random()}`,
          time: now,
          tag: step.tag,
          tagLabel: step.tagLabel,
          msg: step.msg,
        };

        setLogs((prev) => [newLog, ...prev.slice(0, 29)]);

        if (logContainerRef.current) {
          logContainerRef.current.scrollTop = 0;
        }

        if (step.tagLabel === 'DISPATCH') {
          setIsInjecting(false);
          playSuccess();
        }
      }, step.delay);
    });
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
          disabled={isInjecting}
          className={`inline-flex items-center gap-1.5 border px-3 py-1 font-mono text-[10.5px] uppercase font-semibold transition-all cursor-pointer ${
            isInjecting
              ? 'border-pulse-green bg-pulse-green/15 text-pulse-green animate-pulse'
              : 'border-compass-gold/50 bg-compass-gold/10 text-compass-gold hover:bg-compass-gold/20 hover:border-compass-gold'
          }`}
        >
          <Zap className="h-3 w-3 text-pulse-green" />
          <span>{isInjecting ? 'Procesando Flujo...' : 'Inyectar Evento'}</span>
        </button>
      </div>

      <div
        ref={logContainerRef}
        className="h-[360px] overflow-y-auto bg-[#080808] border border-graphite p-3.5 font-mono text-xs flex flex-col gap-2.5 scrollbar-thin"
      >
        {logs.map((log) => (
          <div key={log.id} className="flex items-start gap-3 border-b border-[#161616] pb-2 transition-all">
            <span className="text-compass-gold flex-shrink-0 text-[11px]">{log.time}</span>
            <span
              className={`px-1.5 py-0.5 text-[9.5px] flex-shrink-0 font-medium ${getTagClass(
                log.tag
              )}`}
            >
              {log.tagLabel}
            </span>
            <span className="text-[#d4d4d8] flex-1 break-words leading-relaxed">{log.msg}</span>
          </div>
        ))}
      </div>
    </CrosshairCard>
  );
};
