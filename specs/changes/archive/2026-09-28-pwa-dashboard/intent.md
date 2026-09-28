# Intent: pwa-dashboard

## Context

The WhatsApp Agent Flight Deck dashboard (located in `dashboard/`) is a Next.js 14 App Router application providing operational monitoring, WhatsApp CRM controls, and RAG intelligence for Ferretería El Serrucho. Currently, the dashboard runs exclusively as a standard web page without Progressive Web App (PWA) capabilities. It lacks an installable web manifest, brand-appropriate PWA icons, screenshots for rich installation UI, and an offline-resilient App Shell service worker.

Studying the sibling projects **CaobaPOS** and **El Serrucho GO** revealed proven architectural patterns:
- Explicit App Shell caching with Network-First strategy for HTML navigation.
- Cache-First / Stale-While-Revalidate caching for static assets, scripts, and fonts.
- **Strict Service Worker bypass for Supabase and `/api/` endpoints** to ensure live telemetry, streaming chat, and real-time CRM state remain unhindered by stale cache responses.
- Rich manifest declarations with standalone display, specific brand theme/background colors (`#010100`), and dual-form-factor screenshots.

## Desired Outcome

Deliver a robust, installable, and standards-compliant PWA for the Flight Deck dashboard:
- Create `dashboard/public/manifest.webmanifest` configured for Ferretería El Serrucho Flight Deck.
- Integrate PWA metadata and manifest linkage in `dashboard/app/layout.tsx`.
- Provide complete PWA icon assets (`icon-192.png`, `icon-512.png`, `icon-maskable.png`, and `apple-touch-icon.png`) using the El Serrucho brand assets.
- Implement an App Shell service worker (`dashboard/public/service-worker.js`) following the CaobaPOS & El Serrucho GO architectural rules (Network-First navigation, Cache-First static assets, Supabase/API bypass, push notification listener stubs).
- Provide a clean React client-side Service Worker registration component (`PwaRegister`) loaded in `dashboard/app/layout.tsx`.
- Establish automated Vitest test coverage verifying manifest attributes, service worker caching policies, and registration logic.

## Scope

### In Scope

- Creation of `dashboard/public/manifest.webmanifest`.
- Implementation of `dashboard/public/service-worker.js` with versioned caches, pre-caching, navigation fallback, and API pass-through.
- Generation and placement of PWA icons in `dashboard/public/`.
- Addition of `dashboard/components/pwa/PwaRegister.tsx` to register the service worker in production/supported environments.
- Updating `dashboard/app/layout.tsx` with PWA meta tags (`themeColor`, `appleWebApp`, manifest link).
- Unit tests in `dashboard/__tests__/pwa.test.ts` to validate manifest and service worker configuration.

### Out of Scope

- Offline database mutations or IndexedDB write queues (Flight Deck requires real-time connectivity to WAHA/Supabase).
- Native mobile packaging (Capacitor/Cordova).
- Backend Web Push dispatch infrastructure (handled in separate notification workflows).

## Key Decisions

- **Follow CaobaPOS SW API Bypass**: The service worker explicitly ignores requests matching `supabase.co` or `/api/` to avoid corrupting WebSocket/SSE channels and live CRM state.
- **Static Public Hosting**: Serve both the manifest and service worker directly from Next.js `public/` so the service worker scope defaults to root (`/`).
- **Next.js 14 Metadata Integration**: Use standard App Router `Metadata` declarations for icons, theme-color, and manifest.
- **Fail-safe Client Registration**: The `PwaRegister` component executes on the client only, checks for `navigator.serviceWorker` support, and logs cleanly without blocking hydration.

## Success Criteria

- Web manifest adheres to W3C Web App Manifest specification with `standalone` display mode, valid icons (192, 512, maskable), and dark Serrucho theme colors.
- Service worker registers successfully and caches essential App Shell resources while passing through all API and Supabase network traffic.
- Vitest unit tests pass with 100% success rate (`npm --prefix dashboard run test`).
- Typecheck (`npm --prefix dashboard run typecheck`) and lint (`npm --prefix dashboard run lint`) pass without errors.
- `sdd check` passes without warnings or errors.
