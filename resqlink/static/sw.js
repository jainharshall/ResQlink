const V='resqlink-v2';
const SHELL=['/','/index.html','/app.js','/style.css','/track.html','/track.js','/manifest.webmanifest','/data/firstaid.json','/data/shelters.json','/icon-192.png','/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/api')||u.pathname==='/sos')return;
  e.respondWith(caches.match(e.request,{ignoreSearch:true}).then(hit=>hit||fetch(e.request).then(r=>{
    const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match('/index.html'))));
});
