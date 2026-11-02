import { describe, expect, it } from 'vitest';

import { generateCatalog, slugify } from './generate.js';
import { createRandom } from './random.js';
import { CUSTOMER_GROUPS } from './types.js';

const catalog = generateCatalog({ seed: 42, products: 500 });

describe('determinism', () => {
    it('produces the same catalog from the same seed', () => {
        expect(generateCatalog({ seed: 42, products: 500 })).toEqual(catalog);
    });

    it('produces a different catalog from a different seed', () => {
        const other = generateCatalog({ seed: 43, products: 500 });
        expect(other.products[0]?.name).not.toBe(catalog.products[0]?.name);
        expect(other.version).not.toBe(catalog.version);
    });

    it('names its version after the generator, the seed and the size', () => {
        expect(catalog.version).toBe('2-42-500');
    });

    it('gives the same random sequence on every call with one seed', () => {
        const source = createRandom(9);
        const first = Array.from({ length: 5 }, () => source.next());
        const again = createRandom(9);
        expect(first.map(() => again.next())).toEqual(first);
        expect(new Set(first).size).toBe(5);
    });
});

describe('the products', () => {
    it('makes as many as asked for, with unique SKUs and names', () => {
        expect(catalog.products).toHaveLength(500);
        expect(new Set(catalog.products.map((p) => p.sku)).size).toBe(500);
        expect(new Set(catalog.products.map((p) => p.name)).size).toBe(500);
    });

    it('refuses a size that makes no sense', () => {
        expect(() => generateCatalog({ products: 0 })).toThrow(/positive integer/);
    });

    it('places every product in a leaf category that exists', () => {
        const ids = new Set(catalog.categories.map((c) => c.id));
        for (const product of catalog.products) {
            expect(ids.has(product.categoryId)).toBe(true);
            expect(product.categoryPath).toHaveLength(2);
            expect(product.categoryPath[1]).toBe(product.categoryId);
            expect(ids.has(product.categoryPath[0] ?? '')).toBe(true);
        }
    });

    it('gives every product at least one variant, with prices in cents', () => {
        for (const product of catalog.products) {
            expect(product.variants.length).toBeGreaterThan(0);
            for (const variant of product.variants) {
                expect(Number.isInteger(variant.price)).toBe(true);
                expect(variant.price).toBeGreaterThan(0);
                expect(variant.memberPrice).toBeLessThanOrEqual(variant.price);
            }
        }
    });

    it('derives each price range from the variants, per customer group', () => {
        for (const product of catalog.products) {
            for (const group of CUSTOMER_GROUPS) {
                const prices = product.variants.map((v) =>
                    group === 'member' ? v.memberPrice : v.price
                );
                expect(product.price[group]).toEqual({
                    min: Math.min(...prices),
                    max: Math.max(...prices),
                });
            }
        }
    });

    it('includes products whose price is a range, not a single number', () => {
        const ranged = catalog.products.filter((p) => p.price.guest.min !== p.price.guest.max);
        expect(ranged.length).toBeGreaterThan(0);
    });

    it('gives members a lower price on some products and the same price on others', () => {
        const cheaper = catalog.products.filter((p) => p.price.member.min < p.price.guest.min);
        const same = catalog.products.filter((p) => p.price.member.min === p.price.guest.min);
        expect(cheaper.length).toBeGreaterThan(0);
        expect(same.length).toBeGreaterThan(0);
    });

    it('makes exactly one product visible to members only', () => {
        const membersOnly = catalog.products.filter(
            (p) => p.visibleTo.length === 1 && p.visibleTo[0] === 'member'
        );
        expect(membersOnly).toHaveLength(1);
    });

    it('keeps ratings between 1 and 5, or zero when nobody has rated', () => {
        for (const { rating } of catalog.products) {
            if (rating.count === 0) expect(rating.average).toBe(0);
            else {
                expect(rating.average).toBeGreaterThanOrEqual(1);
                expect(rating.average).toBeLessThanOrEqual(5);
            }
        }
        expect(catalog.products.some((p) => p.rating.count === 0)).toBe(true);
    });

    it('numbers positions uniquely within each category', () => {
        const byCategory = new Map<string, number[]>();
        for (const product of catalog.products) {
            byCategory.set(product.categoryId, [
                ...(byCategory.get(product.categoryId) ?? []),
                product.position,
            ]);
        }
        for (const positions of byCategory.values()) {
            expect(new Set(positions).size).toBe(positions.length);
            expect(Math.max(...positions)).toBe(positions.length);
        }
    });

    it('includes the names that exercise normalization', () => {
        const names = catalog.products.map((p) => p.name);
        expect(names.some((name) => name.includes('Café'))).toBe(true);
        expect(names.some((name) => name.includes('T-Shirt'))).toBe(true);
    });
});

describe('slugify', () => {
    it('folds accents, ampersands and punctuation into a plain identifier', () => {
        expect(slugify('Harbor & Pine')).toBe('harbor-and-pine');
        expect(slugify('Café Racer Jacket')).toBe('cafe-racer-jacket');
        expect(slugify('  Quarter-Zip ')).toBe('quarter-zip');
    });
});
