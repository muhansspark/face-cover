const CACHE='school-photo-mosaic-v11';
const ASSETS=['./','./index.html','./style.css','./studio.css','./studio.js','./core.js','./detector.js','./icon.svg','./vendor/heic-to.js','./vendor/fflate.js','./vendor/vision_bundle.mjs','./vendor/face_detector.tflite','./vendor/wasm/vision_wasm_internal.js','./vendor/wasm/vision_wasm_internal.wasm','./vendor/wasm/vision_wasm_nosimd_internal.js','./vendor/wasm/vision_wasm_nosimd_internal.wasm'];
ASSETS.push('./studio.js?v=2.2');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('school-photo-mosaic-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;const request=event.request;if(request.mode==='navigate'){event.respondWith(fetch(request).catch(()=>caches.match('./index.html')));return;}event.respondWith(caches.match(request).then(cached=>cached||fetch(request)));});
