// @vitest-environment node
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStore,
    GPC_HEADER,
    GROUP_HEADER,
    PERSISTED_OPERATIONS,
    VERSION_HEADER,
} from '@shelflens/api';
import { generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { type AnswerStore, createWorkerApi } from './handle.js';
import { serving } from './serving.js';

const catalog = generateCatalog({ seed: 42, products: 200 });
const version = createStore({ catalog }).version;

const servingCatalog = () => serving(catalog);

const STORE = Object.keys(PERSISTED_OPERATIONS).find((hash) =>
    PERSISTED_OPERATIONS[hash]?.startsWith('query Store')
);
if (!STORE) throw new Error('expected the Store operation to be persisted');

const BASE = '/shelflens/';

const persisted = (
    params: Record<string, string>,
    headers: Record<string, string> = {},
    path = `${BASE}graphql`
) =>
    new Request(`https://example.test${path}?${new URLSearchParams(params)}`, {
        method: 'GET',
        headers,
    });

const posted = (body: unknown) =>
    new Request('https://example.test/shelflens/graphql', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    });

describe('the API inside the worker', () => {
    it('answers a persisted operation from the catalog it fetched, once', async () => {
        const fetchImpl = servingCatalog();
        const api = createWorkerApi({
            catalogUrl: 'https://example.test/shelflens/catalog.json',
            base: BASE,
            fetch: fetchImpl,
        });

        const first = await api.handle(persisted({ op: STORE }));
        const second = await api.handle(persisted({ op: STORE }, { [GROUP_HEADER]: 'member' }));

        expect(await first?.json()).toMatchObject({
            data: { store: { name: 'ShelfLens', catalogVersion: version } },
        });
        expect(first?.headers.get(VERSION_HEADER)).toBe(version);
        expect(await second?.json()).toMatchObject({
            data: { store: { viewer: { group: 'MEMBER' } } },
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://example.test/shelflens/catalog.json');
    });

    it('says what the browser may cache: an answer for the version it asked for', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        const current = await api.handle(persisted({ op: STORE, v: version }));
        expect(current?.headers.get('cache-control')).toBe('public, max-age=300');
        expect(current?.headers.get('vary')).toBe(GROUP_HEADER);
        const unversioned = await api.handle(persisted({ op: STORE }));
        expect(unversioned?.headers.get('cache-control')).toBe('no-store');
        const stale = await api.handle(persisted({ op: STORE, v: 'older' }));
        expect(stale?.headers.get('cache-control')).toBe('no-store');
        expect(stale?.headers.get(VERSION_HEADER)).toBe(version);
    });

    it('accepts only the operations it knows, by name', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(full?.status).toBe(400);
        expect(await full?.json()).toEqual({
            errors: [{ message: 'this store accepts persisted operations only' }],
        });
        expect((await api.handle(persisted({ op: 'unknown' })))?.status).toBe(404);
        expect((await api.handle(persisted({ op: 'constructor' })))?.status).toBe(404);
        expect((await api.handle(persisted({})))?.status).toBe(400);
    });

    it('can accept full queries where the host wants them', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            allowFullQueries: true,
        });
        const full = await api.handle(posted({ query: '{ store { name } }' }));
        expect(await full?.json()).toEqual({ data: { store: { name: 'ShelfLens' } } });
        expect((await api.handle(posted('{ not json')))?.status).toBe(400);
    });

    it('builds the store with the rules file beside the catalog, and reports a bad one', async () => {
        const jacket = catalog.products.find((p) => /jacket/i.test(p.name));
        if (!jacket) throw new Error('expected a jacket');
        const good = createWorkerApi({
            catalogUrl: 'catalog.json',
            rulesUrl: 'rules.json',
            base: BASE,
            fetch: serving(catalog, {
                rules: [{ id: 'top', when: { queries: ['jacket'] }, pin: [jacket.sku] }],
            }),
            allowFullQueries: true,
        });
        const answer = await good.handle(
            posted({
                query: '{ search(input: { phrase: "jacket" }) { items { product { sku } } merchandising { applied } } }',
            })
        );
        const { data } = (await answer?.json()) as {
            data: {
                search: {
                    items: { product: { sku: string } }[];
                    merchandising: { applied: string[] };
                };
            };
        };
        expect(data.search.items[0]?.product.sku).toBe(jacket.sku);
        expect(data.search.merchandising.applied).toEqual(['top']);

        const bad = createWorkerApi({
            catalogUrl: 'catalog.json',
            rulesUrl: 'rules.json',
            base: BASE,
            fetch: serving(catalog, { rules: [{ id: 'top', pin: ['SL-NOPE'] }] }),
        });
        expect((await bad.handle(persisted({ op: STORE })))?.status).toBe(503);
    });

    it('leaves anything that is not an API request to the network', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        expect(await api.handle(new Request('https://example.test/shelflens/'))).toBeUndefined();
        expect(await api.handle(persisted({ op: STORE }, {}, '/graphql'))).toBeUndefined();
        expect(
            await api.handle(new Request('https://example.test/shelflens/catalog.json'))
        ).toBeUndefined();
        expect(
            await api.handle(
                new Request('https://example.test/shelflens/graphql', { method: 'PUT' })
            )
        ).toBeUndefined();
    });

    it('reports a store that could not load, and tries again on the next request', async () => {
        const fetchImpl = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response('gone', { status: 404 }))
            .mockResolvedValueOnce(
                new Response(JSON.stringify(catalog), {
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                })
            );
        const api = createWorkerApi({ catalogUrl: 'catalog.json', base: BASE, fetch: fetchImpl });
        const failed = await api.handle(persisted({ op: STORE }));
        expect(failed?.status).toBe(503);
        const recovered = await api.handle(persisted({ op: STORE }));
        expect(recovered?.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });
});

/** A store of answers like the Cache API's, matching on the URL and the viewer header. */
const createAnswerStore = () => {
    const kept = new Map<string, Response>();
    const keyOf = (request: Request) => `${request.url}|${request.headers.get(GROUP_HEADER) ?? ''}`;
    let matched = 0;
    const store: AnswerStore = {
        match: (request) => {
            const found = kept.get(keyOf(request));
            if (found) matched += 1;
            return Promise.resolve(found?.clone());
        },
        put: (request, response) => {
            kept.set(keyOf(request), response);
            return Promise.resolve();
        },
        keys: () =>
            Promise.resolve([...kept.keys()].map((key) => new Request(key.split('|')[0] ?? ''))),
        delete: (request) => {
            let removed = false;
            for (const key of kept.keys()) {
                if (key.startsWith(`${request.url}|`)) removed = kept.delete(key) || removed;
            }
            return Promise.resolve(removed);
        },
    };
    return { store, kept, matches: () => matched };
};

describe('the answers the worker keeps', () => {
    const withStore = (answers: AnswerStore) =>
        createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            answers: () => Promise.resolve(answers),
        });

    it('keeps an answer the headers allow, per viewer, and serves it next time', async () => {
        const { store, kept, matches } = createAnswerStore();
        const api = withStore(store);
        const first = await api.handle(persisted({ op: STORE, v: version }));
        expect(first?.headers.get('cache-control')).toBe('public, max-age=300');
        expect(kept.size).toBe(1);
        const again = await api.handle(persisted({ op: STORE, v: version }));
        expect(matches()).toBe(1);
        expect(await again?.json()).toEqual(await first?.json());
        await api.handle(persisted({ op: STORE, v: version }, { [GROUP_HEADER]: 'member' }));
        expect(kept.size).toBe(2);
        await api.handle(persisted({ op: STORE }));
        expect(kept.size).toBe(2);
    });

    it('drops an answer past its age, and every answer for another version', async () => {
        const { store, kept } = createAnswerStore();
        const url = `https://example.test${BASE}graphql?${new URLSearchParams({ op: STORE, v: version })}`;
        const old = `https://example.test${BASE}graphql?${new URLSearchParams({ op: STORE, v: 'older' })}`;
        const stale = new Response('{"data":{"stale":true}}', {
            headers: {
                'cache-control': 'public, max-age=300',
                date: new Date(Date.now() - 301_000).toUTCString(),
            },
        });
        kept.set(`${url}|`, stale);
        kept.set(`${old}|`, stale.clone());

        const api = withStore(store);
        const startup = await api.warm();
        expect(startup.downloadMs).toBeGreaterThanOrEqual(0);
        expect(startup.buildMs).toBeGreaterThan(0);
        expect(kept.has(`${old}|`)).toBe(false);
        expect(kept.has(`${url}|`)).toBe(true);
        const fresh = await api.handle(persisted({ op: STORE, v: version }));
        expect(await fresh?.json()).not.toEqual({ data: { stale: true } });
    });
});

describe('events inside the worker', () => {
    const batch = (headers: Record<string, string> = {}) =>
        new Request('https://example.test/shelflens/events', {
            method: 'POST',
            headers,
            body: JSON.stringify([{ id: 'e1', kind: 'search', at: 1, phrase: 'jacket' }]),
        });

    it('keeps a posted batch in the store it was given, and nothing under Global Privacy Control', async () => {
        const events = createMemoryEventStore();
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            events,
        });
        const kept = await api.handle(batch());
        expect(kept?.status).toBe(204);
        const dropped = await api.handle(batch({ [GPC_HEADER]: '1' }));
        expect(dropped?.status).toBe(204);
        expect((await events.all()).map((event) => event.id)).toEqual(['e1']);
    });

    it('reads what it kept when asked what to show beside a product, and marks the answer volatile', async () => {
        const events = createMemoryEventStore();
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            allowFullQueries: true,
            events,
        });
        const [a, b] = catalog.products.filter((p) => p.visibleTo.length === 2);
        if (!a || !b) throw new Error('expected two products');
        await events.append([{ id: 'v', kind: 'view', at: 1, sku: a.sku, session: 't' }]);
        const response = await api.handle(
            posted({
                query: `{ recommendations(sku: "${b.sku}", session: "t") { source items { sku } } }`,
            })
        );
        expect(response?.headers.get('cache-control')).toBe('no-store');
        const answer = (await response?.json()) as {
            data: { recommendations: { source: string; items: { sku: string }[] } };
            extensions: unknown;
        };
        expect(answer.extensions).toEqual({ volatile: true });
        expect(answer.data.recommendations.source).toBe('VIEWED_TOGETHER');
        expect(answer.data.recommendations.items[0]?.sku).toBe(a.sku);
    });

    it('refuses events when it has nowhere to keep them, and leaves other paths to the network', async () => {
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
        });
        expect((await api.handle(batch()))?.status).toBe(404);
        expect(
            await api.handle(new Request('https://example.test/shelflens/other'))
        ).toBeUndefined();
    });
});

describe('clicks in the worker', () => {
    const search = (phrase: string) =>
        posted({
            query: `{ search(input: { phrase: "${phrase}", pageSize: 3 }) {
                items { product { sku } explanation { popularity { clicks } } } } }`,
        });
    const skus = async (response: Response | undefined) => {
        const answer = (await response?.json()) as {
            data: { search: { items: { product: { sku: string } }[] } };
        };
        return answer.data.search.items.map((item) => item.product.sku);
    };

    it('folds the clicks collected so far into ranking when the store is built, and again on a visit after new ones', async () => {
        const events = createMemoryEventStore();
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            allowFullQueries: true,
            events,
        });
        const before = await skus(await api.handle(search('jacket')));
        const last = before[before.length - 1] ?? '';
        const first = await api.handle(search('jacket'));
        const plainVersion = first?.headers.get(VERSION_HEADER);

        await events.append([
            { id: 'c1', kind: 'click', at: 1, sku: last },
            { id: 'c2', kind: 'click', at: 2, sku: last },
        ]);
        // Nothing moves until a visit begins, so paging within this one stays stable.
        expect(await skus(await api.handle(search('jacket')))).toEqual(before);
        expect(await api.refresh()).toBe(true);
        const after = await api.handle(search('jacket'));
        expect(after?.headers.get(VERSION_HEADER)).not.toBe(plainVersion);
        const risen = await skus(after);
        expect(risen.indexOf(last)).toBeLessThan(before.indexOf(last));
        // The same clicks again are no reason to build again.
        expect(await api.refresh()).toBe(false);
    });
});

describe('rules in the worker', () => {
    const jacket = catalog.products.filter(
        (p) => /jacket/i.test(p.name) && p.visibleTo.length === 2
    );
    const SELECTION = `total merchandising { applied } items { product { sku } explanation { rules { ruleId action } } }`;
    const search = () =>
        posted({ query: `{ search(input: { phrase: "jacket", pageSize: 5 }) { ${SELECTION} } }` });
    const preview = (rules: unknown) =>
        posted({
            query: `query ($rules: [RuleInput!]!) { preview(input: { phrase: "jacket", pageSize: 5 }, rules: $rules) { ${SELECTION} } }`,
            variables: { rules },
        });
    const rulesRequest = (method: string, body?: unknown) =>
        new Request('https://example.test/shelflens/rules', {
            method,
            ...(body !== undefined && { body: JSON.stringify(body) }),
        });
    // A body reads once, so each answer is read into a loose shape and kept.
    const body = async (response: Response | undefined) => await response?.json();

    const worker = (rules = createMemoryRuleStore()) =>
        createWorkerApi({
            catalogUrl: 'catalog.json',
            rulesUrl: 'rules.json',
            base: BASE,
            fetch: serving(catalog, {
                rules: [{ id: 'shipped', when: { queries: ['jacket'] }, pin: [jacket[0]?.sku] }],
            }),
            allowFullQueries: true,
            rules,
        });

    it('serves the shipped rules until a set is saved, and then that set as a new version', async () => {
        const api = worker();
        const before = await api.handle(search());
        const shippedVersion = before?.headers.get(VERSION_HEADER);
        const beforeBody = await body(before);
        expect(beforeBody.data.search.merchandising.applied).toEqual(['shipped']);
        expect((await body(await api.handle(rulesRequest('GET')))).edited).toBe(false);

        const draft = [{ id: 'mine', when: { queries: ['jacket'] }, pin: [jacket[2]?.sku] }];
        const previewed = await api.handle(preview(draft));
        expect(previewed?.headers.get('cache-control')).toBe('no-store');
        const previewBody = await body(previewed);

        const saved = await api.handle(rulesRequest('POST', { rules: draft }));
        expect(saved?.status).toBe(204);
        expect(saved?.headers.get(VERSION_HEADER)).not.toBe(shippedVersion);

        const after = await api.handle(search());
        expect(after?.headers.get(VERSION_HEADER)).toBe(saved?.headers.get(VERSION_HEADER));
        // The done line: what the preview showed is what the search returns once saved.
        const afterBody = await body(after);
        expect(afterBody.data.search).toEqual(previewBody.data.preview);
        expect(afterBody.data.search.items[0].product.sku).toBe(jacket[2]?.sku);
        expect((await body(await api.handle(rulesRequest('GET')))).edited).toBe(true);
        expect(
            (await body(await api.handle(posted({ query: '{ store { rulesEdited } }' })))).data
                .store.rulesEdited
        ).toBe(true);
    });

    it('refuses a set the engine refuses, keeps the set it had, and resets to the shipped file', async () => {
        const api = worker();
        const refused = await api.handle(
            rulesRequest('POST', {
                rules: [{ id: 'ghost', when: { queries: ['jacket'] }, pin: ['SL-99999'] }],
            })
        );
        expect(refused?.status).toBe(400);
        expect((await body(refused)).errors[0].message).toContain('SL-99999');
        expect((await body(await api.handle(search()))).data.search.merchandising.applied).toEqual([
            'shipped',
        ]);

        await api.handle(
            rulesRequest('POST', {
                rules: [{ id: 'mine', when: { queries: ['jacket'] }, hide: [jacket[0]?.sku] }],
            })
        );
        expect((await body(await api.handle(search()))).data.search.merchandising.applied).toEqual([
            'mine',
        ]);
        const reset = await api.handle(rulesRequest('DELETE'));
        expect(reset?.status).toBe(204);
        expect((await body(await api.handle(search()))).data.search.merchandising.applied).toEqual([
            'shipped',
        ]);
        expect((await body(await api.handle(rulesRequest('GET')))).edited).toBe(false);
    });

    it('drops every answer kept under the old version when a set is saved', async () => {
        const kept = new Map<string, Response>();
        const answers: AnswerStore = {
            match: (request) => Promise.resolve(kept.get(request.url)),
            put: (request, response) => {
                kept.set(request.url, response);
                return Promise.resolve();
            },
            keys: () => Promise.resolve([...kept.keys()].map((url) => new Request(url))),
            delete: (request) => Promise.resolve(kept.delete(request.url)),
        };
        const api = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: servingCatalog(),
            answers: () => Promise.resolve(answers),
            rules: createMemoryRuleStore(),
        });
        const first = await api.handle(persisted({ op: STORE }));
        const current = first?.headers.get(VERSION_HEADER) ?? '';
        await api.handle(persisted({ op: STORE, v: current }));
        expect(kept.size).toBe(1);
        await api.handle(
            rulesRequest('POST', { rules: [{ id: 'mine', pin: [catalog.products[0]?.sku] }] })
        );
        expect(kept.size).toBe(0);
    });
});
