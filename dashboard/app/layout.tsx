import './globals.css';
import type { Metadata } from 'next';
import { SoundProvider } from '@/components/audio/SoundProvider';
import { BlueprintCanvas } from '@/components/hud/BlueprintCanvas';

export const metadata: Metadata = {
  title: 'WhatsApp Agent // Operational CRM & Control Flight Deck',
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
      <body className="bg-obsidian text-chalk antialiased selection:bg-compass-gold/30 selection:text-chalk min-h-screen">
        <SoundProvider>
          <BlueprintCanvas />
          <main className="relative z-10 max-w-[1480px] mx-auto p-4 sm:p-6 lg:p-8 pb-20">
            {children}
          </main>
        </SoundProvider>
      </body>
    </html>
  );
}
