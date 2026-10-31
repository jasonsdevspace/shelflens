import type { AddressInfo } from 'node:net';

import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
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
const events = createMemoryEventStore();
const demo = createServer({ api, persistedOnly: true, events });
/** A host given nowhere to keep events. */
const bare = createServer({ api });
let base = '';
let demoBase = '';
let bareBase = '';

const STORE = Object.keys(PERSISTED_OPERATIONS).find((hash) =>
    PERSISTED_OPERATIONS[hash]?.startsWith('query Store')
);
if (!STORE) throw new Error('expected the Store operation to be persisted');

beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => demo.listen(0, resolve));
    demoBase = `http://127.0.0.1:${(demo.address() as AddressInfo).port}`;
    await new Promise<void>((resolve) => bare.listen(0, resolve));
    bareBase = `http://127.0.0.1:${(bare.address() as AddressInfo).port}`;
});

afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => demo.close(() => resolve()));
    await new Promise<void>((resolve) => bare.close(() => resolve()));
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

describe('events over HTTP', () => {
    it('keeps a posted batch where the demo refuses every other post, and refuses the rest', async () => {
        const post = (body: string) =>
            fetch(`${demoBase}/events`, { method: 'POST', body, headers: {} });
        const kept = await post(JSON.stringify([{ id: 'e1', kind: 'view', at: 1, sku: 'SL-1' }]));
        expect(kept.status).toBe(204);
        expect(kept.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/);
        expect((await events.all()).map((event) => event.id)).toEqual(['e1']);

        const refused = await post('not json');
        expect(refused.status).toBe(400);
        expect(await refused.json()).toEqual({ errors: [{ message: 'the batch is not JSON' }] });
        const got = await fetch(`${demoBase}/events`);
        expect(got.status).toBe(405);
        const nowhere = await fetch(`${bareBase}/events`, { method: 'POST', body: '[]' });
        expect(nowhere.status).toBe(404);
    });
});

describe('rules over HTTP', () => {
    const catalog = generateCatalog({ seed: 42, products: 200 });
    const jacket = catalog.products.find((p) => /jacket/i.test(p.name));
    if (!jacket) throw new Error('expected a jacket');
    const shipped = [{ id: 'shipped', when: { queries: ['jacket'] }, pin: [jacket.sku] }];
    const built = (saved: readonly Rule[] | undefined) =>
        createStore({ catalog, rules: saved ?? shipped, rulesEdited: saved !== undefined });
    const shippedStore = built(undefined);
    const host = createServer({
        api: createStoreApi(shippedStore),
        rateLimitPerMinute: 6,
        rules: {
            store: createMemoryRuleStore(),
            shipped,
            check: (draft) => {
                shippedStore.engine.reconfigure({ rules: draft });
            },
            build: (saved) => createStoreApi(built(saved)),
        },
    });
    let hostBase = '';
    beforeAll(async () => {
        await new Promise<void>((resolve) => host.listen(0, resolve));
        hostBase = `http://127.0.0.1:${(host.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
        await new Promise<void>((resolve) => host.close(() => resolve()));
    });
    const rules = (method: string, body?: unknown) =>
        fetch(`${hostBase}/rules`, {
            method,
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
    const applied = async () => {
        const response = await fetch(`${hostBase}/graphql`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                query: '{ search(input: { phrase: "jacket" }) { merchandising { applied } } }',
            }),
        });
        return (
            (await response.json()) as {
                data: { search: { merchandising: { applied: string[] } } };
            }
        ).data.search.merchandising.applied;
    };

    it('serves the shipped set, replaces it under a new version, and rates the path', async () => {
        expect(await (await rules('GET')).json()).toEqual({ rules: shipped, edited: false });
        expect(await applied()).toEqual(['shipped']);
        const refused = await rules('POST', { rules: [{ id: 'ghost', pin: ['SL-99999'] }] });
        expect(refused.status).toBe(400);
        expect(await applied()).toEqual(['shipped']);
        const saved = await rules('POST', {
            rules: [{ id: 'mine', when: { queries: ['jacket'] }, pin: [jacket.sku] }],
        });
        expect(saved.status).toBe(204);
        expect(saved.headers.get(VERSION_HEADER)).toMatch(/\+rules\./);
        expect(await applied()).toEqual(['mine']);
        // The path has its own allowance of six: the searches above did not spend it, and
        // the three requests to it so far leave three more before the seventh is refused.
        for (let sent = 0; sent < 3; sent += 1) expect((await rules('GET')).status).toBe(200);
        const limited = await rules('GET');
        expect(limited.status).toBe(429);
        expect(await limited.json()).toEqual({ errors: [{ message: 'too many requests' }] });
    });

    it('is refused where the host keeps no rules', async () => {
        expect((await fetch(`${bareBase}/rules`)).status).toBe(404);
    });
});

describe('a page on another origin', () => {
    const open = createServer({
        api,
        events: createMemoryEventStore(),
        origins: { allowed: ['https://host.example'] },
    });
    const wide = createServer({
        api,
        events: createMemoryEventStore(),
        origins: { allowed: ['https://host.example'], paths: ['graphql', 'events'] },
    });
    let openBase = '';
    let wideBase = '';
    beforeAll(async () => {
        await new Promise<void>((resolve) => open.listen(0, resolve));
        openBase = `http://127.0.0.1:${(open.address() as AddressInfo).port}`;
        await new Promise<void>((resolve) => wide.listen(0, resolve));
        wideBase = `http://127.0.0.1:${(wide.address() as AddressInfo).port}`;
    });
    afterAll(async () => {
        await new Promise<void>((resolve) => open.close(() => resolve()));
        await new Promise<void>((resolve) => wide.close(() => resolve()));
    });
    const from = (origin: string) => ({ origin });

    it('answers the preflight and the request for an origin the host named, with the group header allowed', async () => {
        const preflight = await fetch(`${openBase}/graphql?op=${STORE}`, {
            method: 'OPTIONS',
            headers: {
                ...from('https://host.example'),
                'access-control-request-method': 'GET',
                'access-control-request-headers': GROUP_HEADER,
            },
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('https://host.example');
        expect(preflight.headers.get('access-control-allow-headers')).toContain(GROUP_HEADER);
        expect(preflight.headers.get('vary')).toBe('origin');
        const answer = await fetch(`${openBase}/graphql?op=${STORE}`, {
            headers: { ...from('https://host.example'), [GROUP_HEADER]: 'member' },
        });
        expect(answer.status).toBe(200);
        expect(answer.headers.get('access-control-allow-origin')).toBe('https://host.example');
        expect(answer.headers.get('vary')).toContain('origin');
    });

    it('refuses an origin the host did not name, and says so rather than answering unreadably', async () => {
        const refused = await fetch(`${openBase}/graphql?op=${STORE}`, {
            headers: from('https://elsewhere.example'),
        });
        expect(refused.status).toBe(403);
        expect(refused.headers.get('access-control-allow-origin')).toBeNull();
        expect(await refused.json()).toEqual({
            errors: [{ message: 'this origin may not use the store' }],
        });
        // A host that names no origins at all refuses every other origin.
        expect(
            (await fetch(`${base}/graphql?op=${STORE}`, { headers: from('https://host.example') }))
                .status
        ).toBe(403);
    });

    it('keeps the events and rules paths to the origins named for them', async () => {
        const batch = JSON.stringify({ events: [] });
        const refused = await fetch(`${openBase}/events`, {
            method: 'POST',
            headers: { ...from('https://host.example'), 'content-type': 'application/json' },
            body: batch,
        });
        expect(refused.status).toBe(403);
        const taken = await fetch(`${wideBase}/events`, {
            method: 'POST',
            headers: { ...from('https://host.example'), 'content-type': 'application/json' },
            body: batch,
        });
        expect(taken.status).not.toBe(403);
        expect(taken.headers.get('access-control-allow-origin')).toBe('https://host.example');
        expect(
            (await fetch(`${wideBase}/rules`, { headers: from('https://host.example') })).status
        ).toBe(403);
    });

    it('treats a request that names the server\u2019s own origin as the store\u2019s own page', async () => {
        const own = await fetch(`${openBase}/graphql?op=${STORE}`, { headers: from(openBase) });
        expect(own.status).toBe(200);
        expect(own.headers.get('access-control-allow-origin')).toBeNull();
    });
});
