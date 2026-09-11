// QiMiiTiNG service worker: app-shell caching only.
// Live meeting data always comes from the network; this just makes the shell
// installable and resilient to flaky connections. No offline data sync.
const CACHE = "qmt-shell-v3";
const SHELL = ["/", "/auth", "/dashboard"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never touch dynamic endpoints: API routes, server functions, auth.
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_serverFn") ||
    url.pathname.startsWith("/_server")
  ) {
    return;
  }

  // Hashed, immutable build assets: cache-first.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  // Page navigations: network-first so live data is fresh, fall back to the
  // cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() =>
        caches.match(req).then((hit) => hit || caches.match("/dashboard").then((d) => d || caches.match("/"))),
      ),
    );
  }
});
