// @vitest-environment node
import { createStore, GROUP_HEADER } from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { createWorkerApi } from './handle.js';

const catalog = generateCatalog({ seed: 42, products: 200 });

const servingCatalog = () =>
    vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify(catalog), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    );

const graphql = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('https://example.test/shelflens/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

describe('the API inside the worker', () => {
    it('answers a query from the catalog it fetched, once', async () => {
        const fetchImpl = servingCatalog();
        const api = createWorkerApi({
            catalogUrl: 'https://example.test/shelflens/catalog.json',
            fetch: fetchImpl,
        });

        const first = await api.handle(graphql({ query: '{ store { name catalogVersion } }' }));
        const second = await api.handle(graphql({ query: '{ store { name } }' }));

        expect(await first?.json()).toEqual({
            data: {
                store: { name: 'ShelfLens', catalogVersion: createStore({ catalog }).version },
            },
        });
        expect(second?.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.test/shelflens/catalog.json');
    });

    it('reads the viewer from the header', async () => {
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
        const response = await api.handle(
            graphql({ query: '{ store { viewer { group } } }' }, { [GROUP_HEADER]: 'member' })
        );
        expect(await response?.json()).toEqual({
            data: { store: { viewer: { group: 'MEMBER' } } },
        });
    });

    it('leaves anything that is not an API request to the network', async () => {
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
        expect(await api.handle(new Request('https://example.test/shelflens/'))).toBeUndefined();
        expect(
            await api.handle(
                new Request('https://example.test/shelflens/graphql', { method: 'GET' })
            )
        ).toBeUndefined();
    });

    it('refuses a body that is not JSON, or has no query', async () => {
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: servingCatalog() });
        expect((await api.handle(graphql('{ not json')))?.status).toBe(400);
        expect((await api.handle(graphql({ variables: {} })))?.status).toBe(400);
    });

    it('reports a store that could not load, and tries again on the next request', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response('', { status: 500 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify(catalog), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );
        const api = createWorkerApi({ catalogUrl: 'catalog.json', fetch: fetchImpl });
        const query = { query: '{ store { name } }' };
        expect((await api.handle(graphql(query)))?.status).toBe(503);
        expect((await api.handle(graphql(query)))?.status).toBe(200);
    });
});
