/* ==========================================================================
   NovaConvert — sw.js
   Caches the app shell (HTML/CSS/JS/icons) so the interface loads offline.
   Conversion tools that need a CDN library (ffmpeg, pdf-lib, etc.) still
   need a connection the first time they're used per browser, after which
   this worker serves them from cache too.
   ========================================================================== */

const CACHE_VERSION = "novaconvert-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css",
  "./css/base.css",
  "./css/components.css",
  "./css/animations.css",
  "./css/responsive.css",
  "./js/app.js",
  "./js/utils.js",
  "./js/theme.js",
  "./js/state.js",
  "./js/toolsConfig.js",
  "./js/converters/image.js",
  "./js/converters/zip.js",
  "./js/converters/misc.js",
  "./js/converters/pdf.js",
  "./js/converters/av.js",
  "./js/ui/render.js",
  "./js/ui/workspace.js",
  "./js/ui/modals.js",
  "./js/ui/nav.js",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (isSameOrigin) {
    // App shell: cache-first, falling back to network (and re-caching).
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request)
            .then((res) => {
              const clone = res.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
              return res;
            })
            .catch(() => caches.match("./index.html"))
      )
    );
  } else {
    // Third-party CDN libraries: network-first so updates are picked up,
    // falling back to cache when offline (after first successful load).
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
  }
});
