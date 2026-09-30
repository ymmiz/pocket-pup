const CACHE = "pocket-pup-v11";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js?v=1.6.0",
  "./model.js",
  "./manifest.webmanifest",
  "./icons/icon.svg?v=4",
  "./icons/icon-192.png?v=4",
  "./icons/icon-512.png?v=4",
  "./icons/apple-touch-icon.png?v=4"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") return caches.match("./index.html");
    return Response.error();
  }));
});
