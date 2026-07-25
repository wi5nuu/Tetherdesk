/// <reference lib="webworker" />
// Service worker for TetherDesk PWA — app shell caching only.
//
// IMPORTANT CONSTRAINTS (Section 8 of the spec):
// - Cache the app shell (JS, CSS, fonts, icons) so the PWA loads offline.
// - NEVER cache session data, bearer tokens, pairing tokens, or any API responses.
// - NEVER cache /api/* routes — these must always go to the network.
// - NEVER cache /pair/* or /control routes' data payloads.
//
// Strategy: Cache-first for static assets (versioned by cache name),
// network-only for all API and dynamic routes.

const CACHE_NAME = "tetherdesk-shell-v1";

// Static assets to pre-cache on install. These are the app shell — the PWA
// loads these files to render the UI even before any API call succeeds.
// The actual file list is populated by the build tool (Next.js) at build time;
// this list is a fallback for environments where the build manifest is unavailable.
const SHELL_ASSETS: string[] = [
  "/",
  "/pair",
  "/control",
  "/manifest.webmanifest",
];

// Routes that must NEVER be served from cache under any circumstances.
const NETWORK_ONLY_PREFIXES = [
  "/api/",
  "/_next/data/", // Next.js server-side data fetches
];

function isNetworkOnly(url: URL): boolean {
  return NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

// -------------------------------------------------------------------------
// Install: pre-cache the app shell
// -------------------------------------------------------------------------
self.addEventListener("install", (event: Event) => {
  const installEvent = event as ExtendableEvent;
  installEvent.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // addAll is atomic — if any resource fails to fetch, the install fails.
      // This is intentional: a broken app shell is worse than no cache.
      await cache.addAll(SHELL_ASSETS);
      // Skip waiting so the new SW activates immediately on first install.
      await (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
    })()
  );
});

// -------------------------------------------------------------------------
// Activate: delete old caches from previous versions
// -------------------------------------------------------------------------
self.addEventListener("activate", (event: Event) => {
  const activateEvent = event as ExtendableEvent;
  activateEvent.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      // Claim all existing clients so the new SW controls them immediately.
      await (self as unknown as ServiceWorkerGlobalScope).clients.claim();
    })()
  );
});

// -------------------------------------------------------------------------
// Fetch: cache-first for shell assets, network-only for API/dynamic routes
// -------------------------------------------------------------------------
self.addEventListener("fetch", (event: Event) => {
  const fetchEvent = event as FetchEvent;
  const url = new URL(fetchEvent.request.url);

  // Non-GET requests always go to the network (POST, DELETE, etc.)
  if (fetchEvent.request.method !== "GET") return;

  // API routes and dynamic data: network only, no cache fallback.
  // If these fail offline, the app shows a clear error — not stale data.
  if (isNetworkOnly(url)) return;

  // For cross-origin requests (e.g., fonts from a CDN), use network-first.
  // We do not cache third-party resources to avoid cache poisoning.
  if (url.origin !== self.location.origin) return;

  // App shell: cache-first with network fallback.
  fetchEvent.respondWith(
    (async () => {
      const cached = await caches.match(fetchEvent.request);
      if (cached) return cached;

      // Not in cache — fetch from network and cache the response.
      const networkResponse = await fetch(fetchEvent.request);
      if (networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        // Clone because the response body can only be consumed once.
        cache.put(fetchEvent.request, networkResponse.clone());
      }
      return networkResponse;
    })()
  );
});
