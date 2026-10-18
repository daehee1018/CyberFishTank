// The production build injects a content version and the app's static assets.
// Never cache API responses, uploads, video, or device commands.
const VERSION = 'development';
const PRECACHE = ['/offline.html', '/icons/icon-192.png'];
const CACHE = `cft-shell-${VERSION}`;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(PRECACHE)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await Promise.all((await caches.keys()).filter(key => key.startsWith('cft-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(request, { signal: controller.signal });
        if (response.status >= 500) throw new Error('Server unavailable');
        return response;
      } catch {
        return await caches.match('/offline.html', { cacheName: CACHE }) || Response.error();
      } finally { clearTimeout(timeout); }
    })());
    return;
  }
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(async cache => await cache.match(url.pathname) || fetch(request)));
  }
});
