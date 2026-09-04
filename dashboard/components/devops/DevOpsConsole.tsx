'use client';

import React, { useState } from 'react';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { Play, Terminal, CheckCircle2 } from 'lucide-react';

interface ScriptCard {
  id: string;
  tag: string;
  name: string;
  desc: string;
  output: string;
  isRunning: boolean;
}

export const DevOpsConsole: React.FC = () => {
  const { playClick, playSuccess } = useSound();
  const [scripts, setScripts] = useState<Record<string, { output: string; isRunning: boolean }>>({
    catchup: { output: '# Listo para ejecutar catchup_serrucho.ps1...', isRunning: false },
    sanitize: { output: '# Listo para ejecutar sanitize_output.js...', isRunning: false },
    autoheal: { output: '# Listo para ejecutar auto_healing_sonnet.js...', isRunning: false },
    watchdog: { output: '# Listo para ejecutar waha_watchdog.ps1...', isRunning: false },
  });

  const runScript = (scriptId: string) => {
    playClick();
    const timestamp = new Date().toLocaleTimeString();

    setScripts((prev) => ({
      ...prev,
      [scriptId]: {
        output: `[${timestamp}] Iniciando script de producción...\n`,
        isRunning: true,
      },
    }));

    if (scriptId === 'catchup') {
      setTimeout(() => {
        setScripts((prev) => ({
          ...prev,
          catchup: {
            ...prev.catchup,
            output: prev.catchup.output + '→ Conectando a base local de WAHA (SQLite/Session DB)...\n',
          },
        }));
      }, 250);
      setTimeout(() => {
        setScripts((prev) => ({
          ...prev,
          catchup: {
            ...prev.catchup,
            output:
              prev.catchup.output +
              '→ Detectados 14 mensajes desatendidos durante corte eléctrico.\n→ Reinyectando en n8n webhook con orden FIFO...\n',
          },
        }));
      }, 600);
      setTimeout(() => {
        playSuccess();
        setScripts((prev) => ({
          ...prev,
          catchup: {
            output:
              prev.catchup.output +
              '✓ [SUCCESS] 14/14 mensajes procesados y respondidos exitosamente.\n',
            isRunning: false,
          },
        }));
      }, 1000);
    } else if (scriptId === 'sanitize') {
      setTimeout(() => {
        setScripts((prev) => ({
          ...prev,
          sanitize: {
            ...prev.sanitize,
            output:
              prev.sanitize.output +
              '→ Escaneando tokens de control interno: [ESCALAR_HUMANO] removido.\n→ Convirtiendo markdown estándar **bold** a formato WhatsApp *bold*...\n',
          },
        }));
      }, 300);
      setTimeout(() => {
        playSuccess();
        setScripts((prev) => ({
          ...prev,
          sanitize: {
            output:
              prev.sanitize.output +
              '✓ [SUCCESS] Salida limpia y 100% compliant con la pasarela de WhatsApp.\n',
            isRunning: false,
          },
        }));
      }, 700);
    } else if (scriptId === 'autoheal') {
      setTimeout(() => {
        setScripts((prev) => ({
          ...prev,
          autoheal: {
            ...prev.autoheal,
            output:
              prev.autoheal.output +
              "→ Analizando log de 0 matches de las últimas 24h con Luna...\n→ Término detectado: 'pega loca' (Jerga regional).\n→ Inyectando sinónimo a catalogo_vocabulario -> SKU-1082 (Cianoacrilato).\n",
          },
        }));
      }, 400);
      setTimeout(() => {
        playSuccess();
        setScripts((prev) => ({
          ...prev,
          autoheal: {
            output:
              prev.autoheal.output +
              '✓ [SUCCESS] Vocabulario actualizado en caliente sin downtime.\n',
            isRunning: false,
          },
        }));
      }, 900);
    } else if (scriptId === 'watchdog') {
      setTimeout(() => {
        setScripts((prev) => ({
          ...prev,
          watchdog: {
            ...prev.watchdog,
            output:
              prev.watchdog.output +
              '→ Verificando contenedor Docker WAHA: Status Up 48 hours.\n→ Memoria RAM plana: 48.2 MB / 512 MB asignados.\n→ Latencia de red interna: 1.2 ms (host.docker.internal).\n',
          },
        }));
      }, 300);
      setTimeout(() => {
        playSuccess();
        setScripts((prev) => ({
          ...prev,
          watchdog: {
            output:
              prev.watchdog.output +
              '✓ [SUCCESS] Todos los contenedores operando en parámetros nominales.\n',
            isRunning: false,
          },
        }));
      }, 750);
    }
  };

  const scriptCards = [
    {
      id: 'catchup',
      tag: 'POWERSHELL AUTOMATION',
      name: 'catchup_serrucho.ps1',
      desc: 'Recuperación ante apagones: reinyecta mensajes desatendidos de WAHA de las últimas 24h a n8n.',
    },
    {
      id: 'sanitize',
      tag: 'NODE.JS UTILITY',
      name: 'sanitize_output.js',
      desc: 'Limpia tags internos [ESCALAR_HUMANO], formatea markdown compatible de WhatsApp y recorta caracteres.',
    },
    {
      id: 'autoheal',
      tag: 'AI CONTINUOUS IMPROVEMENT',
      name: 'auto_healing_sonnet.js',
      desc: 'Luna diagnostica búsquedas fallidas de 0 matches y auto-registra sinónimos en catalogo_vocabulario.',
    },
    {
      id: 'watchdog',
      tag: 'DOCKER CONTAINER MONITOR',
      name: 'waha_watchdog.ps1',
      desc: 'Verifica el estado del contenedor de WAHA, memoria RAM plana y reinicia la sesión si detecta desincronización.',
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      <div className="mb-2 sm:mb-4">
        <span className="font-mono text-[10px] sm:text-[11px] text-gold-bright uppercase tracking-wider block mb-1 font-medium">
          {'//'} DEVOPS & RESILIENCE RUNNER
        </span>
        <h2 className="text-xl sm:text-2xl font-normal text-chalk tracking-tight">
          Consola de Scripts de Automatización & Auto-Mejora
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 sm:gap-5">
        {scriptCards.map((s) => {
          const state = scripts[s.id];
          return (
            <CrosshairCard key={s.id} className="p-4 sm:p-6 bg-[#0d0d0d] flex flex-col justify-between">
              <div>
                <span className="font-mono text-[9.5px] sm:text-[10px] text-gold-bright uppercase tracking-wider block mb-1 font-semibold">
                  {s.tag}
                </span>
                <h3 className="text-sm sm:text-base font-medium text-chalk mb-1">{s.name}</h3>
                <p className="text-[11px] sm:text-xs text-smoke leading-relaxed mb-3 sm:mb-4">{s.desc}</p>

                <div className="h-32 sm:h-40 bg-[#050505] border border-graphite p-2.5 sm:p-3 font-mono text-[10.5px] sm:text-[11px] text-[#94a3b8] overflow-y-auto whitespace-pre-wrap">
                  {state.output}
                </div>
              </div>

              <div className="mt-3 sm:mt-4">
                <button
                  onClick={() => runScript(s.id)}
                  disabled={state.isRunning}
                  className={`w-full inline-flex items-center justify-center gap-2 py-2.5 sm:py-2.5 px-4 font-mono text-xs font-semibold uppercase border transition-all min-h-[44px] cursor-pointer ${
                    state.isRunning
                      ? 'bg-pulse-green/20 text-pulse-green border-pulse-green cursor-wait'
                      : 'bg-signal-white text-obsidian border-signal-white hover:bg-[#e4e4e7]'
                  }`}
                >
                  <Play className="h-3.5 w-3.5" />
                  <span>{state.isRunning ? 'Ejecutando...' : 'Ejecutar Script'}</span>
                </button>
              </div>
            </CrosshairCard>
          );
        })}
      </div>
    </div>
  );
};
