/// <reference lib="webworker" />

import { routeOf } from '@shelflens/api';

import { createIndexedDbCatalogStore } from './catalog-db.js';
import { createIndexedDbEventStore } from './event-db.js';
import { createWorkerApi, isCatalogPath, type StartedMessage } from './handle.js';
import { CLAIM_MESSAGE, VISIT_MESSAGE, VISITED_MESSAGE } from './register.js';
import { createIndexedDbRuleStore } from './rule-db.js';
import { storageFor, storeKindOf } from './storage.js';

/**
 * The service worker that is the demo's API.
 *
 * It claims the page as soon as it activates, so the first visit works
 * without a reload, and it builds the store during install so the first
 * search does not wait for the index. Once it is in charge of a page it
 * tells the page how long starting the store took, which is how the cold
 * visit is measured. A page it is not in charge of can ask to be claimed.
 *
 * Registered with `?store=try` under the scope `try/`, it serves a visitor's
 * own catalog instead, from storage of its own, so the demo's worker, caches
 * and saved rules are never touched by what a visitor loads.
 */

declare const self: ServiceWorkerGlobalScope;

const kind = storeKindOf(self.location.href);
const names = storageFor(kind);
const base = new URL(self.registration.scope).pathname;

const api = createWorkerApi({
    ...(names.catalog
        ? { catalogs: createIndexedDbCatalogStore(names.catalog) }
        : {
              catalogUrl: new URL('catalog.json', self.registration.scope).href,
              rulesUrl: new URL('rules.json', self.registration.scope).href,
          }),
    base,
    answers: () => caches.open(names.answers),
    events: createIndexedDbEventStore({ name: names.events }),
    rules: createIndexedDbRuleStore(names.rules),
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

/** Folds the clicks in for a visit. A store that cannot be rebuilt keeps serving. */
const refreshed = () => api.refresh().catch(() => false);

self.addEventListener('message', (event) => {
    const data = event.data as { type?: unknown } | null;
    if (data?.type === CLAIM_MESSAGE.type) {
        // A claim is a visit too: fold the clicks first, then take the page.
        event.waitUntil(refreshed().then(() => self.clients.claim().then(announce)));
    }
    if (data?.type === VISIT_MESSAGE.type) {
        // Answer on the port the page sent, once the visit's store is ready.
        const [port] = event.ports;
        event.waitUntil(refreshed().then(() => port?.postMessage(VISITED_MESSAGE)));
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const ours =
        routeOf(request.url, base) !== undefined ||
        (kind === 'try' && isCatalogPath(request.url, base));
    if (!ours) return;
    event.respondWith(api.handle(request).then((response) => response ?? fetch(request)));
});
