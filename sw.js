/* DesignerFlow v4: application-shell cache only; user financial data stays
   in Firestore and account-scoped browser storage, never the shell cache. */
const CACHE_NAME = "designerflow-shell-v4";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(key => key.startsWith("designerflow-shell-") && key !== CACHE_NAME)
      .map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req=event.request;
  if(req.method!=="GET" || new URL(req.url).origin!==self.location.origin)return;
  event.respondWith(
    fetch(req).then(response=>{
      if(response.ok){
        const copy=response.clone();
        event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.put(req,copy)));
      }
      return response;
    }).catch(async()=>{
      const cached=await caches.match(req);
      if(cached)return cached;
      if(req.mode==="navigate")return caches.match("./index.html");
      return Response.error();
    })
  );
});
