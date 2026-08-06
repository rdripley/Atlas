const CACHE_NAME = "atlas-shell-v1";
const PRECACHE_URLS = self.__WB_MANIFEST.map((entry) => typeof entry === "string" ? entry : entry.url);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("atlas-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/Atlas/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/Atlas/index.html")),
    );
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
});

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data?.json() ?? {};
  } catch {
    message = { body: event.data?.text() };
  }

  event.waitUntil(self.registration.showNotification(message.title ?? "Atlas", {
    body: message.body ?? "Your household plan has an update.",
    icon: "/Atlas/pwa-192.png",
    badge: "/Atlas/pwa-192.png",
    tag: message.tag ?? "atlas-update",
    renotify: Boolean(message.urgent),
    data: { url: message.url ?? "/Atlas/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url ?? "/Atlas/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url.startsWith(`${self.location.origin}/Atlas/`));
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
