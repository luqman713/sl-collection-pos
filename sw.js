// ============================================================
// SL Collection POS - Service Worker
// Offline-first: caches app shell, queues failed API calls
// ============================================================

const CACHE_NAME = 'slc-pos-v9';
const APP_SHELL = [
  '/',
  '/index.html',
  '/logo.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js'
];

// Install: cache app shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL.filter(function(u) {
        return !u.startsWith('http') || u.includes('jsdelivr');
      })).catch(function() { /* ignore CDN failures */ });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) {
        return k !== CACHE_NAME;
      }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for Supabase
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // App page: NETWORK FIRST (always the latest version when online), cached copy only when offline
  if (!url.includes('supabase.co') && (e.request.mode === 'navigate' || url.includes('/index.html') || url.endsWith('/'))) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' }).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request, { ignoreSearch: true }).then(function(m) {
          return m || caches.match('./index.html') || caches.match('/index.html');
        });
      })
    );
    return;
  }

  // Logo and CDN libraries (Supabase client, barcode): cache first so the app also starts offline
  if (url.includes('/logo.png') || url.includes('jsdelivr')) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        return cached || fetch(e.request).then(function(res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function(c) { c.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  // Supabase / API: network first, fall through on offline
  if (url.includes('supabase.co')) {
    e.respondWith(
      fetch(e.request).catch(function() {
        // Return empty 503 so the app can handle it
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }
});
