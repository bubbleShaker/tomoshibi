// オフラインでも遊べるように、同じサイトのファイルを保存しておく（取得できたら更新）
const CACHE = 'tomoshibi-v1';
const ASSETS = ['./', 'index.html', 'style.css', 'js/main.js', 'js/scene.js', 'js/audio.js', 'js/breath.js', 'icon.svg', 'icon-180.png', 'icon-512.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => {
      if (r.ok && (r.type === 'basic' || r.type === 'cors')) c.put(e.request, r.clone());
      return r;
    }).catch(() => hit);
    return hit || net;
  }));
});
