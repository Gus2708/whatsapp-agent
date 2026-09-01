'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { ThinkingOrb } from '@/components/orbs/ThinkingOrb';
import { LoginScreen } from './LoginScreen';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Timeout de seguridad: Nunca congelar la pantalla más de 600ms
    const safetyTimer = setTimeout(() => {
      if (isMounted && isLoading) {
        setIsLoading(false);
      }
    }, 600);

    // 1. Obtener sesión activa inicial de Supabase Auth
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
      })
      .catch(() => {
        if (!isMounted) return;
        clearTimeout(safetyTimer);
        setIsLoading(false);
      });

    // 2. Escuchar cambios de estado de autenticación (Login, Logout, Token Refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setSession(null);
  };

  // Carga táctica con ThinkingOrb de Jakub Antalik centrado en pantalla
  if (isLoading) {
    return (
      <div className="flex-1 w-full h-full min-h-0 flex flex-col items-center justify-center gap-4 select-none">
        <ThinkingOrb state="searching_rag" size={64} showLabel={false} />
        <div className="font-mono text-xs text-compass-gold tracking-widest uppercase animate-pulse">
          // VERIFICANDO CREDENCIALES SUPABASE AUTH...
        </div>
      </div>
    );
  }

  // Si no hay sesión activa, renderizar la pantalla de login centrada
  if (!session || !user) {
    return (
      <div className="flex-1 w-full h-full min-h-0 flex flex-col items-center justify-center">
        <LoginScreen />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, isLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
