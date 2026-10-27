/// <reference lib="webworker" />

import { createWorkerApi } from './handle.js';

/**
 * The service worker that is the demo's API.
 *
 * It claims the page as soon as it activates, so the first visit works
 * without a reload, and it builds the store during install so the first
 * search does not wait for the index.
 */

declare const self: ServiceWorkerGlobalScope;

const api = createWorkerApi({ catalogUrl: new URL('catalog.json', self.registration.scope).href });

self.addEventListener('install', (event) => {
    void self.skipWaiting();
    event.waitUntil(api.warm());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'POST' || !request.url.startsWith(self.registration.scope)) return;
    event.respondWith(api.handle(request).then((response) => response ?? fetch(request)));
});
