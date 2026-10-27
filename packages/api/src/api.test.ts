import { generateCatalog } from '@shelflens/catalog';
import { beforeAll, describe, expect, it } from 'vitest';

import { createStore, viewerFromHeader } from './context.js';
import { createStoreApi, type StoreApi, type StoreResponse } from './execute.js';

/*
 * The API as a client sees it: a query in, data or errors out.
 *
 * The engine's and the store package's behavior is tested where it lives.
 * These cover what the API adds: the translation of the schema's words,
 * the viewer, the limits, and the shape of an error.
 */

const catalog = generateCatalog({ seed: 42, products: 500 });
let api: StoreApi;

beforeAll(() => {
    api = createStoreApi(
        createStore({
            catalog,
            rules: [
                {
                    id: 'promo',
                    when: { queries: ['jacket'] },
                    pin: [catalog.products[3]?.sku ?? ''],
                },
            ],
        })
    );
});

const guest = viewerFromHeader(undefined);
const member = viewerFromHeader('member');

const run = (query: string, variables?: Record<string, unknown>, viewer = guest) =>
    api.run({ query, ...(variables && { variables }) }, viewer);

/* The shape of each answer is asserted by the test that reads it, so the data is left loose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = Record<string, any>;

const data = (response: StoreResponse): Loose => {
    if (response.errors) throw new Error(JSON.stringify(response.errors));
    return response.data as Loose;
};

const RESULTS = `
    query Results($input: SearchInput!) {
        search(input: $input) {
            total page pageSize totalPages matching
            sort { by direction }
            items { product { sku name price { min { amount currency } } } score
                    explanation { matches { typed matched field route } rules { ruleId action } } }
            facets { name attribute
                ... on ValueFacet { buckets { value count } }
                ... on RangeFacet { buckets { from to count } }
                ... on StatsFacet { min max count } }
            merchandising { applied setAsideBySort }
        }
    }`;

describe('searching', () => {
    it('answers a phrase with hits, facets and explanations', async () => {
        const { search } = data(await run(RESULTS, { input: { phrase: 'jacket', pageSize: 5 } }));
        expect(search.matching).toBe('EXACT');
        expect(search.total).toBeGreaterThan(5);
        expect(search.items).toHaveLength(5);
        expect(search.sort).toEqual([{ by: 'RELEVANCE', direction: 'DESC' }]);
        expect(search.facets.map((f: { name: string }) => f.name)).toEqual([
            'category',
            'brand',
            'color',
            'size',
            'price',
            'rating',
        ]);
        // The first item is pinned by a rule, so it is the second that matched the phrase.
        const [, second] = search.items;
        expect(second.explanation.matches[0]).toMatchObject({ typed: 'jacket', route: 'EXACT' });
        expect(second.product.price.min.currency).toBe('USD');
    });

    it('reports a pinned product first, and says which rule did it', async () => {
        const { search } = data(await run(RESULTS, { input: { phrase: 'jacket', pageSize: 3 } }));
        expect(search.items[0].product.sku).toBe(catalog.products[3]?.sku);
        expect(search.items[0].explanation.rules).toEqual([{ ruleId: 'promo', action: 'PIN' }]);
        expect(search.merchandising).toEqual({ applied: ['promo'], setAsideBySort: [] });
    });

    it('translates a corrected phrase, an empty one, and a hopeless one', async () => {
        const matching = async (phrase: string | null) =>
            data(await run(RESULTS, { input: { phrase, pageSize: 1 } })).search.matching;
        expect(await matching('jakcet')).toBe('CORRECTED');
        expect(await matching(null)).toBe('ALL');
        expect(await matching('xqzv')).toBe('NONE');
    });

    it('filters by an attribute, a range and stock, and sorts by price', async () => {
        const { search } = data(
            await run(RESULTS, {
                input: {
                    filters: [
                        { attribute: 'CATEGORY', match: { eq: 'shoes' } },
                        { attribute: 'PRICE', match: { range: { to: 15000 } } },
                        { attribute: 'IN_STOCK', match: { eq: 'true' } },
                    ],
                    sort: [{ by: 'PRICE', direction: 'ASC' }],
                    pageSize: 3,
                },
            })
        );
        expect(search.sort).toEqual([{ by: 'PRICE', direction: 'ASC' }]);
        const amounts = search.items.map(
            (item: { product: { price: { min: { amount: number } } } }) =>
                item.product.price.min.amount
        );
        expect(amounts).toEqual([...amounts].sort((a: number, b: number) => a - b));
        expect(amounts.at(-1)).toBeLessThan(15000);
    });

    it('browses in catalog order without a phrase, and by position within a category', async () => {
        const plain = data(await run(RESULTS, { input: { pageSize: 1 } }));
        expect(plain.search.sort).toEqual([{ by: 'CATALOG', direction: 'ASC' }]);
        const inCategory = data(
            await run(RESULTS, {
                input: {
                    filters: [{ attribute: 'CATEGORY', match: { eq: 'boots' } }],
                    sort: [{ by: 'POSITION' }],
                    pageSize: 1,
                },
            })
        );
        expect(inCategory.search.sort).toEqual([{ by: 'POSITION', direction: 'ASC' }]);
    });

    it('reduces an oversized page rather than refusing it', async () => {
        const { search } = data(await run(RESULTS, { input: { pageSize: 500 } }));
        expect(search.pageSize).toBe(100);
    });
});

describe('the viewer', () => {
    const discounted = catalog.products.find((p) => p.price.member.min < p.price.guest.min);
    const membersOnly = catalog.products.find((p) => p.visibleTo.length === 1);

    it('prices every product for the viewer, with no way to ask for another price', async () => {
        if (!discounted) throw new Error('expected a discounted product');
        const query = `{ product(sku: "${discounted.sku}") { price { min { amount } } variants { price { amount } } } }`;
        const asGuest = data(await run(query, undefined, guest)).product;
        const asMember = data(await run(query, undefined, member)).product;
        expect(asMember.price.min.amount).toBeLessThan(asGuest.price.min.amount);
        expect(asMember.variants[0].price.amount).toBeLessThan(asGuest.variants[0].price.amount);
    });

    it('does not show a guest a product only members may see, by search or by sku', async () => {
        if (!membersOnly) throw new Error('expected a members-only product');
        const query = `{ product(sku: "${membersOnly.sku}") { sku } store { viewer { group } } }`;
        expect(data(await run(query, undefined, guest))).toEqual({
            product: null,
            store: { viewer: { group: 'GUEST' } },
        });
        expect(data(await run(query, undefined, member))).toEqual({
            product: { sku: membersOnly.sku },
            store: { viewer: { group: 'MEMBER' } },
        });
    });

    it('reads the group from the request and treats anything unknown as a guest', () => {
        expect(viewerFromHeader('MEMBER').group).toBe('member');
        expect(viewerFromHeader(' member ').group).toBe('member');
        expect(viewerFromHeader('admin').group).toBe('guest');
        expect(viewerFromHeader(null).group).toBe('guest');
    });
});

describe('suggestions', () => {
    it('completes the last word from the catalog, and finds products for it', async () => {
        const { suggest } = data(
            await run(
                `{ suggest(phrase: "trail ru", limit: 3) { queries products { product { name } } } }`
            )
        );
        expect(suggest.queries).toContain('trail runner');
        expect(suggest.queries.every((q: string) => q.startsWith('trail ru'))).toBe(true);
        expect(suggest.products.length).toBeGreaterThan(0);
        expect(suggest.products[0].product.name).toContain('Trail Runner');
    });
});

describe('what a request may not do', () => {
    const errors = (response: StoreResponse) =>
        (response.errors ?? []).map((e) => [e.extensions?.code, e.message]);

    it('refuses an unknown attribute at validation', async () => {
        const response = await run(RESULTS, {
            input: { filters: [{ attribute: 'COLOUR', match: { eq: 'Red' } }] },
        });
        expect(errors(response)[0]?.[0]).toBe('GRAPHQL_VALIDATION_FAILED');
        expect(response.data).toBeUndefined();
    });

    it('refuses two matchers on one filter', async () => {
        const response = await run(RESULTS, {
            input: { filters: [{ attribute: 'BRAND', match: { eq: 'Ostara', in: ['Ostara'] } }] },
        });
        expect(errors(response)[0]?.[0]).toBe('GRAPHQL_VALIDATION_FAILED');
    });

    it('refuses a range on an attribute that has none, as the caller mistake it is', async () => {
        const response = await run(RESULTS, {
            input: { filters: [{ attribute: 'BRAND', match: { range: { from: 1 } } }] },
        });
        expect(errors(response)).toEqual([
            ['BAD_USER_INPUT', expect.stringMatching(/not a range/)],
        ]);
    });

    it('refuses a query that nests too deep or selects too much', async () => {
        const deep = await run(
            `{ categories { parent { parent { parent { parent { parent { parent { parent { parent { id } } } } } } } } } }`
        );
        expect(errors(deep)[0]).toEqual(['QUERY_TOO_DEEP', expect.stringMatching(/deeper than 8/)]);
        const wide = await run(
            `{ ${Array.from({ length: 201 }, (_, i) => `s${i}: store { name }`).join(' ')} }`
        );
        expect(errors(wide)[0]?.[0]).toBe('QUERY_TOO_WIDE');
    });

    it('reports a parse failure as one', async () => {
        expect(errors(await run('{ search('))[0]?.[0]).toBe('GRAPHQL_PARSE_FAILED');
    });

    it('never shows a client why a resolver failed', async () => {
        const broken = createStoreApi(createStore({ catalog: { ...catalog, brands: [] } }));
        const response = await broken.run(
            { query: `{ product(sku: "${catalog.products[0]?.sku}") { brand { name } } }` },
            guest
        );
        expect(response.errors).toEqual([
            {
                message: 'Something went wrong on our side.',
                extensions: { code: 'INTERNAL' },
                path: ['product', 'brand'],
            },
        ]);
    });
});
