/* ─────────────────────────────────────────────────────────────────────────
   STREAKFORGE SERVICE WORKER
   Handles offline support, caching strategy, and app shell architecture
   ───────────────────────────────────────────────────────────────────────── */

const CACHE_NAME = 'streakforge-v1';
const RUNTIME_CACHE = 'streakforge-runtime-v1';
const IMAGE_CACHE = 'streakforge-images-v1';

// Files to cache on install (app shell)
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json'
];

/* ── INSTALL EVENT ──────────────────────────────────────────────────────── */

self.addEventListener('install', event => {
  console.log('[ServiceWorker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(FILES_TO_CACHE).catch(err => {
        console.warn('[ServiceWorker] Cache addAll error:', err);
        // Continue even if some files fail to cache
        return Promise.resolve();
      });
    }).then(() => {
      // Force the waiting service worker to become the active service worker
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE EVENT ────────────────────────────────────────────────────── */

self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old cache versions
          if (cacheName !== CACHE_NAME && 
              cacheName !== RUNTIME_CACHE && 
              cacheName !== IMAGE_CACHE) {
            console.log('[ServiceWorker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Claim all clients
      return self.clients.claim();
    })
  );
});

/* ── FETCH EVENT ────────────────────────────────────────────────────────── */

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // Network-first strategy for HTML (app shell)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Return cached version if offline
          return caches.match(request).then(response => {
            return response || caches.match('/index.html');
          });
        })
    );
    return;
  }

  // Cache-first strategy for CSS, JS, images
  if (request.destination === 'style' || 
      request.destination === 'script' ||
      request.destination === 'image') {
    
    const cacheKey = request.destination === 'image' ? IMAGE_CACHE : CACHE_NAME;
    
    event.respondWith(
      caches.match(request).then(response => {
        // Return cached version if available
        if (response) {
          return response;
        }

        // Otherwise fetch from network
        return fetch(request).then(response => {
          // Don't cache non-successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }

          // Clone and cache the response
          const responseToCache = response.clone();
          caches.open(cacheKey).then(cache => {
            cache.put(request, responseToCache);
          });

          return response;
        }).catch(() => {
          // Return offline placeholder if available
          if (request.destination === 'image') {
            return new Response(
              '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#1e222b" width="100" height="100"/><text x="50" y="50" fill="#8a9bb5" text-anchor="middle" dominant-baseline="middle">Offline</text></svg>',
              { 
                headers: { 'Content-Type': 'image/svg+xml' },
                status: 200
              }
            );
          }
          return new Response('Offline', { status: 503 });
        });
      })
    );
    return;
  }

  // Network-first for other requests with cache fallback
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => {
            cache.put(request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

/* ── MESSAGE HANDLER ────────────────────────────────────────────────────── */

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(cacheNames => {
      Promise.all(
        cacheNames.map(name => caches.delete(name))
      );
    });
  }
});

console.log('[ServiceWorker] Loaded and ready');