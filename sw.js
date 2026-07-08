const CACHE='inspeccion-pulmones-v2'; // se sube la versión para forzar que el SW se reinstale con la nueva estrategia
const ASSETS=['./', './index.html'];

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
  const url=e.request.url;

  // Microsoft Graph, MSAL y librerías externas — siempre red, nunca caché
  if(url.includes('microsoftonline.com')||
     url.includes('graph.microsoft.com')||
     url.includes('unpkg.com')){
    e.respondWith(fetch(e.request));
    return;
  }

  // El documento principal (index.html) — RED PRIMERO, caché solo como respaldo sin conexión.
  // Así siempre se trae la última versión cuando hay señal, y el auto-update / reload
  // funcionan de verdad en vez de quedar atrapados sirviendo la copia vieja guardada.
  if(e.request.mode==='navigate' || url.endsWith('/') || url.endsWith('index.html')){
    e.respondWith(
      fetch(e.request)
        .then(resp=>{
          const copia=resp.clone();
          caches.open(CACHE).then(c=>c.put(e.request, copia));
          return resp;
        })
        .catch(()=>caches.match(e.request))
    );
    return;
  }

  // Resto de recursos (íconos, manifest, etc.) — caché primero, red de respaldo.
  // Estos casi no cambian, así que sigue siendo válido priorizar velocidad aquí.
  e.respondWith(
    caches.match(e.request).then(cached=>cached||fetch(e.request))
  );
});
