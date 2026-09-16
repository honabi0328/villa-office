const CACHE_NAME = 'villa-office-v3';
const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 우리 사이트(GET)만 캐시. Firestore·카카오 API 등 외부 호출은
// 서비스워커를 거치지 않고 그대로 통과시킨다 (캐시하면 안 되는 데이터라서).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if(req.method !== 'GET' || url.origin !== self.location.origin){
    return; // 브라우저 기본 동작에 맡김 (가로채지 않음)
  }

  event.respondWith(
    fetch(req)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return response;
      })
      .catch(() => caches.match(req))
  );
});
