const CACHE='inspeccion-pulmones-v1';
const ASSETS=['./',  './index.html'];

self.addEventListener('install', e=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e=>{
  // Para peticiones a Microsoft Graph y MSAL — siempre red
  if(e.request.url.includes('microsoftonline.com')||
     e.request.url.includes('graph.microsoft.com')||
     e.request.url.includes('unpkg.com')){
    e.respondWith(fetch(e.request));
    return;
  }
  // Para el resto — cache first
  e.respondWith(
    caches.match(e.request).then(cached=>cached||fetch(e.request))
  );
});