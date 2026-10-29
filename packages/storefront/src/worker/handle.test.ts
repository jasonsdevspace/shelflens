// @vitest-environment node
import {
    createMemoryEventStore,
    createStore,
    GPC_HEADER,
    GROUP_HEADER,
    PERSISTED_OPERATIONS,
    VERSION_HEADER,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { type AnswerStore, createWorkerApi } from './handle.js';
import { serving } from './serving.js';

const catalog = generateCatalog({ seed: 42, products: 200 });
const version = createStore({ catalog }).version;

const servingCatalog = () => serving(catalog);

const STORE = Object.keys(PERSISTED_OPERATIONS).find((hash) =>
    PERSISTED_OPERATIONS[hash]?.startsWith('query Store')
);
if (!STORE) throw new Error('expected the Store operation to be persisted');

const BASE = '/shelflens/';

const persisted = (
    params: Record<string, string>,
    headers: Record<string, string> = {},
    path = `${BASE}graphql`
) =>
    new Request(`https://example.test${path}?${new URLSearchParams(params)}`, {
        method: 'GET',
        headers,
    });

const posted = (body: unknown) =>
    new Request('https://example.test/shelflens/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

describe('the API inside the worker', () => {
    it('answers a persisted operation from the catalog it fetched, once', async () => {
        const fetchImpl = servingCatalog();
        const api = createWorkerApi({
            catalogUrl: 'https://example.test/shelflens/catalog.json',
            base: BASE,
            fetch: fetchImpl,
        });

        const first = await api.handle(persisted({ op: STORE }));
        const second = await api.handle(persisted({ op: STORE }, { [GROUP_HEADER]: 'member' }));

        expect(await first?.json()).toMatchObject({
            data: { store: { name: 'ShelfLens', catalogVersion: version } },
        });
        expect(first?.headers.get(VERSION_HEADER)).toBe(version);
        expect(await second?.json()).toMatchObject({
            data: { store: { viewer: { group: 'MEMBER' } } },
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.test/shelflens/catalog.json');
    });

    it('says what the browser may cache: an answer for the version it asked for', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        const current = await api.handle(persisted({ op: STORE, v: version }));
        expect(current?.headers.get('cache-control')).toBe('public, max-age=300');
        expect(current?.headers.get('vary')).toBe(GROUP_HEADER);
        const unversioned = await api.handle(persisted({ op: STORE }));
        expect(unversioned?.headers.get('cache-control')).toBe('no-store');
        const stale = await api.handle(persisted({ op: STORE, v: 'older' }));
        expect(stale?.headers.get('cache-control')).toBe('no-store');
        expect(stale?.headers.get(VERSION_HEADER)).toBe(version);
    });

    it('accepts only the operations it knows, by name', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(full?.status).toBe(400);
        expect(await full?.json()).toEqual({
            errors: [{ message: 'this store accepts persisted operations only' }],
        });
        expect((await api.handle(persisted({ op: 'unknown' })))?.status).toBe(404);
        expect((await api.handle(persisted({ op: 'constructor' })))?.status).toBe(404);
        expect((await api.handle(persisted({})))?.status).toBe(400);
    });

    it('can accept full queries where the host wants them', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            allowFullQueries: true,
        });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(await full?.json()).toEqual({ data: { store: { name: 'ShelfLens' } } });
        expect((await api.handle(posted('{ not json')))?.status).toBe(400);
    });

    it('builds the store with the rules file beside the catalog, and reports a bad one', async () => {
        const jacket = catalog.products.find((p) => /jacket/i.test(p.name));
        if (!jacket) throw new Error('expected a jacket');
        const good = createWorkerApi({
            catalogUrl: 'catalog.json',
            rulesUrl: 'rules.json',
            base: BASE,
            fetch: serving(catalog, {
                rules: [{ id: 'top', when: { queries: ['jacket'] }, pin: [jacket.sku] }],
            }),
            allowFullQueries: true,
        });
        const answer = await good.handle(
            posted({
                query: '{ search(input: { phrase: "jacket" }) { items { product { sku } } merchandising { applied } } }',
            })
        );
        const { data } = (await answer?.json()) as {
            data: {
                search: {
                    items: { product: { sku: string } }[];
                    merchandising: { applied: string[] };
                };
            };
        };
        expect(data.search.items[0]?.product.sku).toBe(jacket.sku);
        expect(data.search.merchandising.applied).toEqual(['top']);

        const bad = createWorkerApi({
            catalogUrl: 'catalog.json',
            rulesUrl: 'rules.json',
            base: BASE,
            fetch: serving(catalog, { rules: [{ id: 'top', pin: ['SL-NOPE'] }] }),
        });
        expect((await bad.handle(persisted({ op: STORE })))?.status).toBe(503);
    });

    it('leaves anything that is not an API request to the network', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        expect(await api.handle(new Request('https://example.test/shelflens/'))).toBeUndefined();
        expect(await api.handle(persisted({ op: STORE }, {}, '/graphql'))).toBeUndefined();
        expect(
            await api.handle(new Request('https://example.test/shelflens/catalog.json'))
        ).toBeUndefined();
        expect(
            await api.handle(
                new Request('https://example.test/shelflens/graphql', { method: 'PUT' })
            )
        ).toBeUndefined();
    });

    it('reports a store that could not load, and tries again on the next request', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response('gone', { status: 404 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify(catalog), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );
        const api = createWorkerApi({ catalogUrl: 'catalog.json', base: BASE, fetch: fetchImpl });
        const failed = await api.handle(persisted({ op: STORE }));
        expect(failed?.status).toBe(503);
        const recovered = await api.handle(persisted({ op: STORE }));
        expect(recovered?.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

/** A store of answers like the Cache API's, matching on the URL and the viewer header. */
const createAnswerStore = () => {
    const kept = new Map<string, Response>();
    const keyOf = (request: Request) => `${request.url}|${request.headers.get(GROUP_HEADER) ?? ''}`;
    let matched = 0;
    const store: AnswerStore = {
        match: (request) => {
            const found = kept.get(keyOf(request));
            if (found) matched += 1;
            return Promise.resolve(found?.clone());
        },
        put: (request, response) => {
            kept.set(keyOf(request), response);
            return Promise.resolve();
        },
        keys: () =>
            Promise.resolve([...kept.keys()].map((key) => new Request(key.split('|')[0] ?? ''))),
        delete: (request) => {
            let removed = false;
            for (const key of kept.keys()) {
                if (key.startsWith(`${request.url}|`)) removed = kept.delete(key) || removed;
            }
            return Promise.resolve(removed);
        },
    };
    return { store, kept, matches: () => matched };
};

describe('the answers the worker keeps', () => {
    const withStore = (answers: AnswerStore) =>
        createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            answers: () => Promise.resolve(answers),
        });

    it('keeps an answer the headers allow, per viewer, and serves it next time', async () => {
        const { store, kept, matches } = createAnswerStore();
        const api = withStore(store);
        const first = await api.handle(persisted({ op: STORE, v: version }));
        expect(first?.headers.get('cache-control')).toBe('public, max-age=300');
        expect(kept.size).toBe(1);
        const again = await api.handle(persisted({ op: STORE, v: version }));
        expect(matches()).toBe(1);
        expect(await again?.json()).toEqual(await first?.json());
        await api.handle(persisted({ op: STORE, v: version }, { [GROUP_HEADER]: 'member' }));
        expect(kept.size).toBe(2);
        await api.handle(persisted({ op: STORE }));
        expect(kept.size).toBe(2);
    });

    it('drops an answer past its age, and every answer for another version', async () => {
        const { store, kept } = createAnswerStore();
        const url = `https://example.test${BASE}graphql?${new URLSearchParams({ op: STORE, v: version })}`;
        const old = `https://example.test${BASE}graphql?${new URLSearchParams({ op: STORE, v: 'older' })}`;
        const stale = new Response('{"data":{"stale":true}}', {
            headers: {
                'cache-control': 'public, max-age=300',
                date: new Date(Date.now() - 301_000).toUTCString(),
            },
        });
        kept.set(`${url}|`, stale);
        kept.set(`${old}|`, stale.clone());

        const api = withStore(store);
        const startup = await api.warm();
        expect(startup.downloadMs).toBeGreaterThanOrEqual(0);
        expect(startup.buildMs).toBeGreaterThan(0);
        expect(kept.has(`${old}|`)).toBe(false);
        expect(kept.has(`${url}|`)).toBe(true);
        const fresh = await api.handle(persisted({ op: STORE, v: version }));
        expect(await fresh?.json()).not.toEqual({ data: { stale: true } });
    });
});

describe('events inside the worker', () => {
    const batch = (headers: Record<string, string> = {}) =>
        new Request('https://example.test/shelflens/events', {
            method: 'POST',
            headers,
            body: JSON.stringify([{ id: 'e1', kind: 'search', at: 1, phrase: 'jacket' }]),
        });

    it('keeps a posted batch in the store it was given, and nothing under Global Privacy Control', async () => {
        const events = createMemoryEventStore();
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            events,
        });
        const kept = await api.handle(batch());
        expect(kept?.status).toBe(204);
        const dropped = await api.handle(batch({ [GPC_HEADER]: '1' }));
        expect(dropped?.status).toBe(204);
        expect((await events.all()).map((event) => event.id)).toEqual(['e1']);
    });

    it('refuses events when it has nowhere to keep them, and leaves other paths to the network', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        expect((await api.handle(batch()))?.status).toBe(404);
        expect(
            await api.handle(new Request('https://example.test/shelflens/other'))
        ).toBeUndefined();
    });
});
