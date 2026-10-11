// Pixel Studio's offline helper. Every file of this version is kept in the browser, so the
// installed app opens and works without internet. The build fills in VERSION and FILES.
const VERSION = '__VERSION__'
const FILES = __FILES__
const CACHE = `pixel-studio-${VERSION}`
// Fonts are kept the first time they're used, in a store of their own that stays across versions.
const FONT_CACHE = 'ps-fonts-1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(['./', ...FILES]))
      .then(() => self.skipWaiting()),
  )
})

// Older versions are cleared away once this one takes over.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith('pixel-studio-') && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  if (new URL(request.url).pathname.includes('/fonts/')) {
    event.respondWith(
      caches.open(FONT_CACHE).then((cache) =>
        cache.match(request).then(
          (kept) =>
            kept ??
            fetch(request).then((response) => {
              if (response.ok) cache.put(request, response.clone())
              return response
            }),
        ),
      ),
    )
    return
  }

  // The page itself: the newest version when online, the kept copy when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put('./', copy))
          }
          return response
        })
        .catch(() => caches.match('./')),
    )
    return
  }

  // Everything else has its version in its name, so a kept copy is always right.
  event.respondWith(
    caches.match(request).then(
      (kept) =>
        kept ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
