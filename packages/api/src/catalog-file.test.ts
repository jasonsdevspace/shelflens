// @vitest-environment node
import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { contentVersion, parseCatalogFile, withContentVersion } from './catalog-file.js';

const SAMPLE: Catalog = withContentVersion(generateCatalog({ seed: 7, products: 40 }));
const [first] = SAMPLE.products;
if (!first) throw new Error('expected a product');

const withProduct = (change: Record<string, unknown>): unknown => ({
    ...SAMPLE,
    products: [{ ...first, ...change }, ...SAMPLE.products.slice(1)],
});

describe('reading a catalog file', () => {
    it('accepts a whole catalog', () => {
        expect(parseCatalogFile(SAMPLE)).toBe(SAMPLE);
    });

    it.each([
        ['a missing name', withProduct({ name: undefined }), 'product 1 has no name'],
        [
            'a variant with no prices',
            withProduct({ variants: [{ sku: 'a', color: '', size: '' }] }),
            'product 1 has a variant without its prices',
        ],
        [
            'an empty variant',
            withProduct({ variants: [{}] }),
            'product 1 has a variant without its sku, color and size',
        ],
        [
            'a group the store does not have',
            withProduct({ visibleTo: ['everyone'] }),
            'product 1 is visible to a group the store does not have, or to none',
        ],
        [
            'a leaf category the catalog lacks',
            withProduct({ categoryId: 'nowhere' }),
            `product ${first.sku} names a category the catalog does not have`,
        ],
        [
            'a leaf that is not the end of its path',
            withProduct({ categoryId: first.categoryPath[0] }),
            `product ${first.sku} has a category that is not the last of its path`,
        ],
        [
            'a brand entry that is not one',
            { ...SAMPLE, brands: [null] },
            'the catalog has a brand without its id and name',
        ],
        [
            'a lowercase currency',
            { ...SAMPLE, currency: 'usd' },
            'the catalog has no currency code',
        ],
    ])('refuses %s, saying what is wrong', (_, catalog, reason) => {
        expect(() => parseCatalogFile(catalog)).toThrow(reason);
    });

    it('refuses a sku on two products', () => {
        const repeated = { ...SAMPLE, products: [first, first] };
        expect(() => parseCatalogFile(repeated)).toThrow(
            `the sku ${first.sku} is on more than one product`
        );
    });
});

describe('the version of a catalog', () => {
    it('comes from its content, the same when only the load time differs', () => {
        const later = {
            ...SAMPLE,
            products: SAMPLE.products.map((product) => ({
                ...product,
                createdAt: '2027-01-01T00:00:00Z',
            })),
        };
        expect(contentVersion(later)).toBe(contentVersion(SAMPLE));
        expect(SAMPLE.version).toBe(contentVersion(SAMPLE));
    });

    it('moves with any change to products, brands, categories or currency', () => {
        const versions = new Set([
            contentVersion(SAMPLE),
            contentVersion({ ...SAMPLE, currency: 'EUR' }),
            contentVersion({ ...SAMPLE, brands: SAMPLE.brands.slice(1) }),
            contentVersion({ ...SAMPLE, products: SAMPLE.products.slice(1) }),
        ]);
        expect(versions.size).toBe(4);
    });

    it('replaces whatever version a catalog claims', () => {
        expect(withContentVersion({ ...SAMPLE, version: 'claimed' }).version).toBe(SAMPLE.version);
    });
});
