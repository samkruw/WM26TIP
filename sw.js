// Panini WM 2026 — Service Worker v5
const CACHE = 'panini-wm2026-v5';
const ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// ============================================================
// INSTALL — cache static assets
// ============================================================
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache failed:', err))
  );
});

// ============================================================
// ACTIVATE — delete old caches
// ============================================================
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — network-only for APIs, cache-first for assets
// ============================================================
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always network for: Firebase, Gemini, Google APIs, external CDNs
  const isExternal = (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firebaseio') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('cdnjs') ||
    url.hostname !== self.location.hostname
  );

  if (isExternal) {
    // Network only — don't cache API calls
    e.respondWith(
      fetch(e.request).catch(() => new Response(
        JSON.stringify({ error: 'offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // Navigation requests → serve index.html (SPA fallback)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html')
        .then(r => r || fetch(e.request))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache-first for same-origin assets (icons, manifest, etc.)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Only cache successful same-origin responses
        if (response && response.ok && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
