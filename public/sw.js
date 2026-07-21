/* Family Hub service worker: offline app shell + push notifications */
const CACHE = 'fh-v2';
// the shell is precached at install so the first offline visit already works,
// and offline.html is the safety net when a page isn't in the cache at all
const SHELL = ['/', '/app.js', '/styles.css', '/manifest.json', '/icon.svg', '/icon-192.png', '/offline.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  // drop caches from older versions so stale shells don't linger forever
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

// network-first for the app shell so deploys show up immediately; cached copy as offline fallback.
// API calls are never cached — live data only.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/calendar/')) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(async () => {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      // a navigation with no cached copy still deserves a real page, not a browser error
      if (e.request.mode === 'navigate') return caches.match('/offline.html');
      return Response.error();
    })
  );
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'Family Hub', {
    body: d.body || '',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: d.url || '/' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  // previously this only focused whatever tab happened to be open — landing on the dashboard no
  // matter what the notification was about. Now it navigates that tab to the right page first.
  const target = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (!('focus' in c)) continue;
      let client = c;
      if ('navigate' in c) { try { client = (await c.navigate(target)) || c; } catch { /* cross-origin or blocked — focus what we have */ } }
      return client.focus();
    }
    return self.clients.openWindow(target);
  })());
});
