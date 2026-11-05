// @vitest-environment node
import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createMemoryEventStore,
    createMemoryRuleStore,
    createStore,
    errorBody,
    type EventStore,
    PERSISTED_OPERATIONS,
    type RuleStore,
    type StoreEvent,
    VERSION_HEADER,
} from '@shelflens/api';
import { type Catalog, generateCatalog } from '@shelflens/catalog';
import { describe, expect, it, vi } from 'vitest';

import { listAt, textAt } from '../test/answer.js';
import { serving } from '../test/serving.js';
import { parseCsv } from '../try/csv.js';
import { guessMapping } from '../try/mapping.js';
import { toCatalog } from '../try/to-catalog.js';
import { type CatalogStore, createMemoryCatalogStore } from './catalog-db.js';
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
/** A catalog with no second row, so a rule pinning the second row's SKU cannot be built. */
const ONE_MUG = fromCsv('name,price\nStoneware Mug,$12.00\n');

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
    textAt(await response?.json(), 'data', 'store', 'version');

const suggested = async (response: Response | undefined) =>
    listAt(await response?.json(), 'data', 'suggest', 'products').map((hit) =>
        textAt(hit, 'product', 'name')
    );

describe('the worker for a visitor’s own catalog', () => {
    it('has nothing to search until a catalog is loaded, and warms without one', async () => {
        const api = visitorApi();
        await expect(api.warm()).resolves.toEqual({ downloadMs: 0, buildMs: 0 });
        const answer = await api.handle(get({ op: STORE }));
        expect(answer?.status).toBe(404);
        expect((await api.handle(catalogRequest('GET')))?.status).toBe(404);
    });

    it('answers a rules request 404 until a catalog is loaded', async () => {
        const api = visitorApi(undefined, { rules: createMemoryRuleStore() });
        const saving = { rules: [{ id: 'pin', pin: ['ROW-000001'] }] };
        for (const [method, body] of [['GET'], ['POST', saving], ['DELETE']] as const) {
            const answer = await api.handle(
                new Request(`${ORIGIN}${BASE}rules`, {
                    method,
                    ...(body && { body: JSON.stringify(body) }),
                })
            );
            expect(answer?.status).toBe(404);
            expect(await answer?.json()).toEqual(
                errorBody(404, 'no catalog is loaded, so there is nothing to search yet')
            );
        }
    });

    it('answers an event batch 404 until a catalog is loaded, and keeps none of it', async () => {
        const events = createMemoryEventStore();
        const api = createWorkerApi({ catalogs: createMemoryCatalogStore(), base: BASE, events });
        const answer = await api.handle(
            new Request(`${ORIGIN}${BASE}events`, {
                method: 'POST',
                body: JSON.stringify([{ id: 'e1', kind: 'view', at: 1, sku: 'ROW-000001' }]),
            })
        );
        expect(answer?.status).toBe(404);
        expect(await answer?.json()).toEqual(
            errorBody(404, 'no catalog is loaded, so there is nothing to search yet')
        );
        expect(await events.all()).toEqual([]);
    });

    it('keeps no batch that was still being written when the catalog was removed', async () => {
        const kept: StoreEvent[] = [];
        let written = (): void => undefined;
        const writing = new Promise<void>((resolve) => {
            written = resolve;
        });
        let begun = (): void => undefined;
        const beginning = new Promise<void>((resolve) => {
            begun = resolve;
        });
        const events: EventStore = {
            append: async (batch) => {
                begun();
                await writing;
                kept.push(...batch);
            },
            all: () => Promise.resolve(kept),
        };
        const api = createWorkerApi({
            catalogs: createMemoryCatalogStore(),
            base: BASE,
            events,
            forgetEvents: () => {
                kept.length = 0;
                return Promise.resolve();
            },
        });
        await api.handle(catalogRequest('PUT', LAMPS));
        const posted = api.handle(
            new Request(`${ORIGIN}${BASE}events`, {
                method: 'POST',
                body: JSON.stringify([
                    { id: 'e1', kind: 'view', at: 1, sku: LAMPS.products[0]?.sku ?? '' },
                ]),
            })
        );
        // The removal is asked while the batch is being written, and given time to run before
        // the write ends, as it would if it did not wait for the batch.
        await beginning;
        const removed = api.handle(catalogRequest('DELETE'));
        await Promise.race([removed, new Promise((resolve) => setTimeout(resolve, 50))]);
        written();
        expect((await posted)?.status).toBe(204);
        expect((await removed)?.status).toBe(204);
        expect(kept).toEqual([]);
    });

    it('keeps the catalog loaded while an older read of the saved one was waiting', async () => {
        const catalogs = createMemoryCatalogStore();
        await catalogs.replace(LAMPS);
        let read = (): void => undefined;
        const reading = new Promise<void>((resolve) => {
            read = resolve;
        });
        let reads = 0;
        // Only the first read waits, the one asking what is loaded.
        const slow: CatalogStore = {
            ...catalogs,
            current: async () => {
                reads += 1;
                const saved = await catalogs.current();
                if (reads === 1) await reading;
                return saved;
            },
        };
        const api = createWorkerApi({ catalogs: slow, base: BASE });
        // Asking what is loaded starts reading the saved catalog, and a new one is loaded before
        // the read ends.
        const asked = api.handle(catalogRequest('GET'));
        expect((await api.handle(catalogRequest('PUT', MUGS)))?.status).toBe(204);
        read();
        await asked;
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toMatchObject({
            version: MUGS.version,
        });
    });

    it('says a catalog saved before it started is loaded, and builds from it', async () => {
        const catalogs = createMemoryCatalogStore();
        await catalogs.replace(LAMPS);
        const asked = createWorkerApi({ catalogs, base: BASE });
        expect(await (await asked.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
        // A worker whose first request is a search builds from the saved catalog too.
        const searched = createWorkerApi({ catalogs, base: BASE });
        expect(await versionOf(await searched.handle(get({ op: STORE })))).toBe(
            storeVersion(LAMPS)
        );
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
        expect(await broken?.json()).toEqual(errorBody(400, 'product 1 has no name'));
        expect((await api.handle(catalogRequest('PUT', '{not json')))?.status).toBe(400);
        expect(await versionOf(await api.handle(get({ op: STORE })))).toBe(storeVersion(LAMPS));
    });

    it('removes the catalog and what was made from it, its rules and answers', async () => {
        const { answers, kept } = memoryAnswers();
        const rules = createMemoryRuleStore();
        const api = visitorApi(answers, { rules });
        const version =
            (await api.handle(catalogRequest('PUT', LAMPS)))?.headers.get(VERSION_HEADER) ?? '';
        await api.handle(get({ op: STORE, v: version }));
        expect(kept.size).toBe(1);
        await rules.replace(pinFirst(LAMPS));
        expect((await api.handle(catalogRequest('DELETE', undefined, true)))?.status).toBe(204);
        expect(kept.size).toBe(0);
        expect(await rules.current()).toBeUndefined();
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
            expect(await refused?.json()).toMatchObject({
                errors: [{ extensions: { code: 'SAVED_RULES' } }],
            });
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

    it('stores the last catalog and its rules again when a new one cannot be built', async () => {
        const catalogs = createMemoryCatalogStore();
        const rules = createMemoryRuleStore();
        const api = createWorkerApi({
            catalogs,
            base: BASE,
            rules,
            // The rules the site ships, which stand in once the saved ones are cleared. They pin
            // the second lamp, so a catalog of one mug cannot be built with them.
            rulesUrl: 'rules.json',
            fetch: serving(LAMPS, { rules: [{ id: 'odd', pin: [LAMPS.products[1]?.sku] }] }),
        });
        expect((await api.handle(catalogRequest('PUT', LAMPS)))?.status).toBe(204);
        await rules.replace(pinFirst(LAMPS));
        const refused = await api.handle(catalogRequest('PUT', ONE_MUG, true));
        expect(refused?.status).toBe(400);
        // The reason alone, which the page says after "since", with nothing wrapped around it.
        expect(textAt(await refused?.json(), 'errors', 0, 'message')).toMatch(/^rule odd /);
        expect((await catalogs.current())?.version).toBe(LAMPS.version);
        expect(await rules.current()).toEqual(pinFirst(LAMPS));
        // What the worker says is loaded, and searches, is the last catalog too.
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
        // The rules part of the version moves with the rules put back, the catalog part stays.
        const searched = await versionOf(await api.handle(get({ op: STORE })));
        expect(searched.split('+')[0]).toBe(storeVersion(LAMPS).split('+')[0]);
    });

    it('holds a removal until a load that is building lands, then removes it, so both paths agree', async () => {
        let release: () => void = () => undefined;
        let building = false;
        const catalogs = createMemoryCatalogStore();
        const replace = catalogs.replace.bind(catalogs);
        const held: CatalogStore = {
            ...catalogs,
            replace: (catalog) =>
                new Promise<void>((resolve) => {
                    building = true;
                    release = () => void replace(catalog).then(resolve);
                }),
        };
        const api = createWorkerApi({ catalogs: held, base: BASE });
        let removedYet = false;
        const loading = api.handle(catalogRequest('PUT', LAMPS));
        // Sent once the load is building, which is when a removal must wait for it.
        await vi.waitFor(() => expect(building).toBe(true));
        const removing = api.handle(catalogRequest('DELETE')).then((response) => {
            removedYet = true;
            return response;
        });
        await new Promise((resolve) => setTimeout(resolve, 20));
        // The build is held open, and the removal waits for it rather than running beside it.
        expect(removedYet).toBe(false);
        release();
        expect((await loading)?.status).toBe(204);
        expect((await removing)?.status).toBe(204);
        expect((await api.handle(catalogRequest('GET')))?.status).toBe(404);
        expect((await api.handle(get({ op: STORE })))?.status).toBe(404);
    });

    it('refuses a catalog past the row cap and keeps the one it had', async () => {
        const api = visitorApi();
        await api.handle(catalogRequest('PUT', LAMPS));
        const rows = Array.from({ length: 10_001 }, (_, index) => `Item ${index},$1.00`).join('\n');
        const refused = await api.handle(catalogRequest('PUT', fromCsv(`name,price\n${rows}\n`)));
        expect(refused?.status).toBe(400);
        expect(textAt(await refused?.json(), 'errors', 0, 'message')).toContain(
            'past the cap of 10000'
        );
        expect(await (await api.handle(catalogRequest('GET')))?.json()).toEqual({
            version: LAMPS.version,
            products: 2,
        });
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
