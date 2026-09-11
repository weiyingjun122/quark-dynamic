const CACHE_NAME = 'search-v1';
const STATIC_ASSETS = [
  '/search/',
  '/search/manifest.json',
  '/static/logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // 这些资源永远不缓存，直接走网络
  const noCachePaths = ['/api/', '/ads.txt', '/search/sw.js'];
  if (noCachePaths.some(p => url.pathname === p || url.pathname.startsWith(p))) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // 静态资源（logo等）长期缓存
  // 其他资源用stale-while-revalidate策略
  event.respondWith(
    caches.match(event.request).then(cached => {
      const fetchPromise = fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      
      return cached || fetchPromise;
    })
  );
});
