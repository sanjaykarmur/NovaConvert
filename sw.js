/* ==========================================================================
   NovaConvert — sw.js
   Caches the app shell (HTML/CSS/JS/icons) so the interface loads offline.
   Conversion tools that need a CDN library (ffmpeg, pdf-lib, etc.) still
   need a connection the first time they're used per browser, after which
   this worker serves them from cache too.
   ========================================================================== */

const CACHE_VERSION = "novaconvert-v3";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/tokens.css?v=3",
  "./css/base.css?v=3",
  "./css/components.css?v=3",
  "./css/animations.css?v=3",
  "./css/responsive.css?v=3",
  "./js/app.js?v=3",
  "./js/utils.js?v=3",
  "./js/theme.js?v=3",
  "./js/state.js?v=3",
  "./js/toolsConfig.js?v=3",
  "./js/converters/image.js?v=3",
  "./js/converters/zip.js?v=3",
  "./js/converters/misc.js?v=3",
  "./js/converters/pdf.js?v=3",
  "./js/converters/av.js?v=3",
  "./js/ui/render.js?v=3",
  "./js/ui/workspace.js?v=3",
  "./js/ui/modals.js?v=3",
  "./js/ui/nav.js?v=3",
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
