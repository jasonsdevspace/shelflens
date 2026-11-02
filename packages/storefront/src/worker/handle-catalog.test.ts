// @vitest-environment node
import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryRuleStore,
    createStore,
    PERSISTED_OPERATIONS,
    type RuleStore,
    VERSION_HEADER,
} from '@shelflens/api';
import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { parseCsv } from '../try/csv.js';
import { guessMapping } from '../try/mapping.js';
import { toCatalog } from '../try/to-catalog.js';
import { createMemoryCatalogStore } from './catalog-db.js';
import { type AnswerStore, createWorkerApi } from './handle.js';

/*
 * The worker for a visitor's own catalog: nothing to search until a catalog
 * is loaded, a catalog checked before it is kept, each new one a new version
 * with nothing of the old one served, and removing it leaves nothing behind.
 */

const BASE = '/shelflens/try/';
const ORIGIN = 'https://example.test';

const opNamed = (name: string): string => {
    const hash = Object.keys(PERSISTED_OPERATIONS).find((key) =>
        PERSISTED_OPERATIONS[key]?.startsWith(`query ${name}`)
    );
    if (!hash) throw new Error(`expected the ${name} operation to be persisted`);
    return hash;
};
const STORE = opNamed('Store');
const SUGGEST = opNamed('Suggest');

const get = (params: Record<string, string>) =>
    new Request(`${ORIGIN}${BASE}graphql?${new URLSearchParams(params)}`);

const catalogRequest = (method: string, body?: unknown, discardRules = false) =>
    new Request(`${ORIGIN}${BASE}catalog${discardRules ? '?discard-rules=yes' : ''}`, {
        method,
        ...(body !== undefined && { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });

const fromCsv = (csv: string): Catalog => {
    const table = parseCsv(csv);
    const result = toCatalog(table, guessMapping(table), new Date('2026-10-31T00:00:00Z'));
    if (!result.ok) throw new Error(result.error);
    return result.catalog;
};

const LAMPS = fromCsv('name,price\nBrass Desk Lamp,$40.00\nPaper Floor Lamp,$65.00\n');
/** The version the store built from a catalog reports, rules and all. */
const storeVersion = (catalog: Catalog) => createStore({ catalog }).version;

const MUGS = fromCsv('name,price\nStoneware Mug,$12.00\nEnamel Camp Mug,$9.00\n');

const memoryAnswers = () => {
    const kept = new Map<string, Response>();
    const answers: AnswerStore = {
        match: (request) => Promise.resolve(kept.get(request.url)?.clone()),
        put: (request, response) => {
            kept.set(request.url, response);
            return Promise.resolve();
        },
        keys: () => Promise.resolve([...kept.keys()].map((url) => new Request(url))),
        delete: (request) => Promise.resolve(kept.delete(request.url)),
    };
    return { answers, kept };
};

const visitorApi = (
    answers?: AnswerStore,
    extra: { rules?: RuleStore; forgetEvents?: () => Promise<void> } = {}
) =>
    createWorkerApi({
        catalogs: createMemoryCatalogStore(),
        base: BASE,
        ...(answers && { answers: () => Promise.resolve(answers) }),
        ...extra,
    });

const pinFirst = (catalog: Catalog): Rule[] => [
    { id: 'pin', pin: [catalog.products[0]?.sku ?? ''] },
];

/** A rule no store can be built with, since no store has the attribute it names. */
const UNBUILDABLE: Rule[] = [
    { id: 'odd', boost: [{ attribute: { name: 'no-such-attribute', value: 'x' }, weight: 2 }] },
];

const versionOf = async (response: Response | undefined) =>
    ((await response?.json()) as { data: { store: { catalogVersion: string } } }).data.store
        .catalogVersion;

const suggested = async (response: Response | undefined) =>
    (
        (await response?.json()) as {
            data: { suggest: { products: { product: { name: string } }[] } };
        }
    ).data.suggest.products.map((hit) => hit.product.name);

describe('the worker for a visitor’s own catalog', () => {
    it('has nothing to search until a catalog is loaded, and warms without one', async () => {
        const api = visitorApi();
        await expect(api.warm()).resolves.toEqual({ downloadMs: 0, buildMs: 0 });
        const answer = await api.handle(get({ op: STORE }));
        expect(answer?.status).toBe(404);
        expect((await api.handle(catalogRequest('GET')))?.status).toBe(404);
    });

    it('loads a catalog, answers from it, and says which version is served', async () => {
        const api = visitorApi();
        const loaded = await api.handle(catalogRequest('PUT', LAMPS));
        expect(loaded?.status).toBe(204);
        const version = loaded?.headers.get(VERSION_HEADER);
        expect(version).toBe(storeVersion(LAMPS));
        expect(await versionOf(await api.handle(get({ op: STORE })))).toBe(storeVersion(LAMPS));
        const lamps = await api.handle(
            get({ op: SUGGEST, variables: JSON.stringify({ phrase: 'lamp', limit: 5 }) })
        );
        expect(await suggested(lamps)).toEqual(
            expect.arrayContaining(['Brass Desk Lamp', 'Paper Floor Lamp'])
        );
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
    });

    it('serves nothing of the first catalog once a second is loaded over it', async () => {
        const { answers, kept } = memoryAnswers();
        const api = visitorApi(answers);
        const first =
            (await api.handle(catalogRequest('PUT', LAMPS)))?.headers.get(VERSION_HEADER) ?? '';
        // The store's answer is one the headers allow to be kept, for its version.
        await api.handle(get({ op: STORE, v: first }));
        expect(kept.size).toBe(1);

        const second =
            (await api.handle(catalogRequest('PUT', MUGS)))?.headers.get(VERSION_HEADER) ?? '';
        expect(second).not.toBe(first);
        expect(kept.size).toBe(0);
        expect(await versionOf(await api.handle(get({ op: STORE })))).toBe(storeVersion(MUGS));
        const mugs = await api.handle(
            get({ op: SUGGEST, variables: JSON.stringify({ phrase: 'mug', limit: 5 }), v: second })
        );
        expect(await suggested(mugs)).toEqual(
            expect.arrayContaining(['Stoneware Mug', 'Enamel Camp Mug'])
        );
        const lamps = await api.handle(
            get({
                op: SUGGEST,
                variables: JSON.stringify({ phrase: 'brass', limit: 5 }),
                v: second,
            })
        );
        expect(await suggested(lamps)).toEqual([]);
    });

    it('refuses a catalog that does not check, and keeps the one it had', async () => {
        const api = visitorApi();
        await api.handle(catalogRequest('PUT', LAMPS));
        const broken = await api.handle(
            catalogRequest('PUT', { ...LAMPS, products: [{ sku: 'X' }] })
        );
        expect(broken?.status).toBe(400);
        expect(await broken?.json()).toEqual({ errors: [{ message: 'product 1 has no name' }] });
        expect((await api.handle(catalogRequest('PUT', '{not json')))?.status).toBe(400);
        expect(await versionOf(await api.handle(get({ op: STORE })))).toBe(storeVersion(LAMPS));
    });

    it('removes the catalog and everything answered from it', async () => {
        const { answers, kept } = memoryAnswers();
        const api = visitorApi(answers);
        const version =
            (await api.handle(catalogRequest('PUT', LAMPS)))?.headers.get(VERSION_HEADER) ?? '';
        await api.handle(get({ op: STORE, v: version }));
        expect(kept.size).toBe(1);
        expect((await api.handle(catalogRequest('DELETE')))?.status).toBe(204);
        expect(kept.size).toBe(0);
        expect((await api.handle(get({ op: STORE })))?.status).toBe(404);
        expect((await api.handle(catalogRequest('GET')))?.status).toBe(404);
    });

    it('takes only GET, PUT and DELETE on the catalog path', async () => {
        expect((await visitorApi().handle(catalogRequest('POST', LAMPS)))?.status).toBe(405);
    });

    it('leaves the catalog path to the network in the demo’s worker', async () => {
        const demo = createWorkerApi({
            catalogUrl: 'catalog.json',
            base: BASE,
            fetch: () =>
                Promise.resolve(new Response(JSON.stringify(generateCatalog({ products: 20 })))),
        });
        expect(await demo.handle(catalogRequest('PUT', LAMPS))).toBeUndefined();
    });

    it('sets the version from the content, whatever version the catalog claims', async () => {
        const api = visitorApi();
        const lamps = (await api.handle(catalogRequest('PUT', LAMPS)))?.headers.get(VERSION_HEADER);
        const claimed = await api.handle(
            catalogRequest('PUT', { ...MUGS, version: LAMPS.version })
        );
        expect(claimed?.headers.get(VERSION_HEADER)).not.toBe(lamps);
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: MUGS.version,
            products: 2,
        });
    });

    it('refuses to load or remove over saved rules until the visitor agrees, and keeps everything meanwhile', async () => {
        const rules = createMemoryRuleStore();
        const api = visitorApi(undefined, { rules });
        await api.handle(catalogRequest('PUT', LAMPS));
        await rules.replace(pinFirst(LAMPS));
        for (const refused of [
            await api.handle(catalogRequest('PUT', MUGS)),
            await api.handle(catalogRequest('DELETE')),
        ]) {
            expect(refused?.status).toBe(409);
            expect(await refused?.json()).toMatchObject({ errors: [{ code: 'saved-rules' }] });
        }
        expect(await rules.current()).toEqual(pinFirst(LAMPS));
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toMatchObject({
            version: LAMPS.version,
        });
        expect((await api.handle(catalogRequest('PUT', MUGS, true)))?.status).toBe(204);
        expect(await rules.current()).toBeUndefined();
    });

    it('loads the same catalog again without asking, and keeps its rules, since they still name its products', async () => {
        const rules = createMemoryRuleStore();
        const api = visitorApi(undefined, { rules });
        await api.handle(catalogRequest('PUT', LAMPS));
        await rules.replace(pinFirst(LAMPS));
        expect((await api.handle(catalogRequest('PUT', LAMPS)))?.status).toBe(204);
        expect(await rules.current()).toEqual(pinFirst(LAMPS));
    });

    it('loads over an empty saved set without asking, since there are no rules to lose', async () => {
        const rules = createMemoryRuleStore();
        const api = visitorApi(undefined, { rules });
        await api.handle(catalogRequest('PUT', LAMPS));
        await rules.replace([]);
        expect((await api.handle(catalogRequest('PUT', MUGS)))?.status).toBe(204);
    });

    it('forgets the last catalog’s rules and clicks when a new one is loaded or it is removed', async () => {
        const rules = createMemoryRuleStore();
        const forgetEvents = vi.fn(() => Promise.resolve());
        const api = visitorApi(undefined, { rules, forgetEvents });
        await api.handle(catalogRequest('PUT', LAMPS));
        await rules.replace(pinFirst(LAMPS));
        const mugs = await api.handle(catalogRequest('PUT', MUGS, true));
        expect(mugs?.status).toBe(204);
        expect(await rules.current()).toBeUndefined();
        expect(forgetEvents).toHaveBeenCalledTimes(2);
        await api.handle(catalogRequest('DELETE', undefined, true));
        expect(forgetEvents).toHaveBeenCalledTimes(3);
    });

    it('builds a file just loaded from the catalog in hand, without reading it back', async () => {
        const catalogs = createMemoryCatalogStore();
        const reads = vi.spyOn(catalogs, 'current');
        const api = createWorkerApi({ catalogs, base: BASE });
        expect((await api.handle(catalogRequest('PUT', LAMPS)))?.status).toBe(204);
        // Nothing was loaded before, so the one read is the check for a last catalog.
        expect(reads).toHaveBeenCalledOnce();
        expect((await api.handle(catalogRequest('PUT', MUGS)))?.status).toBe(204);
        expect(await versionOf(await api.handle(get({ op: STORE })))).toBe(storeVersion(MUGS));
        expect(reads).toHaveBeenCalledOnce();
    });

    it('builds from the last catalog that worked when one cannot be built, even if putting it back fails', async () => {
        const catalogs = createMemoryCatalogStore();
        let saved: readonly Rule[] | undefined;
        // Rules that cannot be cleared, so the next catalog cannot be built with them.
        const stubborn: RuleStore = {
            current: () => Promise.resolve(saved),
            replace: (next) => {
                saved = next;
                return Promise.resolve();
            },
            reset: () => Promise.resolve(),
        };
        const api = createWorkerApi({ catalogs, base: BASE, rules: stubborn });
        expect((await api.handle(catalogRequest('PUT', LAMPS)))?.status).toBe(204);
        saved = UNBUILDABLE;
        const replace = catalogs.replace.bind(catalogs);
        // The new catalog is written, and putting the last one back is not.
        vi.spyOn(catalogs, 'replace')
            .mockImplementationOnce(replace)
            .mockRejectedValueOnce(new Error('the quota is full'));
        await api.handle(catalogRequest('PUT', MUGS, true)).catch(() => undefined);
        const reads = vi.spyOn(catalogs, 'current');
        // A save builds again, from the catalog in hand, which is the last one that worked.
        const answer = await api.handle(
            new Request(`${ORIGIN}${BASE}rules`, {
                method: 'POST',
                body: JSON.stringify({ rules: pinFirst(LAMPS) }),
            })
        );
        expect(answer?.status).toBe(204);
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
        expect(reads).not.toHaveBeenCalled();
    });

    it('keeps the last catalog and its rules when a new one cannot be built', async () => {
        // Rules that cannot be cleared, and that no store can be built with.
        let saved: readonly Rule[] | undefined;
        const stubborn: RuleStore = {
            current: () => Promise.resolve(saved),
            replace: (next) => {
                saved = next;
                return Promise.resolve();
            },
            reset: () => Promise.resolve(),
        };
        const api = visitorApi(undefined, { rules: stubborn });
        await api.handle(catalogRequest('PUT', LAMPS));
        saved = UNBUILDABLE;
        const refused = await api.handle(catalogRequest('PUT', MUGS, true));
        expect(refused?.status).toBe(400);
        expect(await refused?.json()).toMatchObject({
            errors: [{ message: expect.stringContaining('the catalog could not be built: ') }],
        });
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
        expect(saved).toEqual(UNBUILDABLE);
    });

    it('answers a load and a removal that arrive together, and ends in agreement', async () => {
        const api = visitorApi();
        const [loaded, removed] = await Promise.all([
            api.handle(catalogRequest('PUT', LAMPS)),
            api.handle(catalogRequest('DELETE')),
        ]);
        expect(loaded?.status).toBe(204);
        expect(removed?.status).toBe(204);
        // Whichever ran last, what the catalog path says and what is searched agree.
        const listed = (await api.handle(catalogRequest('GET')))?.status;
        const searched = (await api.handle(get({ op: STORE })))?.status;
        expect([listed, searched]).toEqual(listed === 404 ? [404, 404] : [200, 200]);
    });

    it('does not keep an answer that finishes after its catalog was removed', async () => {
        const { answers, kept } = memoryAnswers();
        const api = visitorApi(answers);
        const version =
            (await api.handle(catalogRequest('PUT', LAMPS)))?.headers.get(VERSION_HEADER) ?? '';
        const late = api.handle(get({ op: STORE, v: version }));
        await api.handle(catalogRequest('DELETE'));
        await late;
        expect(kept.size).toBe(0);
    });
});
