/* Service worker: makes the grammar app work offline (everything except Free writing).
   After changing app files, raise VERSION so phones fetch the new files.
   Lesson files (data/*.json) are fetched network-first, so lesson edits arrive without a version bump. */
const VERSION = 'v1';
const CACHE = 'nl-grammatica-' + VERSION;
const INDEX = 'data/index.json';
const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
  INDEX,
  'data/sentences.json',
];

// Cache the app, then every lesson file listed in data/index.json.
async function precache() {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  const res = await c.match(INDEX);
  const index = await res.json();
  await c.addAll(index.files);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nl-grammatica-') && k !== CACHE).map((k) => caches.delete(k))))
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
  // Everything else outside this app (including the Claude API) goes straight to the network.
  if (url.origin !== self.location.origin) return;

  // Lessons: network first (so edits arrive), cache as fallback.
  if (url.pathname.includes('/data/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // App files: cache first, network as fallback.
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : undefined)))
  );
});
