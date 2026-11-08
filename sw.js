'use strict';

const cachePrefix = 'thai-auto-data-offline-';
const cacheName = cachePrefix + '2';
const scope = new URL(self.registration.scope);
const chart = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
const shell = [
  './', 'site/style.css', 'site/app.js', 'site/i18n-th.js', chart,
  'summaries/market_monthly.csv', 'summaries/province_monthly.csv',
  'data/brands.csv', 'data/models.csv', 'data/provinces.csv', 'data/population.csv'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName)
    .then(cache => cache.addAll(shell.map(path => new URL(path, scope))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(cachePrefix) && key !== cacheName).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;
  const local = url.origin === scope.origin && url.pathname.startsWith(scope.pathname);
  if (!local && url.href !== chart) return;
  const path = url.pathname.slice(scope.pathname.length);
  if (local && !/^(?:$|pages\/(?:brands|models|ev)\/$|index\.html$|(?:site|summaries|data)\/)/.test(path)) return;

  event.respondWith((async () => {
    const cache = await caches.open(cacheName);
    try {
      const response = await fetch(request);
      if (response.ok) event.waitUntil(cache.put(request, response.clone()).catch(() => {}));
      return response;
    } catch (error) {
      const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === 'navigate' && path === 'index.html') return cache.match(scope);
      throw error;
    }
  })());
});
