import './globals.css';
import type { Metadata } from 'next';
import { SoundProvider } from '@/components/audio/SoundProvider';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { BlueprintCanvas } from '@/components/hud/BlueprintCanvas';

export const metadata: Metadata = {
  title: 'Perucho // WhatsApp CRM & Operational Flight Deck · Ferretería El Serrucho',
  description: 'Mission control, WhatsApp CRM, and RAG intelligence deck for Ferretería El Serrucho',
  icons: {
    icon: [
      { url: '/crmlogo.svg', type: 'image/svg+xml' },
      { url: '/crmlogo.png', type: 'image/png' },
    ],
    shortcut: '/crmlogo.png',
    apple: '/crmlogo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="icon" href="/crmlogo.svg" type="image/svg+xml" />
        <link rel="alternate icon" href="/crmlogo.png" type="image/png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-obsidian text-chalk antialiased selection:bg-compass-gold/30 selection:text-chalk h-[100dvh] overflow-hidden">
        <SoundProvider>
          {/* Blueprint Radar Canvas ALWAYS active across all views and auth states */}
          <BlueprintCanvas />
          <main className="relative z-10 mx-auto flex h-full w-full max-w-[1580px] flex-col overflow-hidden px-2 pb-2 pt-2 sm:px-4 sm:pb-3 sm:pt-3 lg:px-6">
            <AuthProvider>{children}</AuthProvider>
          </main>
        </SoundProvider>
      </body>
    </html>
  );
}
