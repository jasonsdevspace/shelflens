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

    it('is not kept when it is longer than any the page sends', async () => {
        const api = createStoreApi(store);
        const query = `${fresh()}${' '.repeat(KEPT_QUERY_LENGTH)}`;
        await api.run({ query }, guest, NOW);
        await api.run({ query }, guest, NOW);
        expect(parsed).toHaveBeenCalledTimes(2);
    });

    it('is still refused by tighter limits than the ones it passed', async () => {
        const query = `query Deep${String(serial)} { categories { id } search(input: {}) { items { product { brand { name } } } } }`;
        expect((await createStoreApi(store).run({ query }, guest, NOW)).errors).toBeUndefined();
        const tight = createStoreApi(store, { limits: { maxDepth: 2, maxFields: 200 } });
        const refused = await tight.run({ query }, guest, NOW);
        expect(refused.errors?.[0]?.extensions?.['code']).toBe('QUERY_TOO_DEEP');
    });

    it('is forgotten once enough newer ones have been kept, and read again', async () => {
        const api = createStoreApi(store);
        const first = fresh();
        await api.run({ query: first }, guest, NOW);
        for (let i = 0; i < KEPT_QUERIES; i += 1) await api.run({ query: fresh() }, guest, NOW);
        parsed.mockClear();
        await api.run({ query: first }, guest, NOW);
        expect(parsed).toHaveBeenCalledOnce();
    });
});
