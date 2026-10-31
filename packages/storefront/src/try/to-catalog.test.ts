// @vitest-environment node
import { createStore, createStoreApi, viewerFromHeader } from '@shelflens/api';
import { describe, expect, it } from 'vitest';

import { parseCsv, type Table } from './csv.js';
import { CATALOG_ROW_CAP } from './limits.js';
import { guessMapping, type Mapping } from './mapping.js';
import { SAMPLE_PRODUCTS, sampleCsv } from './sample.js';
import { DEFAULT_BRAND, DEFAULT_CATEGORY, type LoadResult, toCatalog } from './to-catalog.js';

const NOW = new Date('2026-10-31T12:00:00Z');
const MINIMAL: Mapping = { name: 'name', price: 'price' };

const loaded = (result: LoadResult) => {
    if (!result.ok) throw new Error(result.error);
    return result;
};

const one = (csv: string, mapping: Mapping = MINIMAL) =>
    loaded(toCatalog(parseCsv(csv), mapping, NOW));

describe('rows to a catalog', () => {
    it('turns the sample file into a catalog with every product', () => {
        const table = parseCsv(sampleCsv());
        const { catalog, skipped } = loaded(toCatalog(table, guessMapping(table), NOW));
        expect(catalog.products).toHaveLength(SAMPLE_PRODUCTS);
        expect(skipped).toEqual([]);
        expect(catalog.currency).toBe('USD');
        expect(catalog.products[0]).toMatchObject({
            sku: 'SL-00001',
            visibleTo: ['guest', 'member'],
        });
    });

    it('builds a store that answers a search, a filter count and a member price from the sample', async () => {
        const table = parseCsv(sampleCsv());
        const { catalog, memberPrices } = loaded(toCatalog(table, guessMapping(table), NOW));
        expect(memberPrices).toBe(true);
        const api = createStoreApi(createStore({ catalog }));
        const response = await api.run(
            {
                query: `{ search(input: { phrase: "bag" }) { total items { product { name } }
                    facets { attribute ... on ValueFacet { buckets { value count } } } } }`,
            },
            viewerFromHeader(undefined)
        );
        expect(response.errors).toBeUndefined();
        const search = (
            response.data as {
                search: { total: number; facets: { attribute: string; buckets?: unknown[] }[] };
            }
        ).search;
        expect(search.total).toBeGreaterThan(0);
        expect(
            search.facets.find((facet) => facet.attribute === 'BRAND')?.buckets?.length
        ).toBeGreaterThan(0);
    });

    it('gives a product with only a name and a price the stated defaults', () => {
        const [product] = one('name,price\nBoot,$12.50\n').catalog.products;
        expect(product).toMatchObject({
            sku: 'ROW-000001',
            brand: DEFAULT_BRAND,
            categoryPath: ['all-products'],
            colors: [],
            sizes: [],
            material: '',
            price: { guest: { min: 1250, max: 1250 }, member: { min: 1250, max: 1250 } },
            rating: { average: 0, count: 0 },
            visibleTo: ['guest', 'member'],
            position: 1,
            createdAt: NOW.toISOString(),
        });
        expect(product?.variants).toEqual([
            {
                sku: 'ROW-000001-1',
                color: '',
                size: '',
                price: 1250,
                memberPrice: 1250,
                inStock: true,
            },
        ]);
        expect(one('name,price\nBoot,1\n').catalog.categories).toEqual([
            { id: 'all-products', name: DEFAULT_CATEGORY, path: ['all-products'] },
        ]);
    });

    it('reports no member prices when every member pays the guest price', () => {
        expect(one('name,price\nBoot,1\n').memberPrices).toBe(false);
    });

    it('builds every level of a category path, with each level knowing its parent', () => {
        const { catalog } = one(
            'name,price,cat\nBoot,1,Shoes > Running\nHat,1,Shoes > Running\nCap,1,Shoes\n',
            {
                ...MINIMAL,
                category: 'cat',
            }
        );
        expect(catalog.categories).toEqual([
            { id: 'shoes', name: 'Shoes', path: ['shoes'] },
            {
                id: 'shoes-running',
                name: 'Running',
                path: ['shoes', 'shoes-running'],
                parentId: 'shoes',
            },
        ]);
        expect(catalog.products.map((product) => [product.categoryId, product.position])).toEqual([
            ['shoes-running', 1],
            ['shoes-running', 2],
            ['shoes', 1],
        ]);
    });

    it('splits lists, keeps search only columns as words, and reads stock and ratings', () => {
        const [product] = one(
            'name,price,colors,notes,stock,stars,reviews\nBoot,1,"Black, Navy",trail|waterproof,0,4.5,12\n',
            {
                ...MINIMAL,
                colors: 'colors',
                searchOnly: ['notes'],
                inStock: 'stock',
                rating: 'stars',
                ratingCount: 'reviews',
            }
        ).catalog.products;
        expect(product).toMatchObject({
            colors: ['Black', 'Navy'],
            tags: ['trail', 'waterproof'],
            rating: { average: 4.5, count: 12 },
        });
        expect(product?.variants[0]?.inStock).toBe(false);
    });

    it('leaves out a row with no name or no readable price, and names it as a spreadsheet would', () => {
        const result = one('name,price\nBoot,1\n,2\nHat,free\n');
        expect(result.catalog.products.map((product) => product.name)).toEqual(['Boot']);
        expect(result.skipped).toEqual([
            { row: 3, reason: 'it has no name' },
            { row: 4, reason: 'its price, "free", is not a price' },
        ]);
    });

    it('takes the currency most prices are written in', () => {
        expect(one('name,price\nBoot,€10\nHat,€5\nCap,$1\n').catalog.currency).toBe('EUR');
    });

    it('refuses a file whose ids repeat, naming both rows', () => {
        const result = toCatalog(
            parseCsv('id,name,price\nA,Boot,1\nB,Hat,1\nA,Cap,1\n'),
            { ...MINIMAL, id: 'id' },
            NOW
        );
        expect(result).toEqual({
            ok: false,
            error: 'The id "A" is on rows 2 and 4, and each product needs its own.',
        });
    });

    it('refuses a file past the row cap, saying how many rows it has', () => {
        const table: Table = {
            headers: ['name', 'price'],
            rows: Array.from({ length: CATALOG_ROW_CAP + 1 }, (_, index) => [`Item ${index}`, '1']),
        };
        const result = toCatalog(table, MINIMAL, NOW);
        expect(result.ok).toBe(false);
        expect(!result.ok && result.error).toBe(
            'This file has 10,001 products, and the limit is 10,000.'
        );
    });

    it('needs a name and a price column, and at least one readable row', () => {
        const table = parseCsv('name,price\nBoot,1\n');
        expect(toCatalog(table, { price: 'price' }, NOW)).toMatchObject({ ok: false });
        expect(toCatalog(table, { name: 'name' }, NOW)).toMatchObject({ ok: false });
        expect(toCatalog(parseCsv('name,price\n,1\n'), MINIMAL, NOW)).toMatchObject({
            ok: false,
            error: 'No row in this file could be read as a product.',
        });
    });

    it('versions the catalog by its content, the same for the same file and different for another', () => {
        const first = one('name,price\nBoot,1\n').catalog.version;
        const again = loaded(
            toCatalog(parseCsv('name,price\nBoot,1\n'), MINIMAL, new Date('2027-01-01'))
        ).catalog.version;
        expect(again).toBe(first);
        expect(one('name,price\nBoot,2\n').catalog.version).not.toBe(first);
        expect(first).toMatch(/^try-[0-9a-f]{8}$/);
    });
});
