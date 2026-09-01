'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CrosshairCard } from '@/components/hud/CrosshairCard';
import { useSound } from '@/components/audio/SoundProvider';
import { ThinkingOrb } from '@/components/orbs/ThinkingOrb';
import { Shield, Lock, Mail, Eye, EyeOff, ArrowRight, AlertTriangle, KeyRound } from 'lucide-react';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { playClick, playSuccess, playAlert } = useSound();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim() || isLoading) return;

    playClick();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });

      if (error) {
        playAlert();
        if (error.message.includes('Invalid login credentials')) {
          setErrorMessage('Credenciales inválidas. Verifica tu correo y contraseña en Supabase.');
        } else if (error.message.includes('Email not confirmed')) {
          setErrorMessage('El correo electrónico no ha sido confirmado en Supabase Auth.');
        } else {
          setErrorMessage(error.message);
        }
      } else if (data.session) {
        playSuccess();
        if (onLoginSuccess) onLoginSuccess();
      }
    } catch (err: unknown) {
      playAlert();
      setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al conectar con Supabase Auth.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <CrosshairCard className="p-7 bg-[#0c0c0c] border border-graphite shadow-[0_0_50px_rgba(0,0,0,0.8)]">
          {/* Top Ingress Tag */}
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-graphite/60 font-mono text-[10px]">
            <span className="text-compass-gold uppercase tracking-wider flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-pulse-green" />
              // SECURE ACCESS GATEWAY
            </span>
            <span className="px-2 py-0.5 bg-pulse-green/10 border border-pulse-green/30 text-pulse-green text-[9px] font-semibold">
              SUPABASE AUTH
            </span>
          </div>

          {/* Logo, Title & Description */}
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/crmlogo.svg"
              alt="Perucho CRM Logo"
              className="h-12 w-auto object-contain mb-3"
            />
            <h1 className="text-xl font-normal text-chalk tracking-tight mb-1">
              Ferretería El Serrucho
            </h1>
            <p className="text-xs font-mono text-smoke leading-relaxed max-w-xs">
              Flight Deck CRM & Telemetría Operativa. Ingrese con un usuario registrado en el sistema.
            </p>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3 bg-rose-950/40 border border-rose-800/60 font-mono text-xs text-rose-300 flex items-start gap-2.5 animate-shake">
              <AlertTriangle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5 text-neon-rose">[ACCESO DENEGADO]</span>
                <span className="text-[11px] leading-relaxed">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] uppercase text-compass-gold tracking-wider flex items-center justify-between">
                <span>Correo Electrónico</span>
                <Mail className="h-3 w-3 text-smoke" />
              </label>
              <div className="flex items-center bg-[#080808] border border-graphite focus-within:border-compass-gold focus-within:ring-1 focus-within:ring-compass-gold transition-all px-3 py-2">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@el-serrucho.com"
                  className="w-full bg-transparent border-none text-chalk font-mono text-xs outline-none placeholder:text-smoke/40"
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label className="font-mono text-[10px] uppercase text-compass-gold tracking-wider flex items-center justify-between">
                <span>Clave de Acceso</span>
                <KeyRound className="h-3 w-3 text-smoke" />
              </label>
              <div className="flex items-center bg-[#080808] border border-graphite focus-within:border-compass-gold focus-within:ring-1 focus-within:ring-compass-gold transition-all px-3 py-2">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-transparent border-none text-chalk font-mono text-xs outline-none placeholder:text-smoke/40"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-smoke hover:text-chalk transition-colors pl-2 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-2.5 px-4 font-mono text-xs font-semibold uppercase tracking-wider flex items-center justify-center gap-2 border transition-all cursor-pointer mt-2 ${
                isLoading
                  ? 'border-pulse-green bg-pulse-green/20 text-pulse-green animate-pulse cursor-wait'
                  : 'border-pulse-green/80 bg-pulse-green text-obsidian hover:bg-[#aaff4f] hover:shadow-[0_0_20px_rgba(152,255,56,0.35)]'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="scale-50 origin-center -my-2 flex-shrink-0">
                    <ThinkingOrb state="thinking_llm" size={64} showLabel={false} />
                  </div>
                  <span>Verificando Credenciales...</span>
                </div>
              ) : (
                <>
                  <span>Ingresar al Flight Deck</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Security Notice */}
          <div className="mt-6 pt-4 border-t border-graphite/40 flex items-center justify-between font-mono text-[9.5px] text-smoke">
            <span className="flex items-center gap-1.5">
              <Lock className="h-3 w-3 text-compass-gold" />
              <span>TLS 1.3 / JWT Encrypted</span>
            </span>
            <span className="text-compass-gold">Perucho Agent v2.4</span>
          </div>
        </CrosshairCard>
      </div>
    </div>
  );
};
