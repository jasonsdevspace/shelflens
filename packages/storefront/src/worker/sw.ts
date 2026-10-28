/// <reference lib="webworker" />

import { isApiPath } from '@shelflens/api';

import { createWorkerApi } from './handle.js';

/**
 * The service worker that is the demo's API.
 *
 * It claims the page as soon as it activates, so the first visit works
 * without a reload, and it builds the store during install so the first
 * search does not wait for the index. Once it has claimed the page it
 * tells it how long starting the store took, which is how the cold visit
 * is measured.
 */

/** What the worker tells the page once it is in charge. */
export interface StartedMessage {
    readonly type: 'shelflens:started';
    readonly downloadMs: number;
    readonly buildMs: number;
}

declare const self: ServiceWorkerGlobalScope;

const api = createWorkerApi({
    catalogUrl: new URL('catalog.json', self.registration.scope).href,
    rulesUrl: new URL('rules.json', self.registration.scope).href,
    base: new URL(self.registration.scope).pathname,
    answers: () => caches.open('shelflens-answers'),
});

let started: StartedMessage | undefined;

self.addEventListener('install', (event) => {
    void self.skipWaiting();
    event.waitUntil(
        api.warm().then((startup) => {
            started = { type: 'shelflens:started', ...startup };
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        self.clients.claim().then(async () => {
            for (const client of await self.clients.matchAll({ type: 'window' })) {
                if (started) client.postMessage(started);
            }
        })
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (!isApiPath(request.url, new URL(self.registration.scope).pathname)) return;
    event.respondWith(api.handle(request).then((response) => response ?? fetch(request)));
});
