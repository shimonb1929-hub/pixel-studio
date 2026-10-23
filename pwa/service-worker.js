// Pixel Studio's offline helper. Every file of this version is kept in the browser, so the
// installed app opens and works without internet. The build fills in VERSION, FILES and MODELS_VERSION.
const VERSION = '__VERSION__'
const FILES = __FILES__
const CACHE = `pixel-studio-${VERSION}`
// Fonts are kept the first time they're used, in a store of their own that stays across versions.
const FONT_CACHE = 'ps-fonts-1'
// The AI model (public/models, about 40 MB) too: kept the first time an AI tool is used, in a
// store that stays until the model files themselves change.
const MODEL_CACHE = 'ps-models-__MODELS_VERSION__'

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
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => (key.startsWith('pixel-studio-') && key !== CACHE) || (key.startsWith('ps-models-') && key !== MODEL_CACHE))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return

  const path = new URL(request.url).pathname
  if (path.includes('/fonts/') || path.includes('/models/')) {
    event.respondWith(
      caches.open(path.includes('/fonts/') ? FONT_CACHE : MODEL_CACHE).then((cache) =>
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
