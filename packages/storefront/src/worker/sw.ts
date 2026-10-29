/// <reference lib="webworker" />

import { routeOf } from '@shelflens/api';

import { createIndexedDbEventStore } from './event-db.js';
import { createWorkerApi, type StartedMessage } from './handle.js';
import { CLAIM_MESSAGE } from './register.js';

/**
 * The service worker that is the demo's API.
 *
 * It claims the page as soon as it activates, so the first visit works
 * without a reload, and it builds the store during install so the first
 * search does not wait for the index. Once it is in charge of a page it
 * tells the page how long starting the store took, which is how the cold
 * visit is measured. A page it is not in charge of can ask to be claimed.
 */

declare const self: ServiceWorkerGlobalScope;

const api = createWorkerApi({
    catalogUrl: new URL('catalog.json', self.registration.scope).href,
    rulesUrl: new URL('rules.json', self.registration.scope).href,
    base: new URL(self.registration.scope).pathname,
    answers: () => caches.open('shelflens-answers'),
    events: createIndexedDbEventStore(),
});

/** Tells every page this worker is in charge of how the store started. */
const announce = async () => {
    // `warm` answers from the store already built, or builds it again if
    // the worker was restarted in between, so there is always something to say.
    const startup = await api.warm();
    const started: StartedMessage = { type: 'shelflens:started', ...startup };
    for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.postMessage(started);
    }
};

self.addEventListener('install', (event) => {
    void self.skipWaiting();
    event.waitUntil(api.warm());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim().then(announce));
});

self.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type === CLAIM_MESSAGE.type) void self.clients.claim().then(announce);
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (routeOf(request.url, new URL(self.registration.scope).pathname) === undefined) return;
    event.respondWith(api.handle(request).then((response) => response ?? fetch(request)));
});
