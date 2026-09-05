// ═══════════════════════════════════════════════════════════════════════════════
// Service Worker — Perucho Flight Deck PWA (Ferretería El Serrucho)
// Strategy: Offline-First App Shell + Strict API / Supabase Bypass
// ═══════════════════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'v2';
const STATIC_CACHE  = `flightdeck-static-${CACHE_VERSION}`;
const FONT_CACHE    = `flightdeck-fonts-${CACHE_VERSION}`;

// ── Pre-cache: Critical App Shell Assets ────────────────────────────────────
const PRECACHE_ASSETS = [
  '/',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable.png',
  '/apple-touch-icon.png',
  '/crmlogo.svg',
  '/crmlogo.png',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function isNavigationRequest(request) {
  return (
    request.mode === 'navigate' ||
    (request.method === 'GET' &&
      request.headers.get('accept') &&
      request.headers.get('accept').includes('text/html'))
  );
}

function isSupabaseRequest(url) {
  return url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in');
}

function isApiRequest(url) {
  return isSupabaseRequest(url) || url.pathname.startsWith('/api/');
}

function isFontRequest(url) {
  return (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    /\.(woff2?|ttf|otf|eot)$/i.test(url.pathname)
  );
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|png|jpg|jpeg|gif|svg|webp|ico|json)$/i.test(url.pathname)
  );
}

// ── Install ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        return Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            cache.add(asset).catch((err) => {
              console.warn(`[SW] Failed to pre-cache ${asset}:`, err);
            })
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const keepCaches = [STATIC_CACHE, FONT_CACHE];
  event.waitUntil(
    caches.keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => !keepCaches.includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip non-http(s) schemes
  if (!url.protocol.startsWith('http')) return;

  // ─── 1. LIVE APIS & SUPABASE: Explicit Bypass ──────────────────────────────
  // Intercepting these with cached responses risks breaking live CRM telemetry,
  // WebSocket upgrades, SSE streams, and mutating agent states.
  if (isApiRequest(url)) {
    return; // Pass through cleanly to browser network stack
  }

  // ─── 2. FONTS: Cache-First ─────────────────────────────────────────────────
  if (isFontRequest(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(FONT_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // ─── 3. NAVIGATION: Network-First with Cache Fallback ──────────────────────
  if (isNavigationRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, clone);
              // Maintain root '/' cache freshness
              if (url.pathname !== '/') {
                cache.put(new Request('/'), clone.clone());
              }
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // ─── 4. STATIC ASSETS: Cache-First / Stale-While-Revalidate ────────────────
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Stale-while-revalidate update in background
          fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, networkResponse));
              }
            })
            .catch(() => {/* Offline sync suppressed */});
          return cached;
        }

        return fetch(event.request)
          .then((response) => {
            if (!response || response.status !== 200) return response;
            if (response.type !== 'basic' && response.type !== 'cors') return response;

            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
            return response;
          })
          .catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }
});

// ── Web Push & Background Notifications ─────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Perucho Flight Deck', body: '', url: '/', urgent: false };
  try {
    if (event.data) data = Object.assign(data, event.data.json());
  } catch (e) {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
      vibrate: data.urgent ? [300, 150, 300, 150, 300] : [200, 100, 200],
      tag: 'flightdeck-notif',
      renotify: true,
      requireInteraction: !!data.urgent,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            try { client.navigate(targetUrl); } catch (e) {}
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
