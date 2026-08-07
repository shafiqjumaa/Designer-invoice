/* Service Worker بسيط: يخزّن ملفات الواجهة (index.html + الأيقونات) لتفتح
   حتى بدون إنترنت. بيانات التطبيق نفسها (العملاء/الفواتير...) تُدار بالكامل
   عبر Firestore الذي له نظام تخزين مؤقت ومزامنة خاص به منفصل عن هذا الملف. */
const CACHE_NAME = "designerflow-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // لا نتدخل إطلاقاً في طلبات غير GET أو الطلبات لخوادم خارجية (Firebase/Firestore/Google...)
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
  );
});
