/* Service Worker (เฉพาะเวอร์ชัน PWA) — แคชไฟล์ทั้งหมดไว้ในเครื่อง ใช้งานออฟไลน์ได้ */
const CACHE = 'billdesk-v1.0.2';
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './css/fonts.css', './css/app.css', './css/document.css', './css/print.css',
  './js/utils.js', './js/db.js', './js/render-doc.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png',
  './fonts/sarabun-thai-400-normal.woff2', './fonts/sarabun-thai-600-normal.woff2', './fonts/sarabun-thai-700-normal.woff2',
  './fonts/sarabun-latin-400-normal.woff2', './fonts/sarabun-latin-600-normal.woff2', './fonts/sarabun-latin-700-normal.woff2'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first: ไม่เรียกเครือข่ายถ้ามีไฟล์ในแคชแล้ว
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;   // ไม่ยุ่งกับ request ภายนอก (และแอปไม่มีอยู่แล้ว)
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
