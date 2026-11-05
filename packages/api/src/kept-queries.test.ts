import { generateCatalog } from '@shelflens/catalog';
import { parse } from 'graphql';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createStoreApi, KEPT_QUERIES, KEPT_QUERY_LENGTH } from './execute.js';
import { viewerFromHeader } from './http.js';
import { createStore } from './store.js';

/** When every request in this file arrives. */
const NOW = new Date('2026-11-01T12:00:00Z');

/*
 * The API keeps each query it has parsed and validated, so the operations a
 * page sends all visit are read once, by every store built while it runs.
 */

vi.mock('graphql', async (actual) => {
    const graphql = await actual<typeof import('graphql')>();
    return { ...graphql, parse: vi.fn(graphql.parse) };
});

const store = createStore({ catalog: generateCatalog({ seed: 42, products: 50 }), rules: [] });
const guest = viewerFromHeader(undefined);
const parsed = vi.mocked(parse);

/** A query no other test sends, so what this file keeps never answers for another. */
let serial = 0;
const fresh = () => {
    serial += 1;
    return `query Q${String(serial)} { store { name } }`;
};

beforeEach(() => {
    parsed.mockClear();
});

describe('a query the API has seen', () => {
    it('is parsed once, by this store and by one built after it', async () => {
        const query = fresh();
        const first = await createStoreApi(store).run({ query }, guest, NOW);
        const again = await createStoreApi(store).run({ query }, guest, NOW);
        expect(again).toEqual(first);
        expect(first.data).toBeDefined();
        expect(parsed).toHaveBeenCalledOnce();
    });

    it('is not kept when it fails validation, and fails the same way each time', async () => {
        const api = createStoreApi(store);
        const query = `query Broken${String(serial)} { store { nothing } }`;
        const first = await api.run({ query }, guest, NOW);
        expect(first.errors?.[0]?.extensions?.['code']).toBe('GRAPHQL_VALIDATION_FAILED');
        expect(await api.run({ query }, guest, NOW)).toEqual(first);
        expect(parsed).toHaveBeenCalledTimes(2);
    });

    it('is shared by stores given equal limits, however each was written', async () => {
        const query = fresh();
        await createStoreApi(store, { limits: { maxDepth: 8, maxFields: 200 } }).run(
            { query },
            guest,
            NOW
        );
        await createStoreApi(store, { limits: { maxDepth: 8, maxFields: 200 } }).run(
            { query },
            guest,
            NOW
        );
        expect(parsed).toHaveBeenCalledOnce();
    });

    it('is kept at exactly its longest length and not kept one character longer', async () => {
        const api = createStoreApi(store);
        const padded = (length: number) => {
            const query = fresh();
            return `${query}${' '.repeat(length - query.length)}`;
        };
        const longest = padded(KEPT_QUERY_LENGTH);
        await api.run({ query: longest }, guest, NOW);
        await api.run({ query: longest }, guest, NOW);
        expect(parsed).toHaveBeenCalledOnce();
        parsed.mockClear();
        const longer = padded(KEPT_QUERY_LENGTH + 1);
        await api.run({ query: longer }, guest, NOW);
        await api.run({ query: longer }, guest, NOW);
        expect(parsed).toHaveBeenCalledTimes(2);
    });

    it('is still refused by tighter limits than the ones it passed', async () => {
        const query = `query Deep${String(serial)} { categories { id } search(input: {}) { items { product { brand { name } } } } }`;
        expect((await createStoreApi(store).run({ query }, guest, NOW)).errors).toBeUndefined();
        const tight = createStoreApi(store, { limits: { maxDepth: 2, maxFields: 200 } });
        const refused = await tight.run({ query }, guest, NOW);
        expect(refused.errors?.[0]?.extensions?.['code']).toBe('QUERY_TOO_DEEP');
    });

    it('is still refused by a tighter field limit than the one it passed', async () => {
        const query = `query Wide${String(serial)} { store { name currency } }`;
        expect((await createStoreApi(store).run({ query }, guest, NOW)).errors).toBeUndefined();
        const tight = createStoreApi(store, { limits: { maxDepth: 8, maxFields: 2 } });
        const refused = await tight.run({ query }, guest, NOW);
        expect(refused.errors?.[0]?.extensions?.['code']).toBe('QUERY_TOO_WIDE');
    });

    it('holds exactly its bound, and forgets the oldest when one more is kept', async () => {
        const api = createStoreApi(store);
        const queries = Array.from({ length: KEPT_QUERIES + 1 }, fresh);
        for (const query of queries) await api.run({ query }, guest, NOW);
        parsed.mockClear();
        await api.run({ query: queries[1] ?? '' }, guest, NOW);
        expect(parsed).not.toHaveBeenCalled();
        await api.run({ query: queries[0] ?? '' }, guest, NOW);
        expect(parsed).toHaveBeenCalledOnce();
    });

    it('moves to the newest end when used, so the oldest unused is forgotten first', async () => {
        const api = createStoreApi(store);
        const queries = Array.from({ length: KEPT_QUERIES }, fresh);
        for (const query of queries) await api.run({ query }, guest, NOW);
        const [first = '', second = ''] = queries;
        await api.run({ query: first }, guest, NOW);
        await api.run({ query: fresh() }, guest, NOW);
        parsed.mockClear();
        await api.run({ query: first }, guest, NOW);
        expect(parsed).not.toHaveBeenCalled();
        await api.run({ query: second }, guest, NOW);
        expect(parsed).toHaveBeenCalledOnce();
    });
});
