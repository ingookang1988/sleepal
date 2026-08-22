// SleepPal 서비스워커 — [WO-02a-1]
//
// 캐시 키는 등록 URL 의 ?v=<BUILD> 에서 온다([ADR-116] BUILD 문자열과 연동).
// index.html 이 `sw.js?v=` + BUILD 로 등록하므로 배포마다 SW URL 이 바뀌고,
// 새 SW 의 activate 가 이전 캐시를 지운다 — 낡은 셸이 서빙되는 경로가 없다.
//
// 전략:
//   내비게이션(문서)  network-first  — 온라인이면 항상 새 BUILD, 오프라인이면 캐시된 얼굴
//   셸 자산          cache-first    — 아이콘·매니페스트는 버전 캐시에서
//   /api/*           관여 안 함     — 프록시 응답은 캐시 금지([CON-04])
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'sleepal-' + VERSION;
const SHELL = ['./', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sleepal-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 네트워크 직행 — 캐시·응답 개입 없음

  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./', copy)); return res; })
        .catch(() => caches.match('./'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res; }))
  );
});
