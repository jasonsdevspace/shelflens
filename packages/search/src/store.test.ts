import { type Catalog, generateCatalog, type Product } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { toDocuments } from './documents.js';
import {
    createStoreEngine,
    mostRated,
    recoverStore,
    searchStore,
    SHOPPER_FACETS,
} from './store.js';

const catalog = generateCatalog({ seed: 42, products: 500 });
const engine = createStoreEngine(catalog);
const membersOnly = catalog.products.find(
    (product) => product.visibleTo.length === 1 && product.visibleTo[0] === 'member'
);
const discounted = catalog.products.find(
    (product) => product.price.member.min < product.price.guest.min
);

/**
 * A product of plain words in every field but its category, so a test that gives it one word
 * knows which field matched.
 */
const plain = (sku: string, fields: Partial<Product>): Product => {
    const base = catalog.products[0];
    if (!base) throw new Error('the catalog should have products');
    return {
        ...base,
        sku,
        name: 'Plain Item',
        brand: 'Acme',
        colors: ['gray'],
        material: 'Cotton',
        tags: [],
        description: 'Made to last.',
        visibleTo: ['guest', 'member'],
        ...fields,
    };
};
const storeOf = (products: Product[]): Catalog => ({ ...catalog, products });
const priced = (sku: string, cents: number): Product =>
    plain(sku, {
        price: { guest: { min: cents, max: cents }, member: { min: cents, max: cents } },
    });

describe('documents', () => {
    it('makes one document per product, keyed by SKU', () => {
        const documents = toDocuments(catalog);
        expect(documents).toHaveLength(500);
        expect(documents[0]?.id).toBe(catalog.products[0]?.sku);
    });

    it('counts a product in stock when any one of its variants is', () => {
        const variant = catalog.products[0]?.variants[0];
        if (!variant) throw new Error('the first product should have a variant');
        const inStock = (...stock: boolean[]) => {
            const variants = stock.map((each, i) => ({ ...variant, sku: `v${i}`, inStock: each }));
            return toDocuments(storeOf([plain('p1', { variants })]))[0]?.attributes['inStock'];
        };
        expect(inStock(false, true)).toBe(true);
        expect(inStock(false, false)).toBe(false);
    });

    it('leaves the rating out of an unrated product', () => {
        const unrated = catalog.products.findIndex((product) => product.rating.count === 0);
        expect(unrated).toBeGreaterThanOrEqual(0);
        expect(toDocuments(catalog)[unrated]?.attributes['rating']).toBeUndefined();
    });
});

describe('the text a search reads', () => {
    it('ranks a match in the name above the same word in the brand', () => {
        const small = createStoreEngine(
            storeOf([
                plain('by-brand', { name: 'Summit', brand: 'Lumen' }),
                plain('by-name', { name: 'Lumen', brand: 'Ostara' }),
            ])
        );
        const { hits } = searchStore(small, { group: 'guest', query: 'lumen' });
        expect(hits.map((hit) => hit.id)).toEqual(['by-name', 'by-brand']);
    });

    it('finds a product by its material alone', () => {
        const small = createStoreEngine(
            storeOf([plain('merino', { material: 'Merino' }), plain('other', {})])
        );
        const { hits } = searchStore(small, { group: 'guest', query: 'merino' });
        expect(hits.map((hit) => hit.id)).toEqual(['merino']);
    });

    it('finds a product by the name of its category', () => {
        const shelved = plain('p1', {});
        // Hearthside is in no id and no other field, so only the category's name can match it.
        const renamed: Catalog = {
            ...storeOf([shelved, plain('p2', { categoryPath: [] })]),
            categories: catalog.categories.map((category) =>
                category.id === shelved.categoryId ? { ...category, name: 'Hearthside' } : category
            ),
        };
        const { hits } = searchStore(createStoreEngine(renamed), {
            group: 'guest',
            query: 'hearthside',
        });
        expect(hits.map((hit) => hit.id)).toEqual(['p1']);
    });
});

describe('price bands', () => {
    it('counts each price in exactly one band, with no gap where two bands meet', () => {
        const prices = [4999, 5000, 9999, 10000, 19999, 20000];
        const small = createStoreEngine(storeOf(prices.map((cents) => priced(`p${cents}`, cents))));
        const [facet] = searchStore(small, { group: 'guest', facets: ['price'] }).facets;
        if (facet?.kind !== 'range') throw new Error('expected a range facet');
        expect(facet.buckets.map((bucket) => bucket.count)).toEqual([1, 2, 2, 1]);
    });
});

describe('the words a shopper may use for one thing', () => {
    it.each([
        ['sneakers', 'trainers'],
        ['sweater', 'jumper'],
        ['sweater', 'pullover'],
        ['jumper', 'pullover'],
        ['trousers', 'pants'],
        ['t-shirt', 'tee'],
        ['jacket', 'coat'],
    ])('finds a product named with %s when the shopper types %s, and the other way', (one, two) => {
        const small = createStoreEngine(
            storeOf([plain('p1', { name: `Plain ${one}` }), plain('p2', { name: `Plain ${two}` })])
        );
        for (const word of [one, two]) {
            const { hits } = searchStore(small, { group: 'guest', query: word });
            expect(hits.map((hit) => hit.id).sort()).toEqual(['p1', 'p2']);
        }
    });
});

describe('sorting by position', () => {
    const category = catalog.products[0]?.categoryId ?? '';
    const positionOf = new Map(catalog.products.map((product) => [product.sku, product.position]));

    it('sorts a category browsed with no query by its position', () => {
        const result = searchStore(engine, {
            group: 'guest',
            filters: [{ attribute: 'category', eq: category }],
            pageSize: 100,
        });
        expect(result.sort).toEqual([{ by: 'position', direction: 'asc' }]);
        const positions = result.hits.map((hit) => positionOf.get(hit.id) ?? Number.NaN);
        expect(positions.length).toBeGreaterThan(1);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });

    it('sorts by position only while a category is browsed', () => {
        const sort = [{ by: 'position', direction: 'asc' }] as const;
        const browsing = searchStore(engine, {
            group: 'guest',
            filters: [{ attribute: 'category', eq: category }],
            sort,
        });
        const everywhere = searchStore(engine, { group: 'guest', sort });
        expect(browsing.sort).toEqual(sort);
        expect(everywhere.sort).toEqual([{ by: 'relevance', direction: 'desc' }]);
    });
});

describe('customer groups', () => {
    it('shows a members-only product to members and not to guests', () => {
        if (!membersOnly) throw new Error('the catalog should have one members-only product');
        const word = membersOnly.name.split(' ').slice(-1)[0] ?? '';
        const asMember = searchStore(engine, { group: 'member', query: word, pageSize: 100 });
        const asGuest = searchStore(engine, { group: 'guest', query: word, pageSize: 100 });
        expect(asMember.hits.map((h) => h.id)).toContain(membersOnly.sku);
        expect(asGuest.hits.map((h) => h.id)).not.toContain(membersOnly.sku);
        expect(asGuest.total).toBe(asMember.total - 1);
    });

    it('filters, sorts and facets price by the group', () => {
        if (!discounted) throw new Error('the catalog should have a discounted product');
        const cheaperFor = (group: 'guest' | 'member') =>
            searchStore(engine, {
                group,
                filters: [{ attribute: 'price', range: { to: discounted.price.guest.min } }],
                pageSize: 500,
            }).hits.map((h) => h.id);
        // Below its guest price, the product shows only at the member price.
        expect(cheaperFor('guest')).not.toContain(discounted.sku);
        expect(cheaperFor('member')).toContain(discounted.sku);

        const sorted = searchStore(engine, {
            group: 'member',
            sort: [{ by: 'price', direction: 'asc' }],
            pageSize: 3,
        });
        expect(sorted.sort).toEqual([{ by: 'price', direction: 'asc' }]);
        const facetNames = sorted.facets.map((facet) => facet.name);
        expect(facetNames).toEqual([...SHOPPER_FACETS]);
    });

    it("names the price facets for the shopper, never by the group's own price attribute", () => {
        const { facets } = searchStore(engine, {
            group: 'member',
            facets: ['price', 'priceStats'],
        });
        expect(facets.map(({ name, attribute, kind }) => ({ name, attribute, kind }))).toEqual([
            { name: 'price', attribute: 'price', kind: 'range' },
            { name: 'priceStats', attribute: 'price', kind: 'stats' },
        ]);
    });

    it('counts facets within what the group may see', () => {
        if (!membersOnly) throw new Error('the catalog should have one members-only product');
        const count = (group: 'guest' | 'member') =>
            searchStore(engine, {
                group,
                filters: [{ attribute: 'category', eq: membersOnly.categoryId }],
                facets: ['brand'],
            }).facets[0];
        const guest = count('guest');
        const member = count('member');
        const total = (facet: typeof guest) =>
            facet?.kind === 'keyword' ? facet.buckets.reduce((sum, b) => sum + b.count, 0) : 0;
        expect(total(member)).toBe(total(guest) + 1);
    });
});

describe('recovering in the store', () => {
    // A filter nothing passes, so recovery counts what the phrase finds without it.
    const nowhere = { attribute: 'brand', eq: 'Nobody' };

    it('counts only what the group may see', () => {
        if (!membersOnly) throw new Error('the catalog should have one members-only product');
        const word = membersOnly.name.split(' ').slice(-1)[0] ?? '';
        const found = (group: 'guest' | 'member') =>
            recoverStore(engine, { group, query: word, filters: [nowhere] }).foundWithoutFilters;
        expect(found('guest')).toBe(found('member') - 1);
    });

    it('keeps a filter on an attribute named as fixed, such as the category being browsed', () => {
        const browsed = catalog.products[0];
        if (!browsed) throw new Error('the catalog should have products');
        const inCategory = { attribute: 'category', eq: browsed.categoryId };
        const everywhere = searchStore(engine, { group: 'guest', query: browsed.brand }).total;
        const there = searchStore(engine, {
            group: 'guest',
            query: browsed.brand,
            filters: [inCategory],
        }).total;
        expect(there).toBeLessThan(everywhere);
        const recovery = recoverStore(
            engine,
            { group: 'guest', query: browsed.brand, filters: [inCategory, nowhere] },
            ['category']
        );
        expect(recovery.foundWithoutFilters).toBe(there);
    });

    it("reads a price filter at the group's price", () => {
        if (!discounted) throw new Error('the catalog should have a discounted product');
        const word = discounted.name.split(' ').slice(-1)[0] ?? '';
        const filters = [{ attribute: 'price', range: { to: discounted.price.guest.min } }];
        // The first word finds nothing, so what is left is counted under the price filter.
        const relaxed = (group: 'guest' | 'member') =>
            recoverStore(engine, { group, query: `xqzv ${word}`, filters }).relaxed?.total ?? 0;
        const searched = (group: 'guest' | 'member') =>
            searchStore(engine, { group, query: word, filters }).total;
        expect(relaxed('guest')).toBe(searched('guest'));
        expect(relaxed('member')).toBe(searched('member'));
        expect(relaxed('member')).toBeGreaterThan(relaxed('guest'));
    });
});

describe('the most rated', () => {
    const ratingOf = (id: string) => {
        const product = catalog.products.find((p) => p.sku === id);
        return [product?.rating.count ?? 0, product?.rating.average ?? 0] as const;
    };

    it('lists by how many ratings, then by the rating among equals, up to the limit', () => {
        const { hits } = mostRated(engine, { group: 'member', limit: 12 });
        expect(hits).toHaveLength(12);
        const ratings = hits.map((hit) => ratingOf(hit.id));
        for (let i = 1; i < ratings.length; i += 1) {
            const [count, average] = ratings[i] ?? [0, 0];
            const [countBefore, averageBefore] = ratings[i - 1] ?? [0, 0];
            expect(count <= countBefore).toBe(true);
            if (count === countBefore) expect(average <= averageBefore).toBe(true);
        }
    });

    it('puts the higher rated first among products with the same number of ratings', () => {
        const tied = [3, 4, 4.5].map((average, i) =>
            plain(`p${i}`, { rating: { count: 100, average } })
        );
        const { hits } = mostRated(createStoreEngine(storeOf(tied)), { group: 'guest', limit: 3 });
        expect(hits.map((hit) => hit.id)).toEqual(['p2', 'p1', 'p0']);
    });

    it('keeps to the place asked for, and never lists what the group may not see', () => {
        const category = catalog.products[0]?.categoryId ?? '';
        const { hits } = mostRated(engine, {
            group: 'guest',
            filters: [{ attribute: 'category', eq: category }],
            limit: 50,
        });
        expect(hits.length).toBeGreaterThan(0);
        for (const hit of hits) {
            const product = catalog.products.find((p) => p.sku === hit.id);
            expect(product?.categoryId).toBe(category);
            expect(product?.visibleTo).toContain('guest');
        }
    });
});
