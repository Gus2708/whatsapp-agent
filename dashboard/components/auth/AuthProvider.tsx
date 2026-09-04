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
  isDemoMode: boolean;
  enterDemoMode: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  isDemoMode: false,
  enterDemoMode: () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDemoMode, setIsDemoMode] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Verificar si el usuario estaba previamente en modo demo
    if (typeof window !== 'undefined') {
      const savedDemo = localStorage.getItem('perucho_demo_mode');
      if (savedDemo === 'true') {
        setIsDemoMode(true);
        const demoUser: User = {
          id: 'demo-guest-recruiter',
          app_metadata: {},
          user_metadata: { full_name: 'Recruiter / Tech Lead Guest' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
          email: 'recruiter@demo.guest',
        };
        setUser(demoUser);
        setSession({
          access_token: 'demo-token',
          refresh_token: 'demo-refresh',
          expires_in: 86400,
          token_type: 'bearer',
          user: demoUser,
        });
        setIsLoading(false);
        return;
      }
    }

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
      if (!isDemoMode) {
        setSession(session);
        setUser(session?.user ?? null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [isDemoMode]);

  const enterDemoMode = () => {
    setIsDemoMode(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('perucho_demo_mode', 'true');
    }
    const demoUser: User = {
      id: 'demo-guest-recruiter',
      app_metadata: {},
      user_metadata: { full_name: 'Recruiter / Tech Lead Guest' },
      aud: 'authenticated',
      created_at: new Date().toISOString(),
      email: 'recruiter@demo.guest',
    };
    setUser(demoUser);
    setSession({
      access_token: 'demo-token',
      refresh_token: 'demo-refresh',
      expires_in: 86400,
      token_type: 'bearer',
      user: demoUser,
    });
  };

  const signOut = async () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('perucho_demo_mode');
      }
      setUser(null);
      setSession(null);
      return;
    }
    try {
      await supabase.auth.signOut();
    } catch {}
    setUser(null);
    setSession(null);
  };

  // Carga táctica con ThinkingOrb centrado en pantalla
  if (isLoading) {
    return (
      <div className="flex-1 w-full h-full min-h-0 flex flex-col items-center justify-center gap-4 select-none">
        <ThinkingOrb state="searching_rag" size={64} showLabel={false} />
        <div className="font-mono text-xs text-compass-gold tracking-widest uppercase animate-pulse">
          {'//'} VERIFICANDO CREDENCIALES SUPABASE AUTH...
        </div>
      </div>
    );
  }

  // Si no hay sesión activa ni modo demo, renderizar la pantalla de login
  if ((!session || !user) && !isDemoMode) {
    return (
      <div className="flex-1 w-full h-full min-h-0 flex flex-col items-center justify-center">
        <LoginScreen onEnterDemo={enterDemoMode} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isDemoMode, enterDemoMode, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
