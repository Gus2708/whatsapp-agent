# Tasks: pwa-dashboard

## Review Workload Forecast

Estimated changed lines: 250-400
Estimated product files: 6-8
Target budget: 800 lines / 15 files
Hard limit: 1000 lines / 25 files
Budget risk: Low
Independent slices possible: No
Shared production files across slices: No
Forecast basis: CaobaPOS and El Serrucho GO PWA configurations, Next.js 14 App Router layout, and public assets.

## Delivery Plan

Strategy: single-pr
Model: whole
PR mode: draft
PR creation point: final verify only
Current delivery unit: whole

### Whole Delivery

Planned branch/base: `feature/pwa-dashboard` -> `main`
Scope: Implement PWA manifest, service worker, icons, Next.js 14 layout metadata, client registration, and unit tests for the flightdeck dashboard.

## Slice: whole — PWA Implementation for Flight Deck Dashboard

### Phase 1: Core PWA Manifest and Assets

- [x] 1.1 Define W3C Web App Manifest and PWA icons in the dashboard public assets directory.
  - [x] 1.1.a Safety Net: run dashboard test suite to verify green baseline. Evidence: `npm --prefix dashboard run test` passes.
  - [x] 1.1.b RED: add test in `dashboard/__tests__/pwa.test.ts` asserting valid web manifest structure and required icon properties. Evidence: test fails as manifest does not exist yet.
  - [x] 1.1.c GREEN: create `dashboard/public/manifest.webmanifest` and ensure brand icons (192, 512, maskable, apple-touch-icon) are in place. Evidence: manifest validation test passes.
  - [x] 1.1.d TRIANGULATE: assert theme_color, background_color, start_url, and display standalone configurations match Serrucho branding. Evidence: manifest schema assertion passes.
  - [x] 1.1.e REFACTOR: clean manifest formatting and ensure correct relative paths. Evidence: `npm --prefix dashboard run lint` passes.

### Phase 2: Offline-First Service Worker and API Bypass

- [x] 2.1 Implement the Service Worker with App Shell caching and strict Supabase/API bypass.
  - [x] 2.1.a Safety Net: re-verify manifest unit tests pass. Evidence: `npm --prefix dashboard run test` passes.
  - [x] 2.1.b RED: add unit tests in `dashboard/__tests__/pwa.test.ts` verifying service worker route classification logic (navigation, static assets, fonts, Supabase/API bypass). Evidence: test fails before service worker logic implementation.
  - [x] 2.1.c GREEN: create `dashboard/public/service-worker.js` with install, activate, and strategic fetch handlers mirroring CaobaPOS & El Serrucho GO patterns. Evidence: routing logic unit test passes.
  - [x] 2.1.d TRIANGULATE: verify bypass regex covers both `supabase.co` and `/api/` paths under diverse URL query shapes. Evidence: bypass assertions pass.
  - [x] 2.1.e REFACTOR: add descriptive comments and push notification event handlers for future-proofing. Evidence: clean syntax and no lint regressions.

### Phase 3: Next.js Layout Integration and Client Registration

- [x] 3.1 Register the Service Worker in the Next.js App Router and update layout metadata.
  - [x] 3.1.a Safety Net: run typecheck to ensure clean TypeScript state. Evidence: `npm --prefix dashboard run typecheck` passes.
  - [x] 3.1.b RED: add test asserting `PwaRegister` component renders null and invokes service worker registration. Evidence: test fails prior to component creation.
  - [x] 3.1.c GREEN: create `dashboard/components/pwa/PwaRegister.tsx` and integrate into `dashboard/app/layout.tsx` alongside updated `manifest` and `themeColor` metadata. Evidence: registration component test passes.
  - [x] 3.1.d TRIANGULATE: verify registration behaves safely in SSR/non-browser environments without errors. Evidence: SSR rendering test passes.
  - [x] 3.1.e REFACTOR: verify full dashboard build, typecheck, lint, and test suites. Evidence: `npm --prefix dashboard run typecheck`, `lint`, and `test` all pass.
