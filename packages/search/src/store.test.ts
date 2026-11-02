import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it } from 'vitest';

import { toDocuments } from './documents.js';
import { createStoreEngine, mostRated, searchStore, SHOPPER_FACETS } from './store.js';

const catalog = generateCatalog({ seed: 42, products: 500 });
const engine = createStoreEngine(catalog);
const membersOnly = catalog.products.find(
    (product) => product.visibleTo.length === 1 && product.visibleTo[0] === 'member'
);
const discounted = catalog.products.find(
    (product) => product.price.member.min < product.price.guest.min
);

describe('documents', () => {
    it('makes one document per product, keyed by SKU', () => {
        const documents = toDocuments(catalog);
        expect(documents).toHaveLength(500);
        expect(documents[0]?.id).toBe(catalog.products[0]?.sku);
    });

    it('leaves the rating out of an unrated product', () => {
        const unrated = catalog.products.findIndex((product) => product.rating.count === 0);
        expect(unrated).toBeGreaterThanOrEqual(0);
        expect(toDocuments(catalog)[unrated]?.attributes.rating).toBeUndefined();
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
