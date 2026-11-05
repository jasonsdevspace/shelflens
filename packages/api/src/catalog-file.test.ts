// @vitest-environment node
import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import {
    CATALOG_ROW_CAP,
    contentVersion,
    parseCatalogFile,
    withContentVersion,
} from './catalog-file.js';

const SAMPLE: Catalog = withContentVersion(generateCatalog({ seed: 7, products: 40 }));
const [first] = SAMPLE.products;
if (!first) throw new Error('expected a product');

const [category, other] = SAMPLE.categories;
if (!category || !other) throw new Error('expected two categories');
if (first.variants.length < 2) throw new Error('expected a product with two variants');

/** The sample with its first product changed, and nothing else. */
const withProduct = (change: Record<string, unknown>): unknown => ({
    ...SAMPLE,
    products: [{ ...first, ...change }, ...SAMPLE.products.slice(1)],
});

/** The sample with one variant of its first product changed, and nothing else. */
const withVariant = (index: number, change: Record<string, unknown>): unknown =>
    withProduct({
        variants: first.variants.map((variant, at) =>
            at === index ? { ...variant, ...change } : variant
        ),
    });

/** The sample with its first category changed, and nothing else. */
const withCategory = (change: Record<string, unknown>): unknown => ({
    ...SAMPLE,
    categories: [{ ...category, ...change }, ...SAMPLE.categories.slice(1)],
});

describe('reading a catalog file', () => {
    it('accepts a whole catalog', () => {
        expect(parseCatalogFile(SAMPLE)).toBe(SAMPLE);
    });

    it('accepts the catalog the site ships, which its worker trusts without this check', () => {
        // The build writes the generator's default catalog, as JSON.
        const shipped: unknown = JSON.parse(JSON.stringify(generateCatalog()));
        expect(parseCatalogFile(shipped)).toEqual(shipped);
    });

    it.each([
        ['a catalog with no version', { ...SAMPLE, version: '' }, 'the catalog has no version'],
        ['a catalog with no seed', { ...SAMPLE, seed: '7' }, 'the catalog has no seed'],
        [
            'a lowercase currency',
            { ...SAMPLE, currency: 'usd' },
            'the catalog has no currency code',
        ],
        [
            'a catalog in another locale',
            { ...SAMPLE, locale: 'fr-FR' },
            'the catalog is not in the en-US locale',
        ],
        [
            'a catalog with no brands',
            { ...SAMPLE, brands: undefined },
            'the catalog needs brands, categories and products',
        ],
        [
            'a catalog with no categories',
            { ...SAMPLE, categories: undefined },
            'the catalog needs brands, categories and products',
        ],
        [
            'a catalog with no list of products',
            { ...SAMPLE, products: undefined },
            'the catalog needs brands, categories and products',
        ],
        [
            'a brand entry that is not one',
            { ...SAMPLE, brands: [...SAMPLE.brands, null] },
            'the catalog has a brand without its id and name',
        ],
        [
            'a category parent that is not an id',
            withCategory({ parentId: 7 }),
            'or a parent that is not an id',
        ],
        [
            'a category path through a category the catalog lacks',
            withCategory({ path: ['nope', ...category.path] }),
            "has a path that does not run through the catalog's categories to it",
        ],
        [
            'a category path that ends somewhere else',
            withCategory({ path: [...category.path, other.id] }),
            "has a path that does not run through the catalog's categories to it",
        ],
        [
            'a parent the catalog lacks',
            withCategory({ parentId: 'nope' }),
            'names a parent the catalog does not have',
        ],
        ['a catalog with no products', { ...SAMPLE, products: [] }, 'the catalog has no products'],
        [
            'a catalog past the cap',
            { ...SAMPLE, products: Array.from({ length: CATALOG_ROW_CAP + 1 }, () => first) },
            `past the cap of ${CATALOG_ROW_CAP}`,
        ],
        [
            'a product that is not an object',
            { ...SAMPLE, products: [null, ...SAMPLE.products.slice(1)] },
            'product 1 is not an object',
        ],
        ['a missing name', withProduct({ name: undefined }), 'product 1 has no name'],
        [
            'a visibleTo given as one group',
            withProduct({ visibleTo: 'guest' }),
            'product 1 has a visibleTo that is not a list of words',
        ],
        [
            'a word list holding a number',
            withProduct({ tags: [...first.tags, 7] }),
            'product 1 has a tags that is not a list of words',
        ],
        [
            'a product price that is not an object',
            withProduct({ price: 4999 }),
            'product 1 has no price for each group',
        ],
        [
            'a product with no member price',
            withProduct({ price: { guest: first.price.guest } }),
            'product 1 has no price for each group',
        ],
        ['a product with no rating', withProduct({ rating: undefined }), 'product 1 has no rating'],
        [
            'a rating with no count',
            withProduct({ rating: { average: first.rating.average } }),
            'product 1 has no rating',
        ],
        [
            'a product with no position',
            withProduct({ position: undefined }),
            'product 1 has no position',
        ],
        [
            'a group the store does not have',
            withProduct({ visibleTo: ['everyone'] }),
            'product 1 is visible to a group the store does not have, or to none',
        ],
        [
            'a product visible to nobody',
            withProduct({ visibleTo: [] }),
            'product 1 is visible to a group the store does not have, or to none',
        ],
        ['a product with no variants', withProduct({ variants: [] }), 'product 1 has no variants'],
        [
            'a variant that is not an object',
            withProduct({ variants: [7] }),
            'product 1 has a variant that is not an object',
        ],
        [
            'an empty variant',
            withProduct({ variants: [{}] }),
            'product 1 has a variant without its sku, color and size',
        ],
        [
            'a variant with no price',
            withVariant(0, { price: undefined }),
            'product 1 has a variant without its prices',
        ],
        [
            'a variant with no member price',
            withVariant(0, { memberPrice: undefined }),
            'product 1 has a variant without its prices',
        ],
        [
            'a variant that does not say whether it is in stock',
            withVariant(0, { inStock: undefined }),
            'product 1 has a variant that does not say whether it is in stock',
        ],
        [
            'a later variant that does not say whether it is in stock',
            withVariant(1, { inStock: undefined }),
            'product 1 has a variant that does not say whether it is in stock',
        ],
        [
            'a brand the catalog lacks',
            withProduct({ brandId: 'nobody' }),
            `product ${first.sku} names a brand the catalog does not have`,
        ],
        [
            'a leaf category the catalog lacks',
            withProduct({ categoryId: 'nowhere' }),
            `product ${first.sku} names a category the catalog does not have`,
        ],
        [
            'a category path through a category the catalog lacks, on a product',
            withProduct({ categoryPath: ['nowhere', ...first.categoryPath] }),
            `product ${first.sku} names a category the catalog does not have`,
        ],
        [
            'a leaf that is not the end of its path',
            withProduct({ categoryId: first.categoryPath[0] }),
            `product ${first.sku} has a category that is not the last of its path`,
        ],
    ])('refuses %s, saying what is wrong', (_, catalog, reason) => {
        expect(() => parseCatalogFile(catalog)).toThrow(reason);
    });

    it('accepts a catalog of exactly as many products as the cap', () => {
        const products = Array.from({ length: CATALOG_ROW_CAP }, (_, i) => ({
            ...first,
            sku: `SL-${String(i).padStart(5, '0')}`,
        }));
        expect(parseCatalogFile({ ...SAMPLE, products }).products).toHaveLength(CATALOG_ROW_CAP);
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
            contentVersion({ ...SAMPLE, categories: SAMPLE.categories.slice(1) }),
            contentVersion({ ...SAMPLE, products: SAMPLE.products.slice(1) }),
        ]);
        expect(versions.size).toBe(5);
    });

    it('replaces whatever version a catalog claims', () => {
        expect(withContentVersion({ ...SAMPLE, version: 'claimed' }).version).toBe(SAMPLE.version);
    });
});
