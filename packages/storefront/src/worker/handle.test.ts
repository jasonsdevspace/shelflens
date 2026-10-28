// @vitest-environment node
import { createStore, GROUP_HEADER, PERSISTED_OPERATIONS, VERSION_HEADER } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { createWorkerApi } from './handle.js';

const catalog = generateCatalog({ seed: 42, products: 200 });
const version = createStore({ catalog }).version;

const servingCatalog = () =>
    vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(catalog), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    );

const STORE = Object.keys(PERSISTED_OPERATIONS).find((hash) =>
    PERSISTED_OPERATIONS[hash]?.startsWith('query Store')
);
if (!STORE) throw new Error('expected the Store operation to be persisted');

const persisted = (
    params: Record<string, string>,
    headers: Record<string, string> = {},
    path = '/shelflens/graphql'
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
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
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
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(full?.status).toBe(400);
        expect(await full?.json()).toEqual({
            errors: [{ message: 'this store accepts persisted operations only' }],
        });
        expect((await api.handle(persisted({ op: 'unknown' })))?.status).toBe(404);
        expect((await api.handle(persisted({})))?.status).toBe(400);
    });

    it('can accept full queries where the host wants them', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            fetch: servingCatalog(),
            allowFullQueries: true,
        });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(await full?.json()).toEqual({ data: { store: { name: 'ShelfLens' } } });
        expect((await api.handle(posted('{ not json')))?.status).toBe(400);
    });

    it('leaves anything that is not an API request to the network', async () => {
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
        expect(await api.handle(new Request('https://example.test/shelflens/'))).toBeUndefined();
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
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: fetchImpl });
        const failed = await api.handle(persisted({ op: STORE }));
        expect(failed?.status).toBe(503);
        const recovered = await api.handle(persisted({ op: STORE }));
        expect(recovered?.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});
