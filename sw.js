const CACHE_NAME = "chamcong-v2";
const ASSETS = [
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./manifest.json",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  // Kích hoạt service worker mới ngay lập tức, không chờ mọi tab cũ đóng lại.
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()) // giành quyền điều khiển các tab đang mở ngay, không cần tải lại thủ công
  );
});

// Ưu tiên lấy bản mới nhất từ mạng trước (network-first) — chỉ dùng bản lưu trong cache khi
// mất mạng. Trước đây làm ngược lại (cache-first) nên sau khi deploy bản mới, trình duyệt vẫn
// trung thành dùng bản cũ mãi cho tới khi người dùng tự xoá cache — công nhân không biết cách làm.
self.addEventListener("fetch", event => {
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
