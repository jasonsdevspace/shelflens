import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { createResponseCache, withResponseCache } from './cache.js';
import { type CacheKey, cacheKey } from './cache-key.js';
import { createStore, type Viewer, viewerFromHeader } from './context.js';
import { createStoreApi, type StoreResponse } from './execute.js';
import { canonical, fingerprint } from './fingerprint.js';

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

interface ProductAnswer {
    readonly price: { readonly min: { readonly amount: number } };
}

const product = (response: StoreResponse): ProductAnswer | null => {
    if (response.errors) throw new Error(JSON.stringify(response.errors));
    return (response.data as { product: ProductAnswer | null }).product;
};

const price = (response: StoreResponse): number => {
    const answer = product(response);
    if (!answer) throw new Error('expected a product');
    return answer.price.min.amount;
};

describe('the cache key', () => {
    it('leaks a member price and a hidden product to a guest when it forgets the viewer', async () => {
        const naive: CacheKey = ({ request }) =>
            `${request.query}${JSON.stringify(request.variables ?? {})}`;
        const leaky = createResponseCache(api, {}, naive);
        const safe = withResponseCache(api);

        const priced = { query: PRODUCT, variables: { sku: discounted.sku } };
        const memberPrice = price(await leaky.run(priced, member));
        expect(price(await leaky.run(priced, guest))).toBe(memberPrice);
        expect(price(await safe.run(priced, member))).toBe(memberPrice);
        expect(price(await safe.run(priced, guest))).toBeGreaterThan(memberPrice);

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

    it('takes the whole viewer, so a field added later is in the key', () => {
        const request = { query: '{ store { name } }' };
        const richer = { ...guest, tier: 'gold' } as unknown as Viewer;
        expect(cacheKey({ version: '1', viewer: richer, request })).not.toBe(
            cacheKey({ version: '1', viewer: guest, request })
        );
    });

    it('writes a hole in an array as null rather than nothing', () => {
        expect(canonical([undefined, 1])).toBe('[null,1]');
        expect(canonical([undefined])).not.toBe(canonical([]));
        expect(canonical({ a: undefined })).toBe(canonical({}));
    });
});

describe('the store version', () => {
    const rule = { id: 'promo', when: { queries: ['jacket'] }, pin: [discounted.sku] };

    it('changes with the rules without being told, and holds when they are the same', () => {
        const plain = createStore({ catalog });
        const ruled = createStore({ catalog, rules: [rule] });
        const again = createStore({ catalog, rules: [{ ...rule }] });
        expect(ruled.version).not.toBe(plain.version);
        expect(again.version).toBe(ruled.version);
        expect(createStore({ catalog, rulesVersion: '7' }).version).toBe(
            `${catalog.version}+rules.7`
        );
    });

    it('gives a different key for the same request', () => {
        const request = { query: '{ store { name } }' };
        const ruled = createStoreApi(createStore({ catalog, rules: [rule] }));
        expect(cacheKey({ version: ruled.version, viewer: guest, request })).not.toBe(
            cacheKey({ version: api.version, viewer: guest, request })
        );
    });

    it('fingerprints a value by what it means, not how it is spelled', () => {
        expect(fingerprint({ b: 1, a: [1, 2] })).toBe(fingerprint({ a: [1, 2], b: 1 }));
        expect(fingerprint({ a: 1 })).not.toBe(fingerprint({ a: 2 }));
        expect(fingerprint([])).toMatch(/^[0-9a-f]{8}$/);
    });
});

describe('the response cache', () => {
    const request = { query: '{ search(input: { phrase: "boot" }) { total } }' };
    const at = (ms: number) => new Date(ms);

    /** An API whose answers wait until the test releases them. */
    const delayed = () => {
        const settle: ((response: StoreResponse) => void)[] = [];
        const clocks: Date[] = [];
        const stub = {
            ...api,
            run: (_request: unknown, _viewer: unknown, now?: Date) =>
                new Promise<StoreResponse>((resolve) => {
                    if (now) clocks.push(now);
                    settle.push(resolve);
                }),
        };
        return { stub, settle, clocks };
    };

    it('answers the second identical request from memory', async () => {
        const cached = withResponseCache(api);
        const first = await cached.run(request, guest);
        const second = await cached.run(request, guest);
        expect(second).toEqual(first);
        expect(cached.cache).toMatchObject({ hits: 1, misses: 1, size: 1 });
        await cached.run(request, member);
        expect(cached.cache).toMatchObject({ hits: 1, misses: 2, size: 2 });
    });

    it('shares one run between identical requests in flight, however long it takes', async () => {
        const { stub, settle } = delayed();
        const cached = withResponseCache(stub, { maxAgeMs: 1 });
        const first = cached.run(request, guest, at(0));
        const second = cached.run(request, guest, at(5000));
        expect(settle).toHaveLength(1);
        settle[0]?.({ data: { ok: true } });
        expect(await second).toEqual(await first);
        expect(cached.cache).toMatchObject({ hits: 1, misses: 1, size: 1 });
    });

    it('ages an answer from when it arrived, by the clock it was answered at', async () => {
        const { stub, settle, clocks } = delayed();
        const cached = withResponseCache(stub, { maxAgeMs: 1000 });
        const first = cached.run(request, guest, at(0));
        settle[0]?.({ data: { ok: true } });
        await first;
        await cached.run(request, guest, at(999));
        void cached.run(request, guest, at(1000));
        expect(cached.cache).toMatchObject({ hits: 1, misses: 2 });
        expect(clocks.map((clock) => clock.getTime())).toEqual([0, 1000]);

        void withResponseCache(stub).run(request, guest);
        expect(clocks[2]?.getTime()).toBeGreaterThan(0);
    });

    it('forgets an answer after its age, and the oldest when full', async () => {
        const cached = withResponseCache(api, { maxEntries: 2, maxAgeMs: 1000 });
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
        const second = { query: '{ store { name } }' };
        const third = { query: '{ categories { id } }' };

        await cached.run(request, guest, at(0));
        await cached.run(second, guest, at(0));
        await cached.run(request, guest, at(1000));
        await cached.run(third, guest, at(1000));
        await cached.run(request, guest, at(1000));

        expect(cached.cache).toMatchObject({ hits: 1, misses: 4, size: 2 });
    });

    it('does not let an evicted failure delete its replacement', async () => {
        const { stub, settle } = delayed();
        const cached = withResponseCache(stub, { maxEntries: 1 });
        const other = { query: '{ store { name } }' };

        const first = cached.run(request, guest, at(0));
        const evictor = cached.run(other, guest, at(0));
        const replacement = cached.run(request, guest, at(0));
        settle[0]?.({ errors: [{ message: 'old failure' }] });
        await first;
        settle[1]?.({ data: { other: true } });
        await evictor;
        settle[2]?.({ data: { ok: true } });
        await replacement;
        expect(await cached.run(request, guest, at(0))).toEqual({ data: { ok: true } });
        expect(cached.cache).toMatchObject({ hits: 1, misses: 3, size: 1 });
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
