// Network only: never cache credentials, tokens, accounts, notes or API responses.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method==='GET'&&url.origin===self.location.origin&&url.pathname.startsWith(new URL('./',self.location.href).pathname)){event.respondWith(fetch(new Request(event.request,{cache:'no-store'})));}});
