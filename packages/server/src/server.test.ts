import type { AddressInfo } from 'node:net';

import {
    createStore,
    createStoreApi,
    GROUP_HEADER,
    PERSISTED_OPERATIONS,
    VERSION_HEADER,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createServer } from './server.js';

const api = createStoreApi(createStore({ catalog: generateCatalog({ seed: 42, products: 200 }) }));
const server = createServer({ api, rateLimitPerMinute: 5 });
const demo = createServer({ api, persistedOnly: true });
let base = '';
let demoBase = '';

const STORE = Object.keys(PERSISTED_OPERATIONS).find((hash) =>
    PERSISTED_OPERATIONS[hash]?.startsWith('query Store')
);
if (!STORE) throw new Error('expected the Store operation to be persisted');

beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => demo.listen(0, resolve));
    demoBase = `http://127.0.0.1:${(demo.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => demo.close(() => resolve()));
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}/graphql`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

describe('the API over HTTP', () => {
    it('answers a query, with a request id to quote', async () => {
        const response = await post({ query: '{ store { name viewer { group } } }' });
        expect(response.status).toBe(200);
        expect(response.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);
        expect(await response.json()).toEqual({
            data: { store: { name: 'ShelfLens', viewer: { group: 'GUEST' } } },
        });
    });

    it('reads the customer group from its header', async () => {
        const response = await post(
            { query: '{ store { viewer { group } } }' },
            { [GROUP_HEADER]: 'member' }
        );
        expect(await response.json()).toEqual({ data: { store: { viewer: { group: 'MEMBER' } } } });
    });

    it('refuses a body that is not JSON, or has no query', async () => {
        expect((await post('{ not json')).status).toBe(400);
        expect((await post({ variables: {} })).status).toBe(400);
    });

    it('answers a persisted operation by GET, and says what may be cached', async () => {
        const params = new URLSearchParams({ op: STORE, v: api.version });
        const versioned = await fetch(`${demoBase}/graphql?${params.toString()}`);
        expect(versioned.status).toBe(200);
        expect(await versioned.json()).toMatchObject({
            data: { store: { name: 'ShelfLens', catalogVersion: api.version } },
        });
        expect(versioned.headers.get('cache-control')).toBe('public, max-age=300');
        expect(versioned.headers.get('vary')).toBe(GROUP_HEADER);
        expect(versioned.headers.get(VERSION_HEADER)).toBe(api.version);

        const unversioned = await fetch(`${demoBase}/graphql?op=${STORE}`);
        expect(unversioned.headers.get('cache-control')).toBe('no-store');
        expect((await fetch(`${demoBase}/graphql?op=unknown`)).status).toBe(404);
    });

    it('refuses full queries when told to accept persisted operations only', async () => {
        const response = await fetch(`${demoBase}/graphql`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query: '{ store { name } }' }),
        });
        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
            errors: [{ message: 'this store accepts persisted operations only' }],
        });
    });

    it('answers only under its own path', async () => {
        expect((await fetch(`${demoBase}/elsewhere/graphql?op=${STORE}`)).status).toBe(404);
    });

    it('answers health without counting it against anyone', async () => {
        const response = await fetch(`${base}/health`);
        expect(await response.json()).toEqual({ status: 'ok' });
    });

    it('rate limits a client past its allowance, in the usual error shape', async () => {
        // The guest has spent some of its five above, so a few more are allowed, then none.
        let refused: Response | undefined;
        for (let sent = 0; sent < 5 && !refused; sent += 1) {
            const response = await post({ query: '{ store { name } }' });
            if (response.status === 429) refused = response;
        }
        if (!refused) throw new Error('expected a request past the allowance to be refused');
        expect(refused.headers.get('retry-after')).toBe('60');
        expect(await refused.json()).toEqual({ errors: [{ message: 'too many requests' }] });
        // A member is another client, and still has its allowance.
        expect(
            (await post({ query: '{ store { name } }' }, { [GROUP_HEADER]: 'member' })).status
        ).toBe(200);
    });
});
