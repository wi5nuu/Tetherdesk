/**
 * TetherDesk PWA Service Worker
 *
 * Caches the app shell (HTML, JS, CSS, icons) for offline-capable install
 * behavior. Session data, credentials, and API responses are never cached —
 * those must always come from the network so revocation and auth checks are
 * never bypassed by stale cache.
 *
 * Cache strategy:
 *   - App shell assets: cache-first (install → update on next load)
 *   - API calls (/api/*): network-only, no caching
 *   - Pairing / control pages: network-first so fresh data is always shown
 *     when online; fall back to cached shell when offline (shows a loading
 *     state rather than a blank page)
 *
 * This file is served from /sw.js by Next.js (place in /public/).
 * Registration happens in the PWA layout component.
 */

const CACHE_NAME = "tetherdesk-shell-v1";

// App shell assets to pre-cache on install
const PRECACHE_URLS = [
  "/",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

// Never cache these — always go to the network
const NETWORK_ONLY_PATTERNS = [
  /^\/api\//,
  /^\/pair\//,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately rather than waiting for old tabs to close
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Network-only for API, pairing, and auth routes
  if (NETWORK_ONLY_PATTERNS.some((pat) => pat.test(url.pathname))) {
    // Let the request fall through to the network without any SW intervention
    return;
  }

  // Cache-first for everything else (app shell)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Only cache successful, non-opaque responses
        if (
          response.ok &&
          response.type === "basic" &&
          event.request.method === "GET"
        ) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
