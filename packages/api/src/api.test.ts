import { signalWeight } from '@jasonsdevspace/shelflens';
import { generateCatalog } from '@shelflens/catalog';
import { beforeAll, describe, expect, it } from 'vitest';

import { createStore, viewerFromHeader } from './context.js';
import { createMemoryEventStore } from './events.js';
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
                    explanation { matches { typed matched field route } rules { ruleId action }
                                  popularity { clicks weight } } }
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
        // Browsing a category asks for nothing and gets position, as the schema promises.
        const browsing = data(
            await run(RESULTS, {
                input: {
                    filters: [{ attribute: 'CATEGORY', match: { eq: 'boots' } }],
                    pageSize: 1,
                },
            })
        );
        expect(browsing.search.sort).toEqual([{ by: 'POSITION', direction: 'ASC' }]);
    });

    it('offers something instead of nothing, and nothing when it found something', async () => {
        const NOTHING = `
            query Nothing($input: SearchInput!) {
                search(input: $input) {
                    total
                    noResults {
                        suggestion foundWithoutFilters
                        relaxed { phrase dropped result { total items { product { name } } } }
                        popular { sku rating { count } }
                    }
                }
            }`;
        const ask = async (input: Record<string, unknown>) =>
            data(await run(NOTHING, { input })).search;

        expect((await ask({ phrase: 'jacket' })).noResults).toBeNull();

        const shorter = await ask({ phrase: 'xqzv sweater' });
        expect(shorter.total).toBe(0);
        expect(shorter.noResults.relaxed).toMatchObject({ phrase: 'sweater', dropped: ['xqzv'] });
        expect(shorter.noResults.relaxed.result.total).toBeGreaterThan(0);
        expect(shorter.noResults.relaxed.result.items[0].product.name).toMatch(/sweater/i);
        expect(shorter.noResults.suggestion).toBeNull();

        const misspelled = await ask({ phrase: 'swaetter' });
        expect(misspelled.noResults.suggestion).toBe('sweater');

        const filtered = await ask({
            phrase: 'jacket',
            filters: [{ attribute: 'PRICE', match: { range: { from: 0, to: 1 } } }],
        });
        expect(filtered.noResults.foundWithoutFilters).toBeGreaterThan(0);

        // A browsed category is kept: nothing is offered that leaves it.
        const browsing = await ask({
            phrase: 'sweater',
            filters: [{ attribute: 'CATEGORY', match: { eq: 'shoes' } }],
        });
        expect(browsing.total).toBe(0);
        expect(browsing.noResults.foundWithoutFilters).toBe(0);
        expect(browsing.noResults.relaxed).toBeNull();

        const hopeless = await ask({ phrase: 'xqzv' });
        expect(hopeless.noResults.relaxed).toBeNull();
        const counts = hopeless.noResults.popular.map((p: Loose) => p.rating.count);
        expect(counts).toHaveLength(8);
        expect(counts).toEqual([...counts].sort((a: number, b: number) => b - a));
    });

    it('reduces an oversized page rather than refusing it', async () => {
        const { search } = data(await run(RESULTS, { input: { pageSize: 500 } }));
        expect(search.pageSize).toBe(100);
    });
});

describe('a merchandiser\u2019s preview', () => {
    const SELECTION = `total matching
        merchandising { applied setAsideBySort }
        items { product { sku } explanation { rules { ruleId action weight } } }`;
    const jackets = () =>
        catalog.products.filter((p) => /jacket/i.test(p.name) && p.visibleTo.length === 2);

    it('answers what the search will answer once the draft is saved, and is never kept', async () => {
        const [a, b, c] = jackets();
        if (!a || !b || !c) throw new Error('expected three jackets');
        const draft = [
            { id: 'promo-b', name: 'B first', when: { queries: ['jacket'] }, pin: [b.sku] },
            { id: 'no-c', when: { queries: ['jacket'] }, hide: [c.sku] },
            { id: 'lift-a', when: { queries: ['jacket'] }, boost: [{ ids: [a.sku], weight: 1.5 }] },
        ];
        const input = { phrase: 'jacket', pageSize: 10 };
        const previewed = await run(
            `query ($input: SearchInput!, $rules: [RuleInput!]!) { preview(input: $input, rules: $rules) { ${SELECTION} } }`,
            { input, rules: draft }
        );
        expect(previewed.extensions).toEqual({ volatile: true });
        const saved = createStoreApi(createStore({ catalog, rules: draft }));
        const searched = await saved.run(
            {
                query: `query ($input: SearchInput!) { search(input: $input) { ${SELECTION} } }`,
                variables: { input },
            },
            guest
        );
        expect(data(previewed).preview).toEqual(data(searched).search);
        expect(data(previewed).preview.items[0].product.sku).toBe(b.sku);
        expect(data(previewed).preview.merchandising.applied).toEqual([
            'promo-b',
            'no-c',
            'lift-a',
        ]);
    });

    it('leaves the store as it was, and refuses a draft the engine refuses in its own words', async () => {
        const after = data(await run(RESULTS, { input: { phrase: 'jacket', pageSize: 3 } })).search;
        expect(after.merchandising.applied).toEqual(['promo']);
        const refused = await run(
            `query ($input: SearchInput!, $rules: [RuleInput!]!) { preview(input: $input, rules: $rules) { total } }`,
            {
                input: { phrase: 'jacket' },
                rules: [{ id: 'ghost', when: { queries: ['jacket'] }, pin: ['SL-99999'] }],
            }
        );
        expect(refused.errors?.[0]).toMatchObject({
            message: expect.stringContaining('SL-99999') as string,
            extensions: { code: 'BAD_USER_INPUT' },
        });
    });

    it('carries a trigger\u2019s filter and a window into the engine, as the rules file would', async () => {
        const [a] = jackets();
        if (!a) throw new Error('expected a jacket');
        const brand = a.brand;
        const input = {
            phrase: 'jacket',
            pageSize: 5,
            filters: [{ attribute: 'BRAND', match: { eq: brand } }],
        };
        // The window is judged against the time the request names.
        const week = (active: { from?: string; to?: string }) =>
            api.run(
                {
                    query: `query ($input: SearchInput!, $rules: [RuleInput!]!) { preview(input: $input, rules: $rules) { ${SELECTION} } }`,
                    variables: {
                        input,
                        rules: [
                            {
                                id: 'brand-week',
                                when: {
                                    queries: ['jacket'],
                                    filter: { attribute: 'brand', value: brand },
                                },
                                active,
                                pin: [a.sku],
                            },
                        ],
                    },
                },
                guest,
                new Date('2026-06-01')
            );
        const now = data(await week({ from: '2000-01-01', to: '2999-01-01' })).preview;
        expect(now.merchandising.applied).toEqual(['brand-week']);
        expect(now.items[0].product.sku).toBe(a.sku);
        const past = data(await week({ to: '2001-01-01' })).preview;
        expect(past.merchandising.applied).toEqual([]);
    });

    it('says whether the rules in effect were saved by a visitor', async () => {
        expect(data(await run('{ store { rulesEdited } }')).store.rulesEdited).toBe(false);
        const edited = createStoreApi(createStore({ catalog, rules: [], rulesEdited: true }));
        const answer = await edited.run({ query: '{ store { rulesEdited } }' }, guest);
        expect(data(answer).store.rulesEdited).toBe(true);
    });
});

describe('what shoppers clicked', () => {
    const jackets = () =>
        catalog.products.filter((p) => /jacket/i.test(p.name) && p.visibleTo.length === 2);

    it('raises a clicked product among its equals, says so in explain mode, and never passes a pin', async () => {
        const plain = data(await run(RESULTS, { input: { phrase: 'jacket', pageSize: 5 } })).search;
        const pinned = plain.items[0].product.sku;
        const last = plain.items[plain.items.length - 1].product.sku;
        const signals = { [last]: 20 };
        const clicked = createStoreApi(
            createStore({
                catalog,
                rules: [{ id: 'promo', when: { queries: ['jacket'] }, pin: [pinned] }],
                signals,
            })
        );
        const nudged = data(
            await clicked.run(
                { query: RESULTS, variables: { input: { phrase: 'jacket', pageSize: 5 } } },
                guest
            )
        ).search;
        expect(nudged.items[0].product.sku).toBe(pinned);
        expect(nudged.items[0].explanation.popularity).toBeNull();
        const risen = nudged.items.findIndex((item: Loose) => item.product.sku === last);
        expect(risen).toBeGreaterThan(0);
        expect(risen).toBeLessThan(plain.items.length - 1);
        expect(nudged.items[risen].explanation.popularity).toEqual({
            clicks: 20,
            weight: expect.closeTo(signalWeight(20), 10) as number,
        });
    });

    it('is part of the store version, so a store built with new clicks is a new version', () => {
        const plain = createStore({ catalog });
        const [a] = jackets();
        const clicked = createStore({ catalog, signals: { [a?.sku ?? '']: 1 } });
        expect(clicked.version).not.toBe(plain.version);
        expect(clicked.version.startsWith(plain.version)).toBe(true);
        expect(createStore({ catalog, signals: { [a?.sku ?? '']: 1 } }).version).toBe(
            clicked.version
        );
        expect(createStore({ catalog, signals: {} }).version).toBe(plain.version);
    });

    it('leads the popular products with the most clicked, then the most rated', async () => {
        const hopeless = { input: { phrase: 'xqzv' } };
        const query = `query ($input: SearchInput!) {
            search(input: $input) { noResults { popular { sku rating { count } } } }
        }`;
        const before = data(await run(query, hopeless)).search.noResults.popular;
        const [least] = [...before].sort((a: Loose, b: Loose) => a.rating.count - b.rating.count);
        const clicked = createStoreApi(createStore({ catalog, signals: { [least.sku]: 3 } }));
        const after = data(await clicked.run({ query, variables: hopeless }, guest)).search
            .noResults.popular;
        expect(after[0].sku).toBe(least.sku);
        expect(after.slice(1).map((p: Loose) => p.sku)).toEqual(
            before.filter((p: Loose) => p.sku !== least.sku).map((p: Loose) => p.sku)
        );
    });
});

describe('the viewer', () => {
    it('says whether members are priced differently and whether they see more', async () => {
        const ask = async (products: typeof catalog.products) =>
            data(
                await createStoreApi(createStore({ catalog: { ...catalog, products } })).run(
                    { query: '{ store { memberPricing membersOnlyProducts } }' },
                    guest
                )
            ).store;
        const listed = catalog.products.map((p) => ({
            ...p,
            visibleTo: ['guest', 'member'] as typeof p.visibleTo,
            price: { ...p.price, member: p.price.guest },
        }));
        expect(await ask(listed)).toEqual({ memberPricing: false, membersOnlyProducts: false });
        // A member who pays less only on the larger sizes still has a member price.
        const [first, ...rest] = listed;
        if (!first) throw new Error('expected a product');
        const onlyAtTheTop = {
            ...first,
            price: {
                guest: { min: 5000, max: 6000 },
                member: { min: 5000, max: 5500 },
            },
        };
        expect(await ask([onlyAtTheTop, ...rest])).toEqual({
            memberPricing: true,
            membersOnlyProducts: false,
        });
        // A member who pays more still sees other prices, so the switch still means something.
        const dearer = {
            ...first,
            price: {
                guest: first.price.guest,
                member: { min: first.price.guest.min + 100, max: first.price.guest.max + 100 },
            },
        };
        expect(await ask([dearer, ...rest])).toMatchObject({ memberPricing: true });
        expect(await ask(catalog.products)).toMatchObject({ membersOnlyProducts: true });
    });

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

    it('tells a member what a guest pays beside a member price, and a guest nothing more', async () => {
        if (!discounted) throw new Error('expected a discounted product');
        const listed = catalog.products.find(
            (p) =>
                p.visibleTo.length === 2 &&
                p.price.member.min === p.price.guest.min &&
                p.price.member.max === p.price.guest.max
        );
        if (!listed) throw new Error('expected a product at list price for members too');
        const query = (sku: string) =>
            `{ product(sku: "${sku}") { price { memberPrice listPrice { min { amount } max { amount } } } } }`;
        expect(data(await run(query(discounted.sku), undefined, member)).product.price).toEqual({
            memberPrice: true,
            listPrice: {
                min: { amount: discounted.price.guest.min },
                max: { amount: discounted.price.guest.max },
            },
        });
        expect(data(await run(query(discounted.sku), undefined, guest)).product.price).toEqual({
            memberPrice: false,
            listPrice: null,
        });
        expect(data(await run(query(listed.sku), undefined, member)).product.price).toEqual({
            memberPrice: false,
            listPrice: null,
        });
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

describe('recommendations', () => {
    it('falls back on the same most rated list the nothing-found page offers', async () => {
        // With nothing viewed and nothing clicked, both read one list for a category. The
        // product asked about is the category's least rated, so it is in neither list and
        // the two cover the same top of it.
        const quiet = createStoreApi(createStore({ catalog }));
        const byCategory = new Map<string, (typeof catalog.products)[number][]>();
        for (const p of catalog.products.filter((p) => p.visibleTo.length === 2)) {
            byCategory.set(p.categoryId, [...(byCategory.get(p.categoryId) ?? []), p]);
        }
        const crowded = [...byCategory.values()].sort((a, b) => b.length - a.length)[0] ?? [];
        expect(crowded.length).toBeGreaterThan(10);
        const product = [...crowded].sort((a, b) => a.rating.count - b.rating.count)[0];
        if (!product) throw new Error('expected a product every viewer may see');
        for (const viewer of [guest, member]) {
            const rail = data(
                await quiet.run(
                    {
                        query: `query ($sku: ID!) { recommendations(sku: $sku, limit: 6) { source items { sku } } }`,
                        variables: { sku: product.sku },
                    },
                    viewer
                )
            ).recommendations;
            const search = data(
                await quiet.run(
                    {
                        query: `query ($input: SearchInput!) { search(input: $input) { total noResults { popular { sku } } } }`,
                        variables: {
                            input: {
                                phrase: 'zzqxv',
                                filters: [
                                    { attribute: 'CATEGORY', match: { eq: product.categoryId } },
                                ],
                            },
                        },
                    },
                    viewer
                )
            ).search;
            expect(search.total).toBe(0);
            expect(rail.source).toBe('CATEGORY_MOST_RATED');
            const railed = rail.items.map((p: { sku: string }) => p.sku);
            const offered = search.noResults.popular.map((p: { sku: string }) => p.sku);
            expect(railed).toHaveLength(6);
            expect(offered).not.toContain(product.sku);
            expect(railed).toEqual(offered.slice(0, 6));
        }
    });

    it('answers beside a product from the events the host collected, and says the answer is volatile', async () => {
        const events = createMemoryEventStore();
        const withEvents = createStoreApi(createStore({ catalog }), { events });
        const [a, b] = catalog.products.filter((p) => p.visibleTo.length === 2);
        if (!a || !b) throw new Error('expected two products');
        const ask = (session?: string) =>
            withEvents.run(
                {
                    query: `query ($sku: ID!, $session: String) {
                        recommendations(sku: $sku, limit: 3, session: $session) {
                            source viewedTogether category { id } items { sku }
                        }
                    }`,
                    variables: { sku: b.sku, ...(session && { session }) },
                },
                guest
            );
        const cold = await ask();
        expect(cold.extensions).toEqual({ volatile: true });
        expect(data(cold).recommendations).toMatchObject({
            source: 'CATEGORY_MOST_RATED',
            viewedTogether: 0,
            category: { id: b.categoryId },
        });
        expect(data(cold).recommendations.items).toHaveLength(3);

        await events.append([{ id: 'v1', kind: 'view', at: 1, sku: a.sku, session: 't1' }]);
        const warm = await ask('t1');
        expect(data(warm).recommendations.source).toBe('VIEWED_TOGETHER');
        expect(data(warm).recommendations.items[0].sku).toBe(a.sku);
        // One was viewed with it, and the category's most rated fill the rest.
        expect(data(warm).recommendations.viewedTogether).toBe(1);
        expect(data(warm).recommendations.items).toHaveLength(3);
    });

    it('is nothing for a product the viewer may not see', async () => {
        const hidden = catalog.products.find((p) => p.visibleTo.length === 1);
        if (!hidden) throw new Error('expected a members-only product');
        const query = `query ($sku: ID!) { recommendations(sku: $sku) { source } }`;
        expect(data(await run(query, { sku: hidden.sku })).recommendations).toBeNull();
        expect(data(await run(query, { sku: hidden.sku }, member)).recommendations).toMatchObject({
            source: 'CATEGORY_MOST_RATED',
        });
        const plain = await run('{ store { name } }');
        expect(plain.extensions).toBeUndefined();
        const nulled = await run(
            `query ($sku: ID!) { recommendations(sku: $sku, limit: null) { items { sku } } }`,
            { sku: catalog.products[0]?.sku ?? '' }
        );
        expect(data(nulled).recommendations.items).toHaveLength(6);
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
