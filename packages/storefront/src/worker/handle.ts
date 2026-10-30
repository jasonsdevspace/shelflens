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
 */

export interface WorkerApiOptions {
    /** Where the catalog JSON is served from. */
    readonly catalogUrl: string;
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

const fetchJson = async <T>(fetchImpl: typeof fetch, url: string, what: string): Promise<T> => {
    const response = await fetchImpl(url);
    if (!response.ok) throw new Error(`the ${what} came back with status ${response.status}`);
    return response.json() as Promise<T>;
};

export const createWorkerApi = ({
    catalogUrl,
    rulesUrl,
    base = '/',
    fetch: fetchImpl = fetch,
    allowFullQueries = false,
    answers,
    events,
    rules,
}: WorkerApiOptions): WorkerApi => {
    let store: Promise<Built> | undefined;
    let startup: Startup = { downloadMs: 0, buildMs: 0 };
    /** The clicks the store being served was built with, as a fingerprint. */
    let built = '';
    /** The catalog and the shipped rules, downloaded once and kept for every build. */
    let shipped: Promise<{ catalog: Catalog; rules: readonly Rule[] }> | undefined;

    /** How often each product was clicked, from everything collected so far. */
    const clicks = async () => signalsOf(events ? await events.all() : []);

    const download = () => {
        shipped ??= Promise.all([
            fetchJson<Catalog>(fetchImpl, catalogUrl, 'catalog'),
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

    /**
     * A store from the catalog, the rules in effect, saved or shipped, and
     * these signals, timed for the cold visit.
     */
    const build = async (signals: Signals): Promise<Built> => {
        const began = performance.now();
        const [{ catalog, rules: shippedRules }, saved] = await Promise.all([
            download(),
            rules?.current(),
        ]);
        const downloaded = performance.now();
        const model = createStore({
            catalog,
            rules: saved ?? shippedRules,
            rulesEdited: saved !== undefined,
            signals,
        });
        const api = withResponseCache(createStoreApi(model, { events }));
        startup = { downloadMs: downloaded - began, buildMs: performance.now() - downloaded };
        return { api, model };
    };

    const buildAgain = async (): Promise<Built> => {
        const signals = await clicks();
        const next = await build(signals);
        store = Promise.resolve(next);
        built = fingerprint(signals);
        await dropOthers(next.api);
        return next;
    };
    // One build at a time, in the order asked, so a visit's refresh racing a save
    // cannot finish last with a store built from the rules before the save.
    let building: Promise<void> = Promise.resolve();
    /** Builds the store again, as a new version, and serves it from here on. */
    const rebuild = (): Promise<Built> => {
        const next = building.then(buildAgain, buildAgain);
        building = next.then(
            () => undefined,
            () => undefined
        );
        return next;
    };

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
        store ??= clicks()
            .then((signals) => {
                built = fingerprint(signals);
                return build(signals);
            })
            .catch((error: unknown) => {
                // Let the next request try again rather than remembering the failure.
                store = undefined;
                throw error;
            });
        return store;
    };

    /** Drops every kept answer that is not for this store's version. */
    const dropOthers = async (api: StoreApi) => {
        if (!answers) return;
        const kept = await answers();
        for (const request of await kept.keys()) {
            if (new URL(request.url).searchParams.get('v') !== api.version) {
                await kept.delete(request);
            }
        }
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
        } catch {
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
            await dropOthers((await load()).api);
            return startup;
        },
        refresh: async () => {
            // A store still being built was built from the clicks as they were a
            // moment ago, which is as fresh as a visit needs.
            if (store === undefined) return false;
            await store;
            if (fingerprint(await clicks()) === built) return false;
            // The old store keeps answering until the new one is ready, and stays
            // if the new one cannot be built.
            await rebuild();
            return true;
        },
        handle: async (request) => {
            if (isEventsPath(request.url, base)) return receive(request);
            if (isRulesPath(request.url, base)) return receiveRuleSet(request);
            if (!isApiRequest(request)) return undefined;
            const kept = request.method === 'GET' && answers ? await answers() : undefined;
            const held = await kept?.match(request);
            if (held && fresh(held, new Date())) return held;
            const response = await answer(request);
            if (kept && mayKeep(response)) await kept.put(request, response.clone());
            return response;
        },
    };
};
