import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { withResponseCache } from './cache.js';
import { type CacheKey, cacheKey } from './cache-key.js';
import { createStore, viewerFromHeader } from './context.js';
import { createStoreApi, type StoreResponse } from './execute.js';

/*
 * The cache key, and the cache built on it.
 *
 * The first test is the one the milestone exists for: a cache keyed on the
 * request alone serves a member's price, and a members-only product, to a
 * guest. The project's key does not.
 */

const catalog = generateCatalog({ seed: 42, products: 500 });
const api = createStoreApi(createStore({ catalog }));
const guest = viewerFromHeader(undefined);
const member = viewerFromHeader('member');

const discounted = catalog.products.find((p) => p.price.member.min < p.price.guest.min);
const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);
if (!discounted || !membersOnly)
    throw new Error('expected a discounted and a members-only product');

const PRODUCT = `query Product($sku: ID!) { product(sku: $sku) { sku price { min { amount } } } }`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const product = (response: StoreResponse): any => {
    if (response.errors) throw new Error(JSON.stringify(response.errors));
    return (response.data as { product: unknown }).product;
};

describe('the cache key', () => {
    it('leaks a member price and a hidden product to a guest when it forgets the viewer', async () => {
        const naive: CacheKey = ({ request }) =>
            `${request.query}${JSON.stringify(request.variables ?? {})}`;
        const leaky = withResponseCache(api, { key: naive });
        const safe = withResponseCache(api);

        const price = { query: PRODUCT, variables: { sku: discounted.sku } };
        const memberPrice = product(await leaky.run(price, member)).price.min.amount;
        expect(product(await leaky.run(price, guest)).price.min.amount).toBe(memberPrice);
        expect(product(await safe.run(price, member)).price.min.amount).toBe(memberPrice);
        expect(product(await safe.run(price, guest)).price.min.amount).toBeGreaterThan(memberPrice);

        const hidden = { query: PRODUCT, variables: { sku: membersOnly.sku } };
        expect(product(await leaky.run(hidden, member))).not.toBeNull();
        expect(product(await leaky.run(hidden, guest))).not.toBeNull();
        expect(product(await safe.run(hidden, member))).not.toBeNull();
        expect(product(await safe.run(hidden, guest))).toBeNull();
    });

    it('is one key for one request, however it is spelled', () => {
        const spaced = cacheKey({
            version: '1',
            viewer: guest,
            request: {
                query: '{\n  store {\n    name\n  }\n}',
                variables: { b: [1, 2], a: { y: 1, x: 2 }, skipped: undefined },
            },
        });
        const compact = cacheKey({
            version: '1',
            viewer: guest,
            request: { query: '{ store { name } }', variables: { a: { x: 2, y: 1 }, b: [1, 2] } },
        });
        expect(spaced).toBe(compact);
    });

    it('preserves meaningful whitespace inside GraphQL strings', () => {
        const request = (brand: string) => ({
            query: `{ search(input: { filters: [{ attribute: BRAND, match: { eq: "${brand}" } }] }) { total } }`,
        });
        expect(cacheKey({ version: '1', viewer: guest, request: request('Cobble Lane') })).not.toBe(
            cacheKey({ version: '1', viewer: guest, request: request('Cobble  Lane') })
        );
    });

    it('distinguishes an omitted operation name from an empty one', () => {
        const request = { query: '{ store { name } }' };
        expect(cacheKey({ version: '1', viewer: guest, request })).not.toBe(
            cacheKey({
                version: '1',
                viewer: guest,
                request: { ...request, operationName: '' },
            })
        );
    });

    it('lets an invalid query reach the API for its error response', async () => {
        const cached = withResponseCache(api);
        const unterminated = { query: '{ search(input: { phrase: "boot }' };
        await expect(cached.run(unterminated, guest)).resolves.toMatchObject({
            errors: [{ extensions: { code: 'GRAPHQL_PARSE_FAILED' } }],
        });
    });

    it('changes with the viewer, the version, the operation and the variables', () => {
        const request = { query: '{ store { name } }', variables: { a: 1 } };
        const base = cacheKey({ version: '1', viewer: guest, request });
        expect(cacheKey({ version: '1', viewer: member, request })).not.toBe(base);
        expect(cacheKey({ version: '2', viewer: guest, request })).not.toBe(base);
        expect(
            cacheKey({ version: '1', viewer: guest, request: { ...request, variables: { a: 2 } } })
        ).not.toBe(base);
        expect(
            cacheKey({
                version: '1',
                viewer: guest,
                request: { ...request, operationName: 'Other' },
            })
        ).not.toBe(base);
        expect(
            cacheKey({
                version: '1',
                viewer: guest,
                request: { ...request, variables: { b: [1, 2] } },
            })
        ).not.toBe(
            cacheKey({
                version: '1',
                viewer: guest,
                request: { ...request, variables: { b: [2, 1] } },
            })
        );
    });

    it('carries the catalog and rules versions, so a rebuilt store misses', () => {
        const rebuilt = createStoreApi(createStore({ catalog, rulesVersion: '1' }));
        const request = { query: '{ store { name } }' };
        expect(rebuilt.version).not.toBe(api.version);
        expect(cacheKey({ version: rebuilt.version, viewer: guest, request })).not.toBe(
            cacheKey({ version: api.version, viewer: guest, request })
        );
    });
});

describe('the response cache', () => {
    const request = { query: '{ search(input: { phrase: "boot" }) { total } }' };

    it('answers the second identical request from memory', async () => {
        const cached = withResponseCache(api);
        const first = await cached.run(request, guest);
        const second = await cached.run(request, guest);
        expect(second).toEqual(first);
        expect(cached.cache).toMatchObject({ hits: 1, misses: 1, size: 1 });
        await cached.run(request, member);
        expect(cached.cache).toMatchObject({ hits: 1, misses: 2, size: 2 });
    });

    it('shares one run between identical requests in flight', async () => {
        let runs = 0;
        const counted = {
            ...api,
            run: (...args: Parameters<typeof api.run>) => {
                runs += 1;
                return api.run(...args);
            },
        };
        const cached = withResponseCache(counted);
        const [first, second] = await Promise.all([
            cached.run(request, guest),
            cached.run(request, guest),
        ]);
        expect(runs).toBe(1);
        expect(second).toEqual(first);
    });

    it('forgets an answer after its age, and the oldest when full', async () => {
        const cached = withResponseCache(api, { maxEntries: 2, maxAgeMs: 1000 });
        const at = (ms: number) => new Date(ms);
        await cached.run(request, guest, at(0));
        await cached.run(request, guest, at(999));
        await cached.run(request, guest, at(1000));
        expect(cached.cache).toMatchObject({ hits: 1, misses: 2 });

        const other = { query: '{ store { name } }' };
        await cached.run(other, guest, at(1000));
        await cached.run(request, guest, at(1000));
        expect(cached.cache.size).toBe(2);
        await cached.run(other, member, at(1000));
        expect(cached.cache.size).toBe(2);
        await cached.run(other, guest, at(1000));
        expect(cached.cache).toMatchObject({ misses: 5, size: 2 });
        cached.cache.clear();
        expect(cached.cache.size).toBe(0);
    });

    it('keeps a recomputed expired answer as the most recently used', async () => {
        const cached = withResponseCache(api, { maxEntries: 2, maxAgeMs: 1000 });
        const at = (ms: number) => new Date(ms);
        const second = { query: '{ store { name } }' };
        const third = { query: '{ categories { id } }' };

        await cached.run(request, guest, at(0));
        await cached.run(second, guest, at(0));
        await cached.run(request, guest, at(1000));
        await cached.run(third, guest, at(1000));
        await cached.run(request, guest, at(1000));

        expect(cached.cache).toMatchObject({ hits: 1, misses: 4, size: 2 });
    });

    it('does not let an expired failure delete its replacement', async () => {
        const settle: ((response: StoreResponse) => void)[] = [];
        const delayed = {
            ...api,
            run: () =>
                new Promise<StoreResponse>((resolve) => {
                    settle.push(resolve);
                }),
        };
        const cached = withResponseCache(delayed, { maxAgeMs: 1 });
        const at = (ms: number) => new Date(ms);

        const first = cached.run(request, guest, at(0));
        const replacement = cached.run(request, guest, at(1));
        settle[0]?.({ errors: [{ message: 'old failure' }] });
        await first;
        settle[1]?.({ data: { ok: true } });
        await replacement;
        await cached.run(request, guest, at(1));

        expect(cached.cache).toMatchObject({ hits: 1, misses: 2, size: 1 });
    });

    it('does not keep an answer with errors', async () => {
        const cached = withResponseCache(api);
        const broken = { query: '{ nothing }' };
        expect((await cached.run(broken, guest)).errors).toBeDefined();
        expect(cached.cache.size).toBe(0);
        await cached.run(broken, guest);
        expect(cached.cache.misses).toBe(2);
    });
});
