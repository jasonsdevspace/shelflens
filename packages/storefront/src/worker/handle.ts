import {
    createStoreHost,
    type EventStore,
    type HostedStore,
    isApiPath,
    isEventsPath,
    isRulesPath,
    parseCatalogFile,
    parseRulesFile,
    PERSISTED_OPERATIONS,
    receiveEvents,
    resolveRequest,
    responseHeaders,
    type RuleStore,
    type Startup,
    type StoreApi,
    VERSION_HEADER,
    withContentVersion,
} from '@shelflens/api';
import type { Catalog } from '@shelflens/catalog';

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

/** What the worker tells the page once it is in charge of it. */
export interface StartedMessage extends Startup {
    readonly type: 'shelflens:started';
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
    /**
     * The visitor's catalog as last read or loaded, so a file just loaded is
     * built from the catalog in hand rather than read back from IndexedDB.
     */
    let inHand: Catalog | undefined;

    /** The catalog to build from: the visitor's, when there is a store of them, or the site's. */
    const catalogNow = async (): Promise<Catalog> => {
        if (catalogs) {
            inHand ??= await catalogs.current();
            if (!inHand) throw new NoCatalogError();
            return inHand;
        }
        if (catalogUrl === undefined) throw new Error('the worker was given no catalog to serve');
        return fetchJson<Catalog>(fetchImpl, catalogUrl, 'catalog');
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

    // The store itself is the API package's host, as on every other host. What is
    // the worker's own is how requests arrive, the answers it keeps, and the catalog
    // a visitor loads.
    const host = createStoreHost({
        source: async () => {
            const [catalog, shipped] = await Promise.all([
                catalogNow(),
                rulesUrl === undefined
                    ? Promise.resolve([])
                    : fetchJson<unknown>(fetchImpl, rulesUrl, 'rules file').then(parseRulesFile),
            ]);
            return { catalog, rules: shipped };
        },
        events,
        rules,
        onServed: dropOthers,
    });

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

    /** The rules path: read, replace or reset the saved set, building again on a change. */
    const receiveRuleSet = async (request: Request): Promise<Response> => {
        const answer = await host.receiveRules({
            method: request.method,
            body: await request.text(),
        });
        if (answer.status === 200) return json(200, answer.body);
        if (answer.status !== 204) {
            return json(answer.status, { errors: [{ message: answer.message }] });
        }
        return new Response(null, {
            status: 204,
            headers: answer.version === undefined ? {} : { [VERSION_HEADER]: answer.version },
        });
    };

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

    /** Clears a visitor's catalog and everything made from it, rules, clicks and answers. */
    const removeCatalog = (held: CatalogStore, discard: boolean) =>
        host.change(async (): Promise<typeof KEEPS_RULES | undefined> => {
            if (await discardsRules(discard)) return KEEPS_RULES;
            await held.clear();
            inHand = undefined;
            await rules?.reset();
            await forgetEvents?.();
            host.clear();
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
        host.change(async (rebuild): Promise<HostedStore | string | typeof KEEPS_RULES> => {
            const [previous, previousRules] = await Promise.all([
                inHand ?? held.current(),
                rules?.current(),
            ]);
            // The same file again names the same products, so its rules and clicks still hold.
            const same = previous?.version === catalog.version;
            if (!same && (await discardsRules(options.discard))) return KEEPS_RULES;
            const began = performance.now();
            await held.replace(catalog);
            inHand = catalog;
            if (!same) {
                await rules?.reset();
                await forgetEvents?.();
            }
            host.forgetSource();
            try {
                const built = await rebuild();
                options.timing.buildMs = performance.now() - began;
                return built;
            } catch (error) {
                // Back in hand first, so the next build is from the last catalog that
                // worked even if putting it back in the database fails.
                inHand = previous;
                host.forgetSource();
                await (previous ? held.replace(previous) : held.clear());
                if (previousRules) await rules?.replace(previousRules);
                const reason = error instanceof Error ? error.message : 'it could not be read';
                return `the catalog could not be built: ${reason}`;
            }
        });
    /** The answer to a change refused because it would discard the visitor's saved rules. */
    const rulesKept = () =>
        json(409, {
            errors: [
                {
                    message:
                        'this would discard the rules you saved, so nothing changed. Reload the page to be asked first',
                    code: 'saved-rules',
                },
            ],
        });

    /** The catalog path: say what is loaded, load a new catalog, or remove it. */
    const receiveCatalog = async (held: CatalogStore, request: Request): Promise<Response> => {
        if (request.method === 'GET') {
            // The catalog in hand, so what this says is loaded is what the store is built from.
            inHand ??= await held.current();
            const kept = inHand;
            if (!kept) return noCatalog();
            return json(200, { version: kept.version, products: kept.products.length });
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
            catalog = withContentVersion(parseCatalogFile(JSON.parse(body)));
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
            api = (await host.current()).api;
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
                await host.current();
            } catch (error) {
                // A visitor's page with nothing loaded yet has nothing to warm.
                if (!(error instanceof NoCatalogError)) throw error;
            }
            return host.startup();
        },
        refresh: () => host.refresh(),
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
            const still =
                (await host.served())?.api.version === response.headers.get(VERSION_HEADER);
            if (kept && mayKeep(response) && still) await kept.put(request, response.clone());
            return response;
        },
    };
};
