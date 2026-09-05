/* Pop the Question — service worker
   Seymore Green, Roslindale Boston

   CACHING STRATEGY, AND WHY:
   The page itself is NETWORK-FIRST. Every time someone opens the app it tries
   the live version first and only falls back to the cached copy if the phone is
   offline. That means a fresh Netlify deploy shows up immediately instead of
   people being stuck on an old cached build. Cache-first would be faster by a
   few milliseconds and would cause weeks of "I published but nothing changed"
   confusion. Not worth it.

   Icons and the manifest are cache-first, because they almost never change.
   Firebase and other live calls are never cached at all.
*/

const VERSION = 'ptq-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: pre-cache the shell so the very first offline open works.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL).catch(() => {
        // If one file is missing (say an icon was not uploaded yet) do not fail
        // the whole install — the app should still work.
        return Promise.resolve();
      }))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete any older cache versions.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle GETs from our own origin.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never touch live services — Firebase, Apps Script, analytics, CDNs.
  // These must always hit the network so scores and logins are real.
  if (url.origin !== self.location.origin) return;

  // NETWORK-FIRST for pages, so new deploys always win.
  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/';
  if (isPage) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then(hit => hit || caches.match('./index.html'))
        )
    );
    return;
  }

  // CACHE-FIRST for icons, manifest and other static bits.
  event.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});

// Lets the page tell a waiting worker to take over right away.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
