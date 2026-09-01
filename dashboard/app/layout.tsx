import './globals.css';
import type { Metadata } from 'next';
import { SoundProvider } from '@/components/audio/SoundProvider';
import { BlueprintCanvas } from '@/components/hud/BlueprintCanvas';

export const metadata: Metadata = {
  title: 'Perucho // WhatsApp CRM & Operational Flight Deck · Ferretería El Serrucho',
  description: 'Mission control, WhatsApp CRM, and RAG intelligence deck for Ferretería El Serrucho',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-obsidian text-chalk antialiased selection:bg-compass-gold/30 selection:text-chalk h-screen overflow-x-hidden">
        <SoundProvider>
          <BlueprintCanvas />
          <main className="relative z-10 max-w-[1580px] w-full mx-auto px-3 sm:px-6 pt-3 pb-3 h-full flex flex-col overflow-x-hidden">
            {children}
          </main>
        </SoundProvider>
      </body>
    </html>
  );
}
