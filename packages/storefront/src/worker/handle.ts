import type { Rule } from '@jasonsdevspace/shelflens';
import {
    createStore,
    createStoreApi,
    type EventStore,
    fingerprint,
    isApiPath,
    isEventsPath,
    isRulesPath,
    parseRulesFile,
    PERSISTED_OPERATIONS,
    receiveEvents,
    receiveRules,
    resolveRequest,
    responseHeaders,
    type RuleStore,
    type Signals,
    signalsOf,
    type Store,
    type StoreApi,
    VERSION_HEADER,
    withResponseCache,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

import { checkCatalog, hasMemberPrices, withContentVersion } from '../try/check.js';
import type { CatalogStore } from './catalog-db.js';

/**
 * The API as a `fetch` handler, which is all a service worker needs.
 *
 * The store is built once, from the catalog and the rules the site ships
 * beside it, the first time anything asks. A rules file that names a
 * product or an attribute the store does not have fails the build of the
 * store, so a merchandiser's mistake is reported, not shipped. Every request for `graphql` under the base
 * after that is answered in the page, so the client makes a real network
 * request and gets a real response, and only the hop to a server is
 * missing. Only the storefront's own operations are accepted, by name.
 * Anything that is not a request for the API is left to the network.
 *
 * Answers are cached twice. In memory, on the project's key, for the life
 * of the worker. And, when the worker is given one, in a store of
 * responses keyed by URL, the way a browser cache would keep them: an
 * answer a worker makes up never enters the browser's own HTTP cache, so
 * the worker keeps what the headers say may be kept, for as long as they
 * say, and matches on the viewer header the answer varies on. A new
 * store version is a new URL, and the old URLs are dropped when the store
 * is built.
 *
 * Events the page sends to `events` beside `graphql` are kept in the
 * store the worker is given, and answered with nothing, since the page
 * never waits for them. The API reads the same store for the fields that
 * are built from them, and the clicks among them are folded into ranking
 * when the store is built. A page that loads asks for a fresh look, and
 * the store is built again, as a new version, only when the clicks have
 * changed since. So within one visit the ranking holds still, and paging
 * never repeats or skips a product, and the next visit sees the clicks.
 *
 * The rules a merchandiser saves arrive on `rules` beside the other two.
 * A saved set stands in for the shipped file until it is reset, and the
 * store is built again, as a new version, before the save is answered,
 * so the next search cannot land on the old one.
 *
 * Given a catalog store in place of a catalog URL, as the page for a
 * visitor's own catalog is, the worker builds from whatever catalog is kept
 * there, and `catalog` beside the other paths takes a new one, checked
 * first, or removes it. Until one is loaded the API answers that there is
 * nothing to search. Each new catalog is a new version, so nothing the old
 * one answered is served again.
 */

export interface WorkerApiOptions {
    /** Where the catalog JSON is served from, for a store built from a file the site ships. */
    readonly catalogUrl?: string;
    /** Where a visitor's own catalog is kept, for a store built from that instead. */
    readonly catalogs?: CatalogStore;
    /** Where the merchandising rules JSON is served from, if the store has any. */
    readonly rulesUrl?: string;
    /** The path the site is served under, where `graphql` is answered. */
    readonly base?: string;
    readonly fetch?: typeof fetch;
    /** Accept full query text as well as persisted operations. The demo does not. */
    readonly allowFullQueries?: boolean;
    /** Where to keep answers across requests, such as a `Cache` from the Cache API. */
    readonly answers?: () => Promise<AnswerStore>;
    /** Where to keep the events the page sends. Without one, events are refused. */
    readonly events?: EventStore;
    /** Where to keep the rules a visitor saves. Without one, the rules path is refused. */
    readonly rules?: RuleStore;
    /**
     * Forgets the events collected so far. A visitor's store calls it when a
     * different catalog is loaded, since clicks on one catalog's products
     * would otherwise lift whatever shares their ids in the next.
     */
    readonly forgetEvents?: () => Promise<void>;
}

/** The part of the Cache API the worker uses. */
export interface AnswerStore {
    match(request: Request): Promise<Response | undefined>;
    put(request: Request, response: Response): Promise<void>;
    keys(): Promise<readonly Request[]>;
    delete(request: Request): Promise<boolean>;
}

/** How long starting the store took, for the cold visit measurement. */
export interface Startup {
    /** Downloading the catalog and the rules, in milliseconds. */
    readonly downloadMs: number;
    /** Building the index and the completions from them, in milliseconds. */
    readonly buildMs: number;
}

/** What the worker tells the page once it is in charge of it. */
export interface StartedMessage extends Startup {
    readonly type: 'shelflens:started';
}

/** The store as served: the API that answers, and the model behind it for a draft's check. */
interface Built {
    readonly api: StoreApi;
    readonly model: Store;
    /** What it was built from, so a build from the same is skipped. */
    readonly from: { readonly clicks: string; readonly rules: string; readonly catalog: string };
}

export interface WorkerApi {
    /** Build the store now rather than on the first request, and say how long it took. */
    warm(): Promise<Startup>;
    /** The response for an API request, or nothing for any other request. */
    handle(request: Request): Promise<Response | undefined>;
    /**
     * A page is loading. Build the store again if the clicks changed since
     * it was built, so the visit sees them. True when it was rebuilt.
     */
    refresh(): Promise<boolean>;
}

const json = (
    status: number,
    body: unknown,
    headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' }
): Response => new Response(JSON.stringify(body), { status, headers });

/** Whether a kept answer is still within the age its headers allow. */
const fresh = (response: Response, now: Date): boolean => {
    const maxAge = /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1];
    const date = Date.parse(response.headers.get('date') ?? '');
    if (maxAge === undefined || Number.isNaN(date)) return false;
    return now.getTime() - date < Number(maxAge) * 1000;
};

const mayKeep = (response: Response): boolean =>
    (response.headers.get('cache-control') ?? '').startsWith('public');

/** The path the page loads or removes a visitor's catalog on. */
export const isCatalogPath = (url: string, base = '/'): boolean =>
    new URL(url, 'http://local').pathname === `${base}catalog`;

/** A store asked to build before it has a catalog to build from. */
class NoCatalogError extends Error {
    constructor() {
        super('no catalog is loaded');
    }
}

const noCatalog = () =>
    json(404, { errors: [{ message: 'no catalog is loaded, so there is nothing to search yet' }] });

const fetchJson = async <T>(fetchImpl: typeof fetch, url: string, what: string): Promise<T> => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`the ${what} came back with status ${response.status}`);
    return response.json() as Promise<T>;
};

/** Said by a change the worker refused, since it would discard the visitor's saved rules. */
const KEEPS_RULES = Symbol('keeps saved rules');

export const createWorkerApi = ({
    catalogUrl,
    catalogs,
    rulesUrl,
    base = '/',
    fetch: fetchImpl = fetch,
    allowFullQueries = false,
    answers,
    events,
    rules,
    forgetEvents,
}: WorkerApiOptions): WorkerApi => {
    let store: Promise<Built> | undefined;
    let startup: Startup = { downloadMs: 0, buildMs: 0 };
    /** The catalog and the shipped rules, downloaded once and kept for every build. */
    let shipped: Promise<{ catalog: Catalog; rules: readonly Rule[] }> | undefined;

    /** How often each product was clicked, from everything collected so far. */
    const clicks = async () => signalsOf(events ? await events.all() : []);

    /** The catalog to build from: the visitor's, when there is a store of them, or the site's. */
    const catalogNow = async (): Promise<Catalog> => {
        if (catalogs) {
            const kept = await catalogs.current();
            if (!kept) throw new NoCatalogError();
            return kept;
        }
        if (catalogUrl === undefined) throw new Error('the worker was given no catalog to serve');
        return fetchJson<Catalog>(fetchImpl, catalogUrl, 'catalog');
    };

    const download = () => {
        shipped ??= Promise.all([
            catalogNow(),
            rulesUrl === undefined
                ? Promise.resolve([])
                : fetchJson<unknown>(fetchImpl, rulesUrl, 'rules file').then(parseRulesFile),
        ])
            .then(([catalog, rulesFile]) => ({ catalog, rules: rulesFile }))
            .catch((error: unknown) => {
                shipped = undefined;
                throw error;
            });
        return shipped;
    };

    /** What a build is made from, read together so the two are from one moment. */
    const inputs = async () => {
        const [signals, saved] = await Promise.all([clicks(), rules?.current()]);
        return { signals, saved };
    };

    /**
     * A store from the catalog, the rules in effect, saved or shipped, and
     * these signals, timed for the cold visit.
     */
    const build = async (signals: Signals, saved: readonly Rule[] | undefined): Promise<Built> => {
        const began = performance.now();
        const { catalog, rules: shippedRules } = await download();
        const downloaded = performance.now();
        const model = createStore({
            catalog,
            rules: saved ?? shippedRules,
            rulesEdited: saved !== undefined,
            signals,
        });
        const api = withResponseCache(createStoreApi(model, { events }));
        startup = { downloadMs: downloaded - began, buildMs: performance.now() - downloaded };
        const from = {
            clicks: fingerprint(signals),
            rules: JSON.stringify(saved ?? null),
            catalog: catalog.version,
        };
        return { api, model, from };
    };

    /** The store being served, or nothing when there is none or it could not be built. */
    const served = async (): Promise<Built | undefined> =>
        store ? store.catch(() => undefined) : undefined;

    /**
     * Builds, unless the store being served was made from the same clicks,
     * rules and catalog, as when a visit's refresh and a save arrive together.
     */
    const buildAgain = async (): Promise<Built> => {
        const { signals, saved } = await inputs();
        const { catalog } = await download();
        const current = await served();
        const same =
            current?.from.clicks === fingerprint(signals) &&
            current.from.rules === JSON.stringify(saved ?? null) &&
            current.from.catalog === catalog.version;
        if (same) return current;
        const next = await build(signals, saved);
        store = Promise.resolve(next);
        await dropOthers(next.api);
        return next;
    };

    // One change to the store at a time, in the order asked: the first build,
    // each rebuild, and each load or removal of a visitor's catalog. So a
    // visit's refresh racing a save, or a load racing a removal, cannot finish
    // out of order or undo the other.
    let building: Promise<unknown> = Promise.resolve();
    const serially = <T>(task: () => Promise<T>): Promise<T> => {
        const next = building.then(task, task);
        building = next.catch(() => undefined);
        return next;
    };

    /** Builds the store again, as a new version, and serves it from here on. */
    const rebuild = (): Promise<Built> => serially(buildAgain);

    const isApiRequest = (request: Request): boolean =>
        (request.method === 'GET' || request.method === 'POST') && isApiPath(request.url, base);

    const receive = async (request: Request): Promise<Response> => {
        if (!events) return json(404, { errors: [{ message: 'this store keeps no events' }] });
        const receipt = await receiveEvents(
            {
                method: request.method,
                body: await request.text(),
                header: (name) => request.headers.get(name),
            },
            events
        );
        if (receipt.status === 204) return new Response(null, { status: 204 });
        return json(receipt.status, { errors: [{ message: receipt.message }] });
    };

    /** The rules path: read, replace or reset the saved set, rebuilding the store on a change. */
    const receiveRuleSet = async (request: Request): Promise<Response> => {
        if (!rules) return json(404, { errors: [{ message: 'this store keeps no rules' }] });
        const current = await load();
        const { rules: shippedRules } = await download();
        const receipt = await receiveRules(
            { method: request.method, body: await request.text() },
            rules,
            {
                shipped: shippedRules,
                // The engine's own check, the same one a preview runs, so a set
                // that previews is a set that saves.
                check: (draft) => {
                    current.model.engine.reconfigure({ rules: draft });
                },
            }
        );
        if (receipt.status === 200) return json(200, receipt.body);
        if (receipt.status !== 204) {
            return json(receipt.status, { errors: [{ message: receipt.message }] });
        }
        const served = receipt.changed ? await rebuild() : current;
        return new Response(null, {
            status: 204,
            headers: { [VERSION_HEADER]: served.api.version },
        });
    };

    const load = (): Promise<Built> => {
        if (store) return store;
        const first = serially(async () => {
            const { signals, saved } = await inputs();
            return build(signals, saved);
        });
        store = first;
        // Let the next request try again rather than remembering the failure,
        // unless something already put another store in its place.
        first.catch(() => {
            if (store === first) store = undefined;
        });
        return first;
    };

    /** Drops every kept answer that is not for this version, or every one without a version. */
    const dropOthers = async (api: StoreApi | undefined) => {
        if (!answers) return;
        const kept = await answers();
        for (const request of await kept.keys()) {
            if (new URL(request.url).searchParams.get('v') !== api?.version) {
                await kept.delete(request);
            }
        }
    };

    /** Clears a visitor's catalog and everything made from it, rules, clicks and answers. */
    /**
     * Whether a change would discard rules the visitor saved. Asked inside the
     * same turn as the change, so a rule saved in another tab a moment before
     * is never discarded without the visitor having said so.
     */
    const discardsRules = async (discard: boolean) => {
        if (discard) return false;
        const saved = await rules?.current();
        return saved !== undefined && saved.length > 0;
    };

    const removeCatalog = (held: CatalogStore, discard: boolean) =>
        serially(async (): Promise<typeof KEEPS_RULES | undefined> => {
            if (await discardsRules(discard)) return KEEPS_RULES;
            await held.clear();
            await rules?.reset();
            await forgetEvents?.();
            shipped = undefined;
            store = undefined;
            await dropOthers(undefined);
            return undefined;
        });

    /**
     * Keeps a new catalog and builds from it, with the rules and clicks of the
     * last one forgotten, since they name its products. A catalog the store
     * cannot be built from is not kept: the last one and its rules come back,
     * and the reason is the answer.
     */
    const loadCatalog = (
        held: CatalogStore,
        catalog: Catalog,
        options: { timing: { buildMs: number }; discard: boolean }
    ) =>
        serially(async (): Promise<Built | string | typeof KEEPS_RULES> => {
            if (await discardsRules(options.discard)) return KEEPS_RULES;
            const { timing } = options;
            const began = performance.now();
            const done = () => {
                timing.buildMs = performance.now() - began;
            };
            const [previous, previousRules] = await Promise.all([held.current(), rules?.current()]);
            await held.replace(catalog);
            await rules?.reset();
            await forgetEvents?.();
            shipped = undefined;
            try {
                const built = await buildAgain();
                done();
                return built;
            } catch (error) {
                await (previous ? held.replace(previous) : held.clear());
                if (previousRules) await rules?.replace(previousRules);
                shipped = undefined;
                const reason = error instanceof Error ? error.message : 'it could not be read';
                return `the store could not be built from this catalog: ${reason}`;
            }
        });

    /** The answer to a change refused because it would discard the visitor's saved rules. */
    const rulesKept = () =>
        json(409, {
            errors: [
                {
                    message:
                        'this would discard the rules you saved, so it was not done. Ask again with discard-rules=yes to go ahead',
                    code: 'saved-rules',
                },
            ],
        });

    /** The catalog path: say what is loaded, load a new catalog, or remove it. */
    const receiveCatalog = async (held: CatalogStore, request: Request): Promise<Response> => {
        if (request.method === 'GET') {
            const kept = await held.current();
            if (!kept) return noCatalog();
            return json(200, {
                version: kept.version,
                products: kept.products.length,
                memberPrices: hasMemberPrices(kept.products),
            });
        }
        // A change that would discard the visitor's saved rules is refused
        // unless the request says the visitor agreed, so the page asks then.
        const discard = new URL(request.url).searchParams.get('discard-rules') === 'yes';
        if (request.method === 'DELETE') {
            const removed = await removeCatalog(held, discard);
            return removed === KEEPS_RULES ? rulesKept() : new Response(null, { status: 204 });
        }
        if (request.method !== 'PUT') {
            return json(405, {
                errors: [{ message: 'the catalog path takes GET, PUT and DELETE' }],
            });
        }
        // The worker's own work is timed, reading, checking and versioning the
        // catalog and building the store, without the transfer of the body or a
        // wait behind another build, and said in a Server-Timing header. A browser
        // cannot slow a worker, so the benchmark scales this share itself.
        const body = await request.text();
        const began = performance.now();
        let catalog: Catalog;
        try {
            catalog = withContentVersion(checkCatalog(JSON.parse(body)));
        } catch (error) {
            return json(400, {
                errors: [{ message: error instanceof Error ? error.message : 'not a catalog' }],
            });
        }
        const readMs = performance.now() - began;
        const timing = { buildMs: 0 };
        const result = await loadCatalog(held, catalog, { timing, discard });
        if (result === KEEPS_RULES) return rulesKept();
        if (typeof result === 'string') return json(400, { errors: [{ message: result }] });
        return new Response(null, {
            status: 204,
            headers: {
                [VERSION_HEADER]: result.api.version,
                'server-timing': `catalog;dur=${(readMs + timing.buildMs).toFixed(1)}`,
            },
        });
    };

    const answer = async (request: Request): Promise<Response> => {
        const resolved = resolveRequest(
            {
                method: request.method,
                url: request.url,
                body: request.method === 'POST' ? await request.text() : undefined,
                header: (name) => request.headers.get(name),
            },
            { persisted: PERSISTED_OPERATIONS, persistedOnly: !allowFullQueries }
        );
        if (resolved.kind === 'refused') {
            return json(resolved.status, { errors: [{ message: resolved.message }] });
        }
        let api: StoreApi;
        try {
            api = (await load()).api;
        } catch (error) {
            if (error instanceof NoCatalogError) return noCatalog();
            return json(503, { errors: [{ message: 'the store is not ready' }] });
        }
        const now = new Date();
        const response = await api.run(resolved.request, resolved.viewer, now);
        return json(
            200,
            response,
            responseHeaders({ version: api.version, now, expected: resolved.expected, response })
        );
    };

    return {
        warm: async () => {
            try {
                await dropOthers((await load()).api);
            } catch (error) {
                // A visitor's page with nothing loaded yet has nothing to warm.
                if (!(error instanceof NoCatalogError)) throw error;
            }
            return startup;
        },
        refresh: async () => {
            // A store still being built was built from the clicks as they were a
            // moment ago, which is as fresh as a visit needs.
            if (store === undefined) return false;
            const current = await served();
            if (fingerprint(await clicks()) === current?.from.clicks) return false;
            // The old store keeps answering until the new one is ready, and stays
            // if the new one cannot be built.
            await rebuild();
            return true;
        },
        handle: async (request) => {
            if (catalogs && isCatalogPath(request.url, base))
                return receiveCatalog(catalogs, request);
            if (isEventsPath(request.url, base)) return receive(request);
            if (isRulesPath(request.url, base)) {
                return receiveRuleSet(request).catch((error: unknown) => {
                    if (error instanceof NoCatalogError) return noCatalog();
                    throw error;
                });
            }
            if (!isApiRequest(request)) return undefined;
            const kept = request.method === 'GET' && answers ? await answers() : undefined;
            const held = await kept?.match(request);
            if (held && fresh(held, new Date())) return held;
            const response = await answer(request);
            // Kept only while the store that made it is still the one served, so
            // an answer that finishes after its catalog was replaced or removed
            // is not put back among the kept ones.
            const still = (await served())?.api.version === response.headers.get(VERSION_HEADER);
            if (kept && mayKeep(response) && still) await kept.put(request, response.clone());
            return response;
        },
    };
};
