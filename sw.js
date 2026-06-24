/* ═══════════════════════════════════════════════════════════
   Kevala Home — WB RERA Project Finder
   Service Worker · find.kevalahome.com
   
   CACHE VERSION PROTOCOL (same as wbrera):
   Bump CACHE_NAME version number whenever you deploy
   a new index.html or manifest.json to force all users
   to receive the updated files. Format: kvl-find-vN
═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'kvl-find-v2';

/* ── Files to cache immediately on install ── */
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/KH Logo.webp'
];

/* ── External assets to cache on first fetch ── */
const CACHEABLE_ORIGINS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com'                    // Leaflet CSS + JS
];

/* ── Data files — network-first, long cache fallback ── */
const DATA_BASE = 'https://raw.githubusercontent.com/kevalahome/wbrera/main/data/';
const DATA_FILES = [
  DATA_BASE + 'approved.json',
  DATA_BASE + 'rejected.json',
  DATA_BASE + 'projects_cleaned.json'
];

/* ─────────────────────────────────────────
   INSTALL — cache static shell immediately
───────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/* ─────────────────────────────────────────
   ACTIVATE — delete old cache versions
───────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('kvl-find-') && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

/* ─────────────────────────────────────────
   FETCH — tiered strategy:
   1. Static shell  → cache-first
   2. Data files    → network-first, fallback to cache
   3. Fonts/Leaflet → cache-first, network fallback
   4. Everything else → network-first
───────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip browser-extension and chrome-extension requests
  if (!url.protocol.startsWith('http')) return;

  // ── Data files: network-first, cache on success ──
  if (DATA_FILES.some(f => request.url.startsWith(f.split('?')[0]))) {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // ── Navigation (index.html): network-first so deploys reach users immediately ──
  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkFirstWithCache(request));
    return;
  }

  // ── Other static shell assets (logo, manifest): cache-first ──
  if (
    url.origin === self.location.origin ||
    STATIC_ASSETS.some(a => url.pathname === a)
  ) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // ── Fonts + Leaflet: cache-first (stable, versioned CDN) ──
  if (CACHEABLE_ORIGINS.some(o => url.hostname.includes(o))) {
    event.respondWith(cacheFirstWithNetwork(request));
    return;
  }

  // ── Default: network-first ──
  event.respondWith(networkFirstWithCache(request));
});

/* ─────────────────────────────────────────
   STRATEGY HELPERS
───────────────────────────────────────── */

/** Cache-first: serve from cache, fetch + cache if missing */
async function cacheFirstWithNetwork(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline fallback for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

/** Network-first: try network, fall back to cache if offline */
async function networkFirstWithCache(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}
