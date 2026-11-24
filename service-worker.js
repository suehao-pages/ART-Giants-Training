const CACHE_NAME = 'hoopslot-pwa-v84-game-reminders';
const PUSH_DEVICE_CACHE = 'hoopslot-push-device-v1';
const APP_SHELL = [
  './',
  './index.html',
  './notifications.js?v=84',
  './manifest.webmanifest',
  './assets/hoopslot-app-icon-32.png',
  './assets/art-giants-logo.png',
  './assets/hoopslot-logo.png',
  './assets/hoopslot-logo-white.png',
  './assets/hoopslot-app-icon-180.png',
  './assets/hoopslot-app-icon-192.png',
  './assets/hoopslot-app-icon-512.png',
  './assets/hoopslot-app-icon-maskable-512.png',
  './assets/basketball-admin-v9.png',
  './assets/basketball-trainer-v9.png',
  './assets/basketball-parent-v9.png',
  './assets/training-basketball-blue.png',
  './assets/training-hero-background.webp',
  './assets/team-suedwest-baskets.png',
  './assets/team-osterather-tv.jpg',
  './assets/team-art-giants.png',
  './assets/team-djk-tusa.svg',
  './assets/team-tg-duesseldorf.png',
  './assets/team-isd-sportverein.png',
  './assets/team-art-duesseldorf.webp',
  './assets/team-tsv-norf.jpg',
  './assets/team-tsv-bayer-dormagen.png',
  './assets/team-tsv-urdenbach.png',
  './assets/team-bg-shots-kaarst-buettgen.webp',
  './assets/team-sg-rot-weiss-gierath.webp',
  './assets/team-fsv-juechen.webp',
  './apple-touch-icon.png',
  './apple-touch-icon-precomposed.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('hoopslot-pwa-') && key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

function eventLink(kind,id) {
  if (!['training','game'].includes(kind) || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id||'')) return null;
  const url=new URL('./',self.registration.scope);
  url.searchParams.set('pushEvent',kind);
  url.searchParams.set('pushId',id);
  return url;
}

self.addEventListener('push',event=>{
  event.waitUntil((async()=>{
    if(!event.data)return;
    let data;
    try{data=event.data.json()}catch{return}
    if(!data || !eventLink(data.eventKind,data.eventId) || typeof data.title!=='string' || typeof data.body!=='string')return;
    const cache=await caches.open(PUSH_DEVICE_CACHE);
    const binding=await cache.match(new URL('./.push-device',self.registration.scope).href);
    if(!binding || await binding.text()!==data.device)return;
    await self.registration.showNotification(data.title,{
      body:data.body,tag:data.tag,
      icon:new URL('./assets/hoopslot-app-icon-192.png',self.registration.scope).href,
      data:{eventKind:data.eventKind,eventId:data.eventId},
    });
  })());
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const {eventKind,eventId}=event.notification.data||{};
    const url=eventLink(eventKind,eventId);
    if(!url)return;
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:false});
    const client=clients.find(item=>item.url.startsWith(self.registration.scope));
    if(client){
      await client.focus();
      client.postMessage({type:'HOOPSLOT_NOTIFICATION',eventKind,eventId});
    }else{
      await self.clients.openWindow(url.href);
    }
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Supabase and other third-party traffic must always bypass the PWA cache.
  if (url.origin !== self.location.origin) return;

  const networkFirst = request.mode === 'navigate'
    || url.pathname.endsWith('/index.html')
    || url.pathname.endsWith('/config.js')
    || url.pathname.endsWith('/manifest.webmanifest');

  if (networkFirst) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then(response => response || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const refresh = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached);
      return cached || refresh;
    })
  );
});
