// AgentHub service worker - cache-first for static assets, network-first for pages.
const CACHE_NAME = "agenthub-pwa-v2";
const APP_SHELL_URLS = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];
const STATIC_EXTENSIONS = [".js", ".css", ".woff2", ".woff", ".png", ".svg", ".ico"];
const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>AgentHub Offline</title>
  </head>
  <body>
    <main style="font-family:system-ui,sans-serif;padding:2rem;max-width:42rem;margin:auto;">
      <h1>AgentHub is offline</h1>
      <p>The app shell is available. Reconnect to continue syncing live sessions and tools.</p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, API, tRPC, and streaming requests - always network.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/trpc/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
  if (isStatic || APP_SHELL_URLS.includes(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match("/")) ||
      new Response(OFFLINE_FALLBACK_HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
  }
}
