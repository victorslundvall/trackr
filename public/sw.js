// Trakkr service worker – makes the app installable and keeps the app shell usable on a flaky gym connection.
// Data calls to Supabase and /api are never cached.
const VERSION = "trakkr-v3";
const SHELL = ["/offline.html", "/icon-192.png", "/apple-touch-icon.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  // Immutable build assets: cache first
  if (url.pathname.startsWith("/_next/static/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network first, fall back to last cached copy, then offline page
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          const hit = await caches.match(req);
          if (hit) return hit;
          // A workout started offline has never been fetched: serve any cached logger shell –
          // the page reads the workout id from the address bar and opens its local copy.
          const kind = /^\/workout\/[^/]+\/summary$/.test(url.pathname) ? "summary" : /^\/workout\/[^/]+$/.test(url.pathname) ? "workout" : null;
          if (kind) {
            const cache = await caches.open(VERSION);
            for (const k of await cache.keys()) {
              const p = new URL(k.url).pathname;
              if (kind === "workout" ? /^\/workout\/[^/]+$/.test(p) : /^\/workout\/[^/]+\/summary$/.test(p)) return cache.match(k);
            }
          }
          return caches.match("/offline.html");
        }),
    );
  }
});
