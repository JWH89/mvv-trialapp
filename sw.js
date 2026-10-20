/* Service worker: makes the app work offline.
   After changing any file, raise VERSION so phones fetch the new files. */
const VERSION = 'v3';
const CACHE = 'mvv-oefenapp-' + VERSION;
const QUESTIONS = 'assets/data/questions.json';
const WORKBOOK = 'assets/data/workbook.json';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'content.json',
  QUESTIONS,
  WORKBOOK,
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

// Cache the app files, then every photo listed in questions.json, so all KNS cards work offline.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const res = await c.match(QUESTIONS);
  const data = await res.json();
  await c.addAll(data.questions.map((q) => q.image));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('mvv-oefenapp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Google Fonts: cache after first use, so the fonts also show offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => { c.put(req, res.clone()); return res; })))
    );
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Content: network first (so edits arrive), cache as fallback.
  if (url.pathname.endsWith('/content.json') || url.pathname.endsWith('/' + QUESTIONS) || url.pathname.endsWith('/' + WORKBOOK)) {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // App files and photos: cache first, network as fallback.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
